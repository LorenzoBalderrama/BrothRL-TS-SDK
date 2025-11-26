import { Policy } from '../../domain/base/Policy';
import { PolicyConfig } from '../../domain/interfaces/IPolicy';
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
      // ... other Policy defaults handled by super
      learningRate: config.learningRate ?? 0.1,
      explorationRate: config.explorationRate ?? 0.1,
      minExplorationRate: config.minExplorationRate ?? 0.01,
      explorationDecay: config.explorationDecay ?? 0.995,
      seed: config.seed ?? Date.now(),
      actionSpace: config.actionSpace
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

    return this.selectBestAction(state);
  }

  /**
   * Select the best action for a given state by querying storage
   */
  private async selectBestAction(state: State): Promise<Action> {
    const context = state.getContextKey();
    const actions = this.actionSpace.getAllActions();

    let bestAction = actions[0];
    let bestValue = -Infinity;

    // In a stateless design, we must fetch stats for all candidate actions
    // Optimization: In the future, we could use MGET (Redis) to fetch all at once
    const actionValues = await Promise.all(
      actions.map(action => this.getActionValue(context, action.type))
    );

    for (let i = 0; i < actions.length; i++) {
      if (actionValues[i] > bestValue) {
        bestValue = actionValues[i];
        bestAction = actions[i];
      }
    }

    return bestAction;
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
    // Note: In a high-concurrency distributed env, this should ideally be an atomic Lua script
    // but for this phase, read-modify-write is acceptable.
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
    super.reset();
    await this.storage.clear();
  }

  // Note: toJSON and fromJSON are less relevant in the storage-backed model
  // but can be kept for config serialization.
  toJSON(): any {
    return { config: this.banditConfig };
  }

  fromJSON(json: any): void {
    if (json.config) Object.assign(this.banditConfig, json.config);
  }
}
