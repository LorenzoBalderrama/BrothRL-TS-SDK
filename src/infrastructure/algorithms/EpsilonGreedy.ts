import { Policy } from '../../domain/base/Policy';
import { PolicyConfig } from '../../domain/interfaces/IPolicy';
import { State } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Epsilon-greedy exploration strategy configuration
 */
export interface EpsilonGreedyConfig extends PolicyConfig {
  /** Initial exploration rate */
  epsilon?: number;

  /** Minimum exploration rate */
  epsilonMin?: number;

  /** Exploration decay rate per step */
  epsilonDecay?: number;

  /** The underlying policy to use for exploitation */
  basePolicy?: Policy;
}

/**
 * Epsilon-Greedy Strategy
 * 
 * A simple exploration strategy that:
 * - With probability epsilon: explores (random action)
 * - With probability 1-epsilon: exploits (uses base policy)
 * 
 * Epsilon decays over time to transition from exploration to exploitation.
 */
export class EpsilonGreedy extends Policy {
  private epsilon: number;
  private epsilonMin: number;
  private epsilonDecay: number;
  private basePolicy: Policy | null;

  constructor(config: EpsilonGreedyConfig) {
    super(config);

    this.epsilon = config.epsilon ?? config.explorationRate ?? 0.1;
    this.epsilonMin = config.epsilonMin ?? config.minExplorationRate ?? 0.01;
    this.epsilonDecay = config.epsilonDecay ?? config.explorationDecay ?? 0.995;
    this.basePolicy = config.basePolicy ?? null;
  }

  /**
   * Set the base policy for exploitation
   */
  setBasePolicy(policy: Policy): void {
    this.basePolicy = policy;
  }

  /**
   * Get current epsilon value
   */
  getEpsilon(): number {
    return this.epsilon;
  }

  /**
   * Select action using epsilon-greedy strategy
   */
  async selectAction(state: State): Promise<Action> {
    this.incrementStep();

    // Explore with probability epsilon
    if (Math.random() < this.epsilon) {
      return this.selectRandomAction();
    }

    // Exploit using base policy
    if (this.basePolicy) {
      const action = this.basePolicy.selectAction(state);
      return action instanceof Promise ? await action : action;
    }

    // Fallback to random if no base policy
    return this.selectRandomAction();
  }

  /**
   * Update the policy (delegates to base policy)
   */
  update(state: State, action: Action, reward: number): void {
    // Decay epsilon
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);

    // Update base policy if available
    if (this.basePolicy) {
      this.basePolicy.update(state, action, reward);
    }
  }

  /**
   * Manually set epsilon (useful for testing or scheduled exploration)
   */
  setEpsilon(epsilon: number): void {
    this.epsilon = Math.max(this.epsilonMin, Math.min(1.0, epsilon));
  }

  /**
   * Reset epsilon to initial value
   */
  resetEpsilon(): void {
    this.epsilon = this.config.explorationRate ?? 0.1;
  }

  /**
   * Serialize to JSON
   */
  toJSON(): any {
    return {
      epsilon: this.epsilon,
      epsilonMin: this.epsilonMin,
      epsilonDecay: this.epsilonDecay,
      stepCount: this.stepCount,
      basePolicy: this.basePolicy ? this.basePolicy.toJSON() : null,
    };
  }

  /**
   * Deserialize from JSON
   */
  fromJSON(json: any): void {
    if (json.epsilon !== undefined) {
      this.epsilon = json.epsilon;
    }
    if (json.epsilonMin !== undefined) {
      this.epsilonMin = json.epsilonMin;
    }
    if (json.epsilonDecay !== undefined) {
      this.epsilonDecay = json.epsilonDecay;
    }
    if (json.stepCount !== undefined) {
      this.stepCount = json.stepCount;
    }
    if (json.basePolicy && this.basePolicy) {
      this.basePolicy.fromJSON(json.basePolicy);
    }
  }

  /**
   * Get statistics
   */
  getStats(): Record<string, any> {
    const baseStats = super.getStats();

    return {
      ...baseStats,
      epsilon: this.epsilon,
      epsilonMin: this.epsilonMin,
      epsilonDecay: this.epsilonDecay,
      basePolicyStats: this.basePolicy ? this.basePolicy.getStats() : null,
    };
  }

  /**
   * Reset the policy
   */
  reset(): void {
    super.reset();
    this.resetEpsilon();
    if (this.basePolicy) {
      this.basePolicy.reset();
    }
  }
}

