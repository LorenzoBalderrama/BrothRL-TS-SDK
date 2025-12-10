import { Policy } from '../../domain/base/Policy';
import { PolicyConfig, PolicyDecision } from '../../domain/interfaces/IPolicy';
import { IPolicyStorage } from '../../domain/interfaces/IPolicyStorage';
import { State } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';
import { MemoryStorage } from '../storage/MemoryStorage';

/**
 * Statistics for each arm (action) in a given context
 */
export interface ArmStats {
  pulls: number;
  totalReward: number;
  averageReward: number;
}

export interface ContextualBanditConfig extends PolicyConfig {
  initialReward?: number;
  confidenceBonus?: number;
  useUCB?: boolean;
  /** 
   * Optional storage provider. Defaults to MemoryStorage.
   * Inject a Redis adapter here for Enterprise mode.
   */
  storage?: IPolicyStorage;
}

/**
 * Contextual Bandit implementation (Stateless / Async)
 */
export class ContextualBandit extends Policy {
  private banditConfig: Required<Omit<ContextualBanditConfig, 'storage'>>;
  private storage: IPolicyStorage;

  constructor(config: ContextualBanditConfig) {
    super(config);

    this.banditConfig = {
      initialReward: config.initialReward ?? 0.0,
      confidenceBonus: config.confidenceBonus ?? 2.0,
      useUCB: config.useUCB ?? true,
      // Policy defaults are handled by super
      learningRate: config.learningRate ?? 0.1,
      explorationRate: config.explorationRate ?? 0.1,
      minExplorationRate: config.minExplorationRate ?? 0.01,
      explorationDecay: config.explorationDecay ?? 0.995,
      seed: config.seed ?? Date.now(),
      actionSpace: config.actionSpace,
      repetitionPenalty: config.repetitionPenalty ?? 1.0,
      lookbackWindow: config.lookbackWindow ?? 2,
    };

    // dependency injection for storage
    this.storage = config.storage || new MemoryStorage();
  }

  /**
   * Select an action given the current state
   */
  async selectAction(state: State): Promise<Action> {
    this.incrementStep();

    if (this.shouldExplore()) {
      return this.selectRandomAction();
    }

    const { bestAction } = await this.calculateBestAction(state);
    return bestAction;
  }

  /**
   * Analyze the decision process for a given state
   */
  async analyzeAction(state: State): Promise<PolicyDecision> {
    const { bestAction, values } = await this.calculateBestAction(state);
    
    // Sort alternatives by score descending
    const alternatives = values
      .sort((a, b) => b.value - a.value)
      .map(v => ({
        action: v.action,
        score: v.value,
        reason: `Estimated reward: ${v.value.toFixed(4)}`
      }));

    return {
      action: bestAction,
      explanation: {
        reason: `Selected action with highest estimated reward (${alternatives[0].score.toFixed(4)})`,
        confidence: 1.0, // Bandits don't inherently have probability confidence like classifiers, but UCB gap could be a proxy.
        features: {
          contextKey: 1 // Simple feature map for now
        },
        alternatives
      }
    };
  }

  /**
   * Helper to calculate values for all actions
   */
  private async calculateBestAction(state: State): Promise<{ bestAction: Action, values: { action: Action, value: number }[] }> {
    const context = state.getContextKey();
    const actions = this.actionSpace.getAllActions();

    // In a stateless design, we must fetch stats for all candidate actions
    const actionValues = await Promise.all(
      actions.map(async action => {
        let value = await this.getActionValue(context, action.type);
        
        // Apply repetition penalty
        value -= this.getRepetitionPenalty(action.type, state);
        
        return { action, value };
      })
    );

    let bestAction = actions[0];
    let bestValue = -Infinity;

    for (const item of actionValues) {
      if (item.value > bestValue) {
        bestValue = item.value;
        bestAction = item.action;
      }
    }

    return { bestAction, values: actionValues };
  }


  /**
   * Get the estimated value of an action in a context
   */
  private async getActionValue(context: string, actionType: string): Promise<number> {
    const stats = await this.getArmStats(context, actionType);

    if (stats.pulls === 0) {
      return this.banditConfig.initialReward;
    }

    if (this.banditConfig.useUCB) {
      const totalPulls = await this.getContextTotalPulls(context);

      if (totalPulls === 0) {
        return this.banditConfig.initialReward;
      }

      const exploration = this.banditConfig.confidenceBonus *
        Math.sqrt(Math.log(totalPulls) / stats.pulls);

      return stats.averageReward + exploration;
    }

    return stats.averageReward;
  }

  /**
   * Update the policy based on observed reward
   */
  async update(state: State, action: Action, reward: number): Promise<void> {
    const context = state.getContextKey();
    const actionType = action.type;

    // 1. Get current stats
    const stats = await this.getArmStats(context, actionType);

    // 2. Update values
    stats.pulls += 1;
    stats.totalReward += reward;
    stats.averageReward = stats.totalReward / stats.pulls;

    // 3. Save back to storage
    await this.saveArmStats(context, actionType, stats);
    await this.incrementContextTotalPulls(context);
  }

  // --- Storage Helpers ---

  private getStorageKey(context: string, actionType: string): string {
    return `bandit:arm:${context}:${actionType}`;
  }

  private getContextKey(context: string): string {
    return `bandit:context:${context}`;
  }

  private async getArmStats(context: string, actionType: string): Promise<ArmStats> {
    const key = this.getStorageKey(context, actionType);
    const stats = await this.storage.get<ArmStats>(key);

    return stats || {
      pulls: 0,
      totalReward: 0,
      averageReward: this.banditConfig.initialReward,
    };
  }

  private async saveArmStats(context: string, actionType: string, stats: ArmStats): Promise<void> {
    const key = this.getStorageKey(context, actionType);
    await this.storage.set(key, stats);
  }

  private async getContextTotalPulls(context: string): Promise<number> {
    const key = this.getContextKey(context);
    const data = await this.storage.get<{ totalPulls: number }>(key);
    return data?.totalPulls || 0;
  }

  private async incrementContextTotalPulls(context: string): Promise<void> {
    const key = this.getContextKey(context);
    const current = await this.getContextTotalPulls(context);
    await this.storage.set(key, { totalPulls: current + 1 });
  }

  /**
   * Reset is now a dangerous operation in production
   */
  async reset(): Promise<void> {
    await super.reset();
    await this.storage.clear();
  }

  async toJSON(): Promise<any> {
    const weights = this.storage.export ? await this.storage.export() : {};
    return {
      config: this.banditConfig,
      weights
    };
  }

  async fromJSON(json: any): Promise<void> {
    if (json.config) {
      Object.assign(this.banditConfig, json.config);
    }
    if (json.weights && this.storage.import) {
      await this.storage.import(json.weights);
    }
  }
}

