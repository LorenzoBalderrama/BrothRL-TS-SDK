/**
 * Represents an action that the voice agent can take
 */
export interface ActionDefinition {
  /** Unique identifier for the action type */
  type: string;
  
  /** Human-readable name */
  name: string;
  
  /** Description of what the action does */
  description: string;
  
  /** Parameters for the action */
  parameters?: Record<string, any>;
  
  /** Optional metadata */
  metadata?: Record<string, any>;
}

/**
 * Common action types for voice agents
 */
export enum ActionType {
  ASK_QUESTION = 'ask_question',
  PROVIDE_INFO = 'provide_info',
  TRANSFER_CALL = 'transfer_call',
  SCHEDULE_CALLBACK = 'schedule_callback',
  END_CALL = 'end_call',
  CLARIFY = 'clarify',
  CONFIRM = 'confirm',
  APOLOGIZE = 'apologize',
  CUSTOM = 'custom',
}

/**
 * Action class that represents a decision the agent makes
 */
export class Action {
  public readonly type: string;
  public readonly name: string;
  public readonly description: string;
  public readonly parameters: Record<string, any>;
  public readonly metadata: Record<string, any>;

  constructor(definition: ActionDefinition) {
    this.type = definition.type;
    this.name = definition.name;
    this.description = definition.description;
    this.parameters = definition.parameters || {};
    this.metadata = definition.metadata || {};
  }

  /**
   * Get unique identifier for this action
   */
  getId(): string {
    return this.type;
  }

  /**
   * Check if this action has a specific parameter
   */
  hasParameter(key: string): boolean {
    return key in this.parameters;
  }

  /**
   * Get a parameter value
   */
  getParameter<T = any>(key: string, defaultValue?: T): T | undefined {
    return this.parameters[key] ?? defaultValue;
  }

  /**
   * Create a new action with updated parameters
   */
  withParameters(params: Record<string, any>): Action {
    return new Action({
      type: this.type,
      name: this.name,
      description: this.description,
      parameters: { ...this.parameters, ...params },
      metadata: this.metadata,
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON(): ActionDefinition {
    return {
      type: this.type,
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      metadata: this.metadata,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(json: ActionDefinition): Action {
    return new Action(json);
  }

  /**
   * Create a standard action
   */
  static create(type: ActionType | string, name: string, description: string, parameters?: Record<string, any>): Action {
    return new Action({
      type,
      name,
      description,
      parameters,
    });
  }
}

/**
 * Action space - defines all possible actions
 */
export class ActionSpace {
  private actions: Map<string, Action>;

  constructor(actions: Action[] = []) {
    this.actions = new Map(actions.map(a => [a.type, a]));
  }

  /**
   * Add an action to the space
   */
  addAction(action: Action): void {
    this.actions.set(action.type, action);
  }

  /**
   * Get an action by type
   */
  getAction(type: string): Action | undefined {
    return this.actions.get(type);
  }

  /**
   * Get all actions
   */
  getAllActions(): Action[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get number of actions
   */
  size(): number {
    return this.actions.size;
  }

  /**
   * Check if action exists
   */
  hasAction(type: string): boolean {
    return this.actions.has(type);
  }

  /**
   * Remove an action
   */
  removeAction(type: string): boolean {
    return this.actions.delete(type);
  }
}

