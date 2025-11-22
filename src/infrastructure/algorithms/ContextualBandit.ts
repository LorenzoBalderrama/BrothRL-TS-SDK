import { Policy } from '../../domain/base/Policy';
import { PolicyConfig } from '../../domain/interfaces/IPolicy';
import { State } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Statistics for each arm (action) in a given context
 */
interface ArmStats {
  /** Number of times this arm was pulled */
  pulls: number;

  /** Sum of rewards received */
  totalReward: number;

  /** Average reward */
  averageReward: number;
}

/**
 * Contextual Bandit configuration
 */
export interface ContextualBanditConfig extends PolicyConfig {
  /** Initial reward estimate for unseen action-context pairs */
  initialReward?: number;

  /** Confidence bonus for upper confidence bound */
  confidenceBonus?: number;

  /** Whether to use UCB (Upper Confidence Bound) instead of simple average */
  useUCB?: boolean;
}

/**
 * Contextual Bandit implementation
 * 
 * This algorithm maintains statistics for each action in different contexts.
 * It learns which actions work best in which situations.
 */
export class ContextualBandit extends Policy {
  private armStats: Map<string, Map<string, ArmStats>>;
  private banditConfig: Required<ContextualBanditConfig>;

  constructor(config: ContextualBanditConfig) {
    super(config);

    this.banditConfig = {
      ...this.config,
      initialReward: config.initialReward ?? 0.0,
      confidenceBonus: config.confidenceBonus ?? 2.0,
      useUCB: config.useUCB ?? true,
    };

    // Map: context -> action -> stats
    this.armStats = new Map();
  }

  /**
   * Select an action given the current state
   */
  selectAction(state: State): Action {
    this.incrementStep();

    // Epsilon-greedy exploration
    if (this.shouldExplore()) {
      return this.selectRandomAction();
    }

    // Exploit: select best action for this context
    return this.selectBestAction(state);
  }

  /**
   * Select the best action for a given state
   */
  private selectBestAction(state: State): Action {
    const context = state.getContextKey();
    const actions = this.actionSpace.getAllActions();

    let bestAction = actions[0];
    let bestValue = -Infinity;

    for (const action of actions) {
      const value = this.getActionValue(context, action.type);

      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Get the estimated value of an action in a context
   */
  private getActionValue(context: string, actionType: string): number {
    const stats = this.getArmStats(context, actionType);

    if (stats.pulls === 0) {
      return this.banditConfig.initialReward;
    }

    // Use UCB if enabled
    if (this.banditConfig.useUCB) {
      const contextStats = this.armStats.get(context);
      const totalPulls = contextStats
        ? Array.from(contextStats.values()).reduce((sum, s) => sum + s.pulls, 0)
        : 0;

      if (totalPulls === 0) {
        return this.banditConfig.initialReward;
      }

      // UCB1 formula: average + confidence bonus * sqrt(ln(total) / pulls)
      const exploration = this.banditConfig.confidenceBonus *
        Math.sqrt(Math.log(totalPulls) / stats.pulls);

      return stats.averageReward + exploration;
    }

    // Simple average
    return stats.averageReward;
  }

  /**
   * Update the policy based on observed reward
   */
  update(state: State, action: Action, reward: number): void {
    const context = state.getContextKey();
    const actionType = action.type;

    // Get or create stats
    const stats = this.getArmStats(context, actionType);

    // Update statistics
    stats.pulls += 1;
    stats.totalReward += reward;
    stats.averageReward = stats.totalReward / stats.pulls;

    // Store back
    this.setArmStats(context, actionType, stats);
  }

  /**
   * Get statistics for an action in a context
   */
  private getArmStats(context: string, actionType: string): ArmStats {
    if (!this.armStats.has(context)) {
      this.armStats.set(context, new Map());
    }

    const contextMap = this.armStats.get(context)!;

    if (!contextMap.has(actionType)) {
      contextMap.set(actionType, {
        pulls: 0,
        totalReward: 0,
        averageReward: this.banditConfig.initialReward,
      });
    }

    return contextMap.get(actionType)!;
  }

  /**
   * Set statistics for an action in a context
   */
  private setArmStats(context: string, actionType: string, stats: ArmStats): void {
    if (!this.armStats.has(context)) {
      this.armStats.set(context, new Map());
    }

    this.armStats.get(context)!.set(actionType, stats);
  }

  /**
   * Get all statistics (for debugging/analysis)
   */
  getAllStats(): Map<string, Map<string, ArmStats>> {
    return new Map(this.armStats);
  }

  /**
   * Get statistics for a specific context
   */
  getContextStats(context: string): Map<string, ArmStats> | undefined {
    return this.armStats.get(context);
  }

  /**
   * Get the best action for a given context (without exploration)
   */
  getBestActionForContext(context: string): { action: string; value: number } | null {
    const actions = this.actionSpace.getAllActions();

    let bestActionType = '';
    let bestValue = -Infinity;

    for (const action of actions) {
      const stats = this.getArmStats(context, action.type);
      if (stats.pulls > 0 && stats.averageReward > bestValue) {
        bestValue = stats.averageReward;
        bestActionType = action.type;
      }
    }

    return bestActionType ? { action: bestActionType, value: bestValue } : null;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): any {
    const armStatsObj: Record<string, Record<string, ArmStats>> = {};

    for (const [context, actionsMap] of this.armStats.entries()) {
      armStatsObj[context] = {};
      for (const [actionType, stats] of actionsMap.entries()) {
        armStatsObj[context][actionType] = stats;
      }
    }

    return {
      config: this.banditConfig,
      armStats: armStatsObj,
      stepCount: this.stepCount,
    };
  }

  /**
   * Load from JSON
   */
  fromJSON(json: any): void {
    if (json.config) {
      Object.assign(this.banditConfig, json.config);
    }

    if (json.stepCount !== undefined) {
      this.stepCount = json.stepCount;
    }

    if (json.armStats) {
      this.armStats.clear();

      for (const [context, actionsObj] of Object.entries(json.armStats)) {
        const actionsMap = new Map<string, ArmStats>();

        for (const [actionType, stats] of Object.entries(actionsObj as Record<string, ArmStats>)) {
          actionsMap.set(actionType, stats);
        }

        this.armStats.set(context, actionsMap);
      }
    }
  }

  /**
   * Get policy statistics
   */
  getStats(): Record<string, any> {
    const baseStats = super.getStats();

    return {
      ...baseStats,
      totalContexts: this.armStats.size,
      totalArmPulls: this.getTotalPulls(),
      config: {
        useUCB: this.banditConfig.useUCB,
        confidenceBonus: this.banditConfig.confidenceBonus,
        initialReward: this.banditConfig.initialReward,
      },
    };
  }

  /**
   * Get total number of arm pulls across all contexts
   */
  private getTotalPulls(): number {
    let total = 0;

    for (const actionsMap of this.armStats.values()) {
      for (const stats of actionsMap.values()) {
        total += stats.pulls;
      }
    }

    return total;
  }

  /**
   * Reset the policy
   */
  reset(): void {
    super.reset();
    this.armStats.clear();
  }
}

