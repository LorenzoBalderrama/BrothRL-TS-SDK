/**
 * Reward signal for reinforcement learning
 */
export interface RewardSignal {
  /** The reward value (typically between -1 and 1) */
  value: number;
  
  /** Type of reward (immediate or delayed) */
  type: 'immediate' | 'delayed';
  
  /** Source of the reward */
  source: string;
  
  /** Optional metadata about the reward */
  metadata?: Record<string, any>;
}

/**
 * Outcome of a conversation (for computing delayed rewards)
 */
export interface ConversationOutcome {
  /** Whether the conversation was successful */
  success: boolean;
  
  /** Specific outcome type */
  outcomeType?: string;
  
  /** Metrics associated with the outcome */
  metrics?: {
    duration?: number;
    userSatisfaction?: number;
    goalAchieved?: boolean;
    [key: string]: any;
  };
}

/**
 * Configuration for reward calculation
 */
export interface RewardConfig {
  /** Weight for immediate rewards */
  immediateWeight?: number;
  
  /** Weight for delayed rewards */
  delayedWeight?: number;
  
  /** Discount factor for future rewards */
  discountFactor?: number;
  
  /** Custom reward functions */
  customRewards?: Record<string, (state: any, action: any, outcome: any) => number>;
}

/**
 * Reward calculator for RL agents
 */
export class Reward {
  private config: Required<RewardConfig>;

  constructor(config: RewardConfig = {}) {
    this.config = {
      immediateWeight: config.immediateWeight ?? 0.3,
      delayedWeight: config.delayedWeight ?? 0.7,
      discountFactor: config.discountFactor ?? 0.99,
      customRewards: config.customRewards ?? {},
    };
  }

  /**
   * Calculate immediate reward (given right after an action)
   * @param state The state before the action
   * @param action The action taken
   * @param feedback Immediate feedback (e.g., user sentiment)
   */
  calculateImmediate(state: any, _action: any, feedback?: Record<string, any>): RewardSignal {
    let reward = 0;

    // Example: Reward based on user sentiment
    if (feedback?.sentiment === 'positive') {
      reward += 0.5;
    } else if (feedback?.sentiment === 'negative') {
      reward -= 0.5;
    }

    // Penalize very long conversations
    if (state.turnNumber > 20) {
      reward -= 0.1;
    }

    return {
      value: this.normalize(reward),
      type: 'immediate',
      source: 'immediate_feedback',
      metadata: feedback,
    };
  }

  /**
   * Calculate delayed reward (given at the end of conversation)
   * @param outcome The outcome of the conversation
   */
  calculateDelayed(outcome: ConversationOutcome): RewardSignal {
    let reward = 0;

    // Base reward for success/failure
    reward += outcome.success ? 1.0 : -1.0;

    // Bonus for user satisfaction
    if (outcome.metrics?.userSatisfaction) {
      reward += (outcome.metrics.userSatisfaction - 0.5) * 0.5;
    }

    // Bonus for goal achievement
    if (outcome.metrics?.goalAchieved) {
      reward += 0.5;
    }

    // Penalty for very long duration
    if (outcome.metrics?.duration && outcome.metrics.duration > 600) {
      reward -= 0.2;
    }

    return {
      value: this.normalize(reward),
      type: 'delayed',
      source: 'conversation_outcome',
      metadata: outcome.metrics,
    };
  }

  /**
   * Combine multiple reward signals
   * @param signals Array of reward signals
   */
  combine(signals: RewardSignal[]): number {
    let totalReward = 0;

    for (const signal of signals) {
      const weight = signal.type === 'immediate' 
        ? this.config.immediateWeight 
        : this.config.delayedWeight;
      
      totalReward += signal.value * weight;
    }

    return this.normalize(totalReward);
  }

  /**
   * Apply discount to future rewards
   * @param reward The reward value
   * @param steps Number of steps into the future
   */
  discount(reward: number, steps: number): number {
    return reward * Math.pow(this.config.discountFactor, steps);
  }

  /**
   * Normalize reward to [-1, 1] range
   * @param reward Raw reward value
   */
  normalize(reward: number): number {
    return Math.max(-1, Math.min(1, reward));
  }

  /**
   * Calculate custom reward using registered function
   * @param name Name of the custom reward
   * @param state State
   * @param action Action
   * @param outcome Outcome
   */
  calculateCustom(name: string, state: any, action: any, outcome: any): number {
    const fn = this.config.customRewards[name];
    if (!fn) {
      throw new Error(`Custom reward function '${name}' not found`);
    }
    return this.normalize(fn(state, action, outcome));
  }

  /**
   * Register a custom reward function
   * @param name Name for the reward function
   * @param fn The reward function
   */
  registerCustomReward(name: string, fn: (state: any, action: any, outcome: any) => number): void {
    this.config.customRewards[name] = fn;
  }
}

