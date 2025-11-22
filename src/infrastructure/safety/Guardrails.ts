import { Action } from '../../domain/entities/Action';
import { State } from '../../domain/entities/State';
import { IPolicy } from '../../domain/interfaces/IPolicy';

/**
 * Guardrail rule for safety constraints
 */
export interface GuardrailRule {
  /** Name of the rule */
  name: string;
  
  /** Description of what the rule does */
  description: string;
  
  /** Check if the rule is violated */
  check: (state: State, action: Action) => boolean;
  
  /** Action to take if rule is violated */
  fallbackAction?: Action;
  
  /** Whether this rule blocks the action */
  blocking?: boolean;
}

/**
 * Guardrail configuration
 */
export interface GuardrailConfig {
  /** List of rules to enforce */
  rules?: GuardrailRule[];
  
  /** Fallback policy if all actions are blocked */
  fallbackPolicy?: IPolicy;
  
  /** Default fallback action */
  defaultFallback?: Action;
  
  /** Whether to log violations */
  logViolations?: boolean;
  
  /** Action whitelist (if set, only these actions are allowed) */
  whitelist?: string[];
  
  /** Action blacklist (these actions are never allowed) */
  blacklist?: string[];
  
  /** Minimum confidence threshold */
  minConfidence?: number;
}

/**
 * Guardrail violation
 */
export interface Violation {
  rule: string;
  action: Action;
  state: State;
  timestamp: string;
  fallbackUsed?: boolean;
}

/**
 * Guardrails for safe RL policy execution
 * 
 * Provides safety constraints to prevent the RL agent from taking
 * dangerous or inappropriate actions.
 */
export class Guardrails {
  private config: Required<GuardrailConfig>;
  private rules: Map<string, GuardrailRule>;
  private violations: Violation[] = [];

  constructor(config: GuardrailConfig = {}) {
    this.config = {
      rules: config.rules || [],
      fallbackPolicy: config.fallbackPolicy ?? undefined,
      defaultFallback: config.defaultFallback ?? undefined,
      logViolations: config.logViolations ?? true,
      whitelist: config.whitelist || [],
      blacklist: config.blacklist || [],
      minConfidence: config.minConfidence || 0,
    } as Required<GuardrailConfig>;

    this.rules = new Map(
      this.config.rules.map(rule => [rule.name, rule])
    );
  }

  /**
   * Check if an action is safe to execute
   * @param state Current state
   * @param action Proposed action
   * @returns Whether the action is safe
   */
  isSafe(state: State, action: Action): boolean {
    // Check whitelist
    if (this.config.whitelist.length > 0 && !this.config.whitelist.includes(action.type)) {
      return false;
    }

    // Check blacklist
    if (this.config.blacklist.includes(action.type)) {
      return false;
    }

    // Check all rules
    for (const rule of this.rules.values()) {
      if (rule.blocking && rule.check(state, action)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate and potentially modify an action
   * @param state Current state
   * @param action Proposed action
   * @returns Safe action to execute
   */
  validate(state: State, action: Action): Action {
    // Check whitelist
    if (this.config.whitelist.length > 0 && !this.config.whitelist.includes(action.type)) {
      return this.handleViolation(state, action, 'whitelist');
    }

    // Check blacklist
    if (this.config.blacklist.includes(action.type)) {
      return this.handleViolation(state, action, 'blacklist');
    }

    // Check all rules
    for (const rule of this.rules.values()) {
      if (rule.check(state, action)) {
        if (rule.blocking) {
          return this.handleViolation(state, action, rule.name, rule.fallbackAction);
        } else if (this.config.logViolations) {
          // Non-blocking violation, just log it
          this.logViolation(state, action, rule.name, false);
        }
      }
    }

    return action;
  }

  /**
   * Handle a guardrail violation
   */
  private handleViolation(
    state: State,
    action: Action,
    ruleName: string,
    fallbackAction?: Action
  ): Action {
    this.logViolation(state, action, ruleName, true);

    // Use rule-specific fallback if available
    if (fallbackAction) {
      return fallbackAction;
    }

    // Use default fallback if available
    if (this.config.defaultFallback) {
      return this.config.defaultFallback;
    }

    // Use fallback policy if available
    if (this.config.fallbackPolicy) {
      const policyAction = this.config.fallbackPolicy.selectAction(state);
      return policyAction instanceof Promise ? action : policyAction as Action;
    }

    // Last resort: throw error
    throw new Error(`Guardrail violation: ${ruleName} - No fallback available`);
  }

  /**
   * Log a violation
   */
  private logViolation(
    state: State,
    action: Action,
    ruleName: string,
    fallbackUsed: boolean
  ): void {
    const violation: Violation = {
      rule: ruleName,
      action,
      state,
      timestamp: new Date().toISOString(),
      fallbackUsed,
    };

    this.violations.push(violation);

    if (this.config.logViolations) {
      console.warn(`[Guardrail] Violation: ${ruleName} - Action: ${action.type}`);
    }
  }

  /**
   * Add a new rule
   */
  addRule(rule: GuardrailRule): void {
    this.rules.set(rule.name, rule);
    this.config.rules.push(rule);
  }

  /**
   * Remove a rule
   */
  removeRule(name: string): boolean {
    return this.rules.delete(name);
  }

  /**
   * Get all violations
   */
  getViolations(): Violation[] {
    return [...this.violations];
  }

  /**
   * Clear violation history
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * Add action to whitelist
   */
  allowAction(actionType: string): void {
    if (!this.config.whitelist.includes(actionType)) {
      this.config.whitelist.push(actionType);
    }
  }

  /**
   * Add action to blacklist
   */
  blockAction(actionType: string): void {
    if (!this.config.blacklist.includes(actionType)) {
      this.config.blacklist.push(actionType);
    }
  }

  /**
   * Get statistics about violations
   */
  getStats(): Record<string, any> {
    const violationsByRule: Record<string, number> = {};
    
    for (const v of this.violations) {
      violationsByRule[v.rule] = (violationsByRule[v.rule] || 0) + 1;
    }

    return {
      totalViolations: this.violations.length,
      violationsByRule,
      whitelistSize: this.config.whitelist.length,
      blacklistSize: this.config.blacklist.length,
      rulesCount: this.rules.size,
    };
  }
}

/**
 * Common guardrail rules
 */
export class CommonGuardrails {
  /**
   * Prevent excessive conversation length
   */
  static maxTurns(maxTurns: number, fallbackAction?: Action): GuardrailRule {
    return {
      name: 'max_turns',
      description: `Prevent conversations longer than ${maxTurns} turns`,
      check: (state, action) => {
        return state.data.turnNumber >= maxTurns && action.type !== 'end_call';
      },
      fallbackAction: fallbackAction || Action.create('end_call', 'End Call', 'Maximum conversation length reached'),
      blocking: true,
    };
  }

  /**
   * Prevent repeated actions
   */
  static noRepeat(maxRepeats: number = 3): GuardrailRule {
    const actionCounts = new Map<string, number>();

    return {
      name: 'no_repeat',
      description: `Prevent same action more than ${maxRepeats} times`,
      check: (state, action) => {
        const key = `${state.data.conversationId}_${action.type}`;
        const count = (actionCounts.get(key) || 0) + 1;
        actionCounts.set(key, count);
        return count > maxRepeats;
      },
      blocking: true,
    };
  }

  /**
   * Require confirmation before critical actions
   */
  static requireConfirmation(criticalActions: string[]): GuardrailRule {
    return {
      name: 'require_confirmation',
      description: 'Require confirmation before critical actions',
      check: (state, action) => {
        if (!criticalActions.includes(action.type)) {
          return false;
        }
        // Check if confirmation was given
        const lastUserMessage = state.data.history
          .filter(t => t.speaker === 'user')
          .pop();
        
        if (!lastUserMessage) return true;
        
        const confirmed = /yes|confirm|proceed|ok/i.test(lastUserMessage.text);
        return !confirmed;
      },
      blocking: true,
    };
  }

  /**
   * Rate limit specific actions
   */
  static rateLimit(actionType: string, maxPerConversation: number): GuardrailRule {
    const actionCounts = new Map<string, number>();

    return {
      name: `rate_limit_${actionType}`,
      description: `Limit ${actionType} to ${maxPerConversation} per conversation`,
      check: (state, action) => {
        if (action.type !== actionType) return false;
        
        const key = state.data.conversationId;
        const count = (actionCounts.get(key) || 0) + 1;
        actionCounts.set(key, count);
        return count > maxPerConversation;
      },
      blocking: true,
    };
  }
}

