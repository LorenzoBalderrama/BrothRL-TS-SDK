/**
 * Represents the state of a conversation at a given point in time.
 * This is the context that the RL agent uses to make decisions.
 */
export interface ConversationState {
  /** Unique identifier for the conversation */
  conversationId: string;
  
  /** Current turn number in the conversation */
  turnNumber: number;
  
  /** Recent conversation history (last N turns) */
  history: ConversationTurn[];
  
  /** User information and metadata */
  userInfo?: Record<string, any>;
  
  /** Current conversation intent or topic */
  intent?: string;
  
  /** Extracted features for the RL algorithm */
  features: Record<string, number | string | boolean>;
  
  /** Custom metadata */
  metadata?: Record<string, any>;
}

/**
 * Represents a single turn in the conversation
 */
export interface ConversationTurn {
  speaker: 'agent' | 'user';
  text: string;
  timestamp: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

/**
 * State class that encapsulates conversation context
 */
export class State {
  constructor(public data: ConversationState) {}

  /**
   * Extract feature vector for RL algorithm
   * @returns A normalized feature vector
   */
  extractFeatures(): number[] {
    const features: number[] = [];
    
    // Add turn number (normalized)
    features.push(Math.min(this.data.turnNumber / 10, 1));
    
    // Add conversation length
    features.push(Math.min(this.data.history.length / 20, 1));
    
    // Add custom features
    for (const [, value] of Object.entries(this.data.features)) {
      if (typeof value === 'number') {
        features.push(value);
      } else if (typeof value === 'boolean') {
        features.push(value ? 1 : 0);
      }
      // String features would need encoding (e.g., one-hot)
    }
    
    return features;
  }

  /**
   * Get feature context as a string key for contextual bandits
   * @returns A string representation of the context
   */
  getContextKey(): string {
    const keyParts: string[] = [];
    
    // Include intent if available
    if (this.data.intent) {
      keyParts.push(`intent:${this.data.intent}`);
    }
    
    // Include important features
    for (const [key, value] of Object.entries(this.data.features)) {
      if (typeof value === 'string' || typeof value === 'boolean') {
        keyParts.push(`${key}:${value}`);
      } else if (typeof value === 'number') {
        // Bucket numeric features
        const bucket = Math.floor(value * 10) / 10;
        keyParts.push(`${key}:${bucket}`);
      }
    }
    
    return keyParts.join('|');
  }

  /**
   * Serialize state to JSON
   */
  toJSON(): ConversationState {
    return this.data;
  }

  /**
   * Deserialize state from JSON
   */
  static fromJSON(json: ConversationState): State {
    return new State(json);
  }

  /**
   * Clone the state
   */
  clone(): State {
    return new State(JSON.parse(JSON.stringify(this.data)));
  }
}

