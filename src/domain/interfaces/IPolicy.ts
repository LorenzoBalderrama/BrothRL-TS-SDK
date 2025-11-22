import { State } from '../entities/State';
import { Action, ActionSpace } from '../entities/Action';

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
}

