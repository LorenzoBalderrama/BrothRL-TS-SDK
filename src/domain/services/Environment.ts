import { State, ConversationState } from '../entities/State';
import { Action } from '../entities/Action';
import { Reward, ConversationOutcome } from '../entities/Reward';
import { IPolicy } from '../interfaces/IPolicy';

/**
 * Result of taking an action in the environment
 */
export interface StepResult {
  /** The new state after taking the action */
  nextState: State;
  
  /** Reward received for the action */
  reward: number;
  
  /** Whether the episode/conversation is done */
  done: boolean;
  
  /** Additional information */
  info?: Record<string, any>;
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  /** Initial state */
  initialState?: ConversationState;
  
  /** Reward calculator */
  rewardCalculator?: Reward;
  
  /** Maximum conversation length */
  maxTurns?: number;
  
  /** Policy to use */
  policy?: IPolicy;
}

/**
 * Voice conversation environment
 * Manages the interaction loop between agent and user
 */
export class Environment {
  private currentState: State | null = null;
  private rewardCalculator: Reward;
  private maxTurns: number;
  private policy: IPolicy | null = null;
  private conversationHistory: Array<{
    state: State;
    action: Action;
    reward: number;
  }> = [];

  constructor(config: EnvironmentConfig = {}) {
    if (config.initialState) {
      this.currentState = new State(config.initialState);
    }
    this.rewardCalculator = config.rewardCalculator ?? new Reward();
    this.maxTurns = config.maxTurns ?? 50;
    this.policy = config.policy ?? null;
  }

  /**
   * Reset the environment to initial state
   */
  reset(initialState?: ConversationState): State {
    if (initialState) {
      this.currentState = new State(initialState);
    } else if (!this.currentState) {
      // Create a default initial state
      this.currentState = new State({
        conversationId: `conv_${Date.now()}`,
        turnNumber: 0,
        history: [],
        features: {},
      });
    } else {
      // Reset the current state
      this.currentState = new State({
        ...this.currentState.data,
        turnNumber: 0,
        history: [],
      });
    }
    
    this.conversationHistory = [];
    return this.currentState;
  }

  /**
   * Take an action in the environment
   * @param action The action to take
   * @param userResponse Optional user response to the action
   */
  step(action: Action, userResponse?: string): StepResult {
    if (!this.currentState) {
      throw new Error('Environment not initialized. Call reset() first.');
    }

    // Create next state
    const nextStateData: ConversationState = {
      ...this.currentState.data,
      turnNumber: this.currentState.data.turnNumber + 1,
      history: [
        ...this.currentState.data.history,
        {
          speaker: 'agent',
          text: action.name,
          timestamp: new Date().toISOString(),
        },
      ],
    };

    // Add user response if provided
    if (userResponse) {
      nextStateData.history.push({
        speaker: 'user',
        text: userResponse,
        timestamp: new Date().toISOString(),
      });
    }

    const nextState = new State(nextStateData);

    // Calculate immediate reward
    const immediateReward = this.rewardCalculator.calculateImmediate(
      this.currentState.data,
      action.toJSON()
    );

    // Check if conversation is done
    const done = 
      action.type === 'end_call' || 
      nextState.data.turnNumber >= this.maxTurns;

    // Store in history
    this.conversationHistory.push({
      state: this.currentState,
      action,
      reward: immediateReward.value,
    });

    // Update current state
    this.currentState = nextState;

    return {
      nextState,
      reward: immediateReward.value,
      done,
      info: {
        turnNumber: nextState.data.turnNumber,
        historyLength: this.conversationHistory.length,
      },
    };
  }

  /**
   * Get the current state
   */
  getState(): State | null {
    return this.currentState;
  }

  /**
   * Update state directly (useful for external state changes)
   */
  setState(state: State): void {
    this.currentState = state;
  }

  /**
   * Process the final outcome and distribute delayed rewards
   * @param outcome The conversation outcome
   */
  async processOutcome(outcome: ConversationOutcome): Promise<void> {
    const delayedReward = this.rewardCalculator.calculateDelayed(outcome);

    // If we have a policy, update it with the experience
    if (this.policy) {
      for (let i = this.conversationHistory.length - 1; i >= 0; i--) {
        const { state, action, reward: immediateReward } = this.conversationHistory[i];
        
        // Combine immediate and delayed rewards
        const stepsFromEnd = this.conversationHistory.length - 1 - i;
        const discountedDelayedReward = this.rewardCalculator.discount(
          delayedReward.value,
          stepsFromEnd
        );
        
        const totalReward = this.rewardCalculator.combine([
          { value: immediateReward, type: 'immediate', source: 'step' },
          { value: discountedDelayedReward, type: 'delayed', source: 'outcome' },
        ]);

        await this.policy.update(state, action, totalReward);
      }
    }
  }

  /**
   * Get conversation history
   */
  getHistory(): Array<{ state: State; action: Action; reward: number }> {
    return [...this.conversationHistory];
  }

  /**
   * Set the policy
   */
  setPolicy(policy: IPolicy): void {
    this.policy = policy;
  }

  /**
   * Get the policy
   */
  getPolicy(): IPolicy | null {
    return this.policy;
  }

  /**
   * Run one episode with the current policy
   */
  async runEpisode(
    initialState: ConversationState,
    simulator: (state: State, action: Action) => { userResponse: string; done: boolean }
  ): Promise<ConversationOutcome> {
    if (!this.policy) {
      throw new Error('No policy set');
    }

    this.reset(initialState);
    let done = false;
    let totalReward = 0;

    while (!done && this.currentState) {
      // Select action
      const action = await this.policy.selectAction(this.currentState);

      // Simulate user response
      const { userResponse, done: simulatorDone } = simulator(this.currentState, action);

      // Take step
      const result = this.step(action, userResponse);
      totalReward += result.reward;
      done = result.done || simulatorDone;
    }

    // Return outcome
    return {
      success: totalReward > 0,
      metrics: {
        totalReward,
        duration: this.conversationHistory.length,
      },
    };
  }
}

