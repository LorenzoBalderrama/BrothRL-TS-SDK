import { ActionDefinition } from './Action';

/**
 * A single turn in a conversation
 */
export interface ConversationTurn {
  /** Timestamp of the turn */
  timestamp: string;
  
  /** Who spoke in this turn */
  speaker: 'agent' | 'user';
  
  /** The text content */
  text: string;
  
  /** Optional action taken by the agent */
  action?: ActionDefinition;
  
  /** Optional state at this turn */
  state?: Record<string, any>;
  
  /** Optional sentiment analysis */
  sentiment?: 'positive' | 'negative' | 'neutral';
  
  /** Optional intent classification */
  intent?: string;
  
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Outcome of a conversation
 */
export interface Outcome {
  /** Whether the conversation was successful */
  success: boolean;
  
  /** Type of outcome (e.g., 'sale', 'support_resolved', 'transfer') */
  type?: string;
  
  /** Numeric score (0-1 range recommended) */
  score?: number;
  
  /** User satisfaction rating */
  userSatisfaction?: number;
  
  /** Whether the goal was achieved */
  goalAchieved?: boolean;
  
  /** Custom metrics */
  metrics?: Record<string, any>;
}

/**
 * Complete conversation data
 */
export interface ConversationData {
  /** Unique conversation identifier */
  id: string;
  
  /** Conversation turns */
  turns: ConversationTurn[];
  
  /** Final outcome of the conversation */
  outcome: Outcome;
  
  /** When the conversation started */
  startTime?: string;
  
  /** When the conversation ended */
  endTime?: string;
  
  /** Duration in seconds */
  duration?: number;
  
  /** User information */
  user?: {
    id?: string;
    name?: string;
    metadata?: Record<string, any>;
  };
  
  /** Agent information */
  agent?: {
    id?: string;
    name?: string;
    version?: string;
  };
  
  /** Platform where conversation occurred */
  platform?: string;
  
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Batch of conversation data
 */
export interface ConversationBatch {
  conversations: ConversationData[];
  metadata?: Record<string, any>;
}

/**
 * Training example extracted from conversation
 */
export interface TrainingExample {
  /** State features at this point */
  state: Record<string, any>;
  
  /** Context key for contextual bandits */
  context: string;
  
  /** Action taken */
  action: ActionDefinition;
  
  /** Reward received */
  reward: number;
  
  /** Additional info */
  info?: Record<string, any>;
}

/**
 * Dataset of training examples
 */
export interface TrainingDataset {
  examples: TrainingExample[];
  metadata?: {
    totalConversations?: number;
    totalTurns?: number;
    averageReward?: number;
    successRate?: number;
    [key: string]: any;
  };
}

