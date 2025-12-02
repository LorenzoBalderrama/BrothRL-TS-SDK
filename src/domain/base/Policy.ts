import { State } from '../entities/State';
import { Action, ActionSpace } from '../entities/Action';
import { IPolicy, PolicyConfig } from '../interfaces/IPolicy';

/**
 * Abstract base class for policies
 */
export abstract class Policy implements IPolicy {
  protected config: Required<PolicyConfig>;
  protected actionSpace: ActionSpace;
  protected stepCount: number = 0;

  constructor(config: PolicyConfig) {
    this.actionSpace = config.actionSpace;
    this.config = {
      actionSpace: config.actionSpace,
      learningRate: config.learningRate ?? 0.1,
      explorationRate: config.explorationRate ?? 0.1,
      minExplorationRate: config.minExplorationRate ?? 0.01,
      explorationDecay: config.explorationDecay ?? 0.995,
      seed: config.seed ?? Date.now(),
      repetitionPenalty: config.repetitionPenalty ?? 1.0,
      lookbackWindow: config.lookbackWindow ?? 2,
    };
  }

  /**
   * Select an action (must be implemented by subclasses)
   */
  abstract selectAction(state: State): Action | Promise<Action>;

  /**
   * Update the policy (must be implemented by subclasses)
   */
  abstract update(state: State, action: Action, reward: number): void | Promise<void>;

  /**
   * Get the action space
   */
  getActionSpace(): ActionSpace {
    return this.actionSpace;
  }

  /**
   * Get current exploration rate (with decay)
   */
  protected getExplorationRate(): number {
    const rate = Math.max(
      this.config.minExplorationRate,
      this.config.explorationRate * Math.pow(this.config.explorationDecay, this.stepCount)
    );
    return rate;
  }

  /**
   * Increment step count (for exploration decay)
   */
  protected incrementStep(): void {
    this.stepCount++;
  }

  /**
   * Select a random action (for exploration)
   */
  protected selectRandomAction(): Action {
    const actions = this.actionSpace.getAllActions();
    const randomIndex = Math.floor(Math.random() * actions.length);
    return actions[randomIndex];
  }

  /**
   * Decide whether to explore or exploit
   */
  protected shouldExplore(): boolean {
    return Math.random() < this.getExplorationRate();
  }

  /**
   * Helper to get repetition penalty for a given action
   */
  protected getRepetitionPenalty(actionType: string, state: State): number {
    const history = state.data.history || [];
    
    // Filter only agent turns, take last N
    const recentActions = history
      .filter(turn => turn.speaker === 'agent' && turn.action)
      .slice(-this.config.lookbackWindow)
      .map(turn => turn.action?.type || '');

    const recentCount = recentActions.filter(a => a === actionType).length;
    
    if (recentCount > 0) {
      return recentCount * this.config.repetitionPenalty;
    }
    
    return 0;
  }

  /**
   * Serialize to JSON
   */
  abstract toJSON(): any;

  /**
   * Deserialize from JSON
   */
  abstract fromJSON(json: any): void;

  /**
   * Reset the policy
   */
  reset(): void {
    this.stepCount = 0;
  }

  /**
   * Get policy statistics
   */
  getStats(): Record<string, any> {
    return {
      stepCount: this.stepCount,
      explorationRate: this.getExplorationRate(),
      actionSpaceSize: this.actionSpace.size(),
    };
  }
}
