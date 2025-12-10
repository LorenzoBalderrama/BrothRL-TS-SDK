import { State } from '../entities/State';
import { Action, ActionSpace } from '../entities/Action';

/**
 * Explanation for a policy decision
 */
export interface PolicyDecision {
  action: Action;
  explanation: {
    reason: string;
    confidence: number;
    features: Record<string, number>; // Feature importance or values used
    alternatives: Array<{
      action: Action;
      score: number;
      reason?: string;
    }>;
  };
}

/**
 * Base interface for RL policies
 */
export interface IPolicy {
  /**
   * Select an action given the current state
   * @param state Current conversation state
   * @returns The selected action
   */
  selectAction(state: State): Action | Promise<Action>;

  /**
   * Select an action and return a detailed explanation of the decision
   * @param state Current conversation state
   */
  analyzeAction(state: State): PolicyDecision | Promise<PolicyDecision>;

  /**
   * Update the policy based on observed reward
   * @param state The state where action was taken
   * @param action The action that was taken
   * @param reward The observed reward
   */
  update(state: State, action: Action, reward: number): void | Promise<void>;

  /**
   * Get the action space
   */
  getActionSpace(): ActionSpace;

  /**
   * Serialize the policy to JSON
   */
  toJSON(): any;

  /**
   * Load policy from JSON
   */
  fromJSON(json: any): void;

  /**
   * Reset the policy state
   */
  reset(): Promise<void> | void;
}

/**
 * Policy configuration
 */
export interface PolicyConfig {
  /** Action space for the policy */
  actionSpace: ActionSpace;
  
  /** Learning rate */
  learningRate?: number;
  
  /** Exploration rate (for epsilon-greedy) */
  explorationRate?: number;
  
  /** Minimum exploration rate */
  minExplorationRate?: number;
  
  /** Exploration decay rate */
  explorationDecay?: number;
  
  /** Random seed for reproducibility */
  seed?: number;

  /** Penalty applied to actions taken in the recent window */
  repetitionPenalty?: number;
  
  /** Number of turns to look back for repetition */
  lookbackWindow?: number;
}
