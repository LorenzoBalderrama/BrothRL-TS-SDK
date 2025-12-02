import { State, ConversationState } from '../../domain/entities/State';

/**
 * Configuration for a feature extraction rule
 */
export interface FeatureConfig {
  type: 'enum' | 'boolean' | 'number' | 'text';
  options?: string[]; // for enum
  keywords?: Record<string, string[]>; // map value -> keywords
  defaultValue?: any;
  description?: string;
  extractor?: (text: string) => any; // Custom extractor function
}

/**
 * Zod-like Feature Definition Builder
 */
export class Feature {
  constructor(public config: FeatureConfig) {}

  /**
   * Define an Enumerated feature (categorical)
   * @param options Allowed values
   */
  static enum(options: string[]): Feature {
    return new Feature({ 
      type: 'enum', 
      options,
      defaultValue: options[0] 
    });
  }

  /**
   * Define a Boolean feature
   */
  static boolean(): Feature {
    return new Feature({ 
      type: 'boolean', 
      defaultValue: false 
    });
  }

  /**
   * Define a Numeric feature
   */
  static number(): Feature {
    return new Feature({ 
      type: 'number', 
      defaultValue: 0 
    });
  }

  /**
   * Map keywords to values for automatic extraction
   * @param map Record where keys are the feature values and values are array of keywords
   * @example
   * Feature.enum(['buy', 'sell']).matches({
   *   buy: ['purchase', 'buy', 'get'],
   *   sell: ['sell', 'offer']
   * })
   */
  matches(map: Record<string, string[]>): Feature {
    this.config.keywords = map;
    return this;
  }

  /**
   * Set a custom extractor function
   */
  extract(fn: (text: string) => any): Feature {
    this.config.extractor = fn;
    return this;
  }

  /**
   * Set default value
   */
  default(val: any): Feature {
    this.config.defaultValue = val;
    return this;
  }

  /**
   * Add description (for documentation or LLM prompting)
   */
  describe(desc: string): Feature {
    this.config.description = desc;
    return this;
  }
}

/**
 * Schema definition for State features
 */
export class StateSchema {
  private features: Record<string, Feature>;

  constructor(shape: Record<string, Feature>) {
    this.features = shape;
  }

  /**
   * Define the schema shape (Zod-like entry point)
   */
  static define(shape: Record<string, Feature>): StateSchema {
    return new StateSchema(shape);
  }

  /**
   * Parse text into a structured feature object
   * @param text The raw text (e.g. user message)
   * @returns Structured features
   */
  parse(text: string): Record<string, any> {
    const result: Record<string, any> = {};
    const normalizedText = text.toLowerCase();

    for (const [name, feature] of Object.entries(this.features)) {
      result[name] = this.extractValue(feature, normalizedText);
    }

    return result;
  }

  /**
   * Helper to convert text directly into a BrothRL State object
   * @param text The user text
   * @param context Additional context (history, turn count, etc.)
   */
  toState(text: string, context: Partial<ConversationState> = {}): State {
    const features = this.parse(text);
    
    // Create a valid ConversationState
    const stateData: ConversationState = {
      conversationId: context.conversationId || `conv_${Date.now()}`,
      turnNumber: context.turnNumber || 1,
      history: context.history || [{
        speaker: 'user',
        text: text,
        timestamp: new Date().toISOString()
      }],
      features: {
        ...features,
        ...(context.features || {})
      },
      metadata: context.metadata
    };

    return new State(stateData);
  }

  private extractValue(feature: Feature, text: string): any {
    // 1. Custom extractor takes precedence
    if (feature.config.extractor) {
      return feature.config.extractor(text);
    }

    // 2. Keyword matching
    if (feature.config.keywords) {
      for (const [value, keywords] of Object.entries(feature.config.keywords)) {
        if (keywords.some(k => text.includes(k.toLowerCase()))) {
          return this.castValue(value, feature.config.type);
        }
      }
    }

    // 3. Boolean explicit matching if no keywords provided
    if (feature.config.type === 'boolean' && !feature.config.keywords) {
        // Default boolean logic: returns true if any positive sentiment words? 
        // Actually for boolean without keywords, we usually return default unless customized.
        // But let's assume if it's "is_angry" and we didn't provide keywords, we can't guess.
        // So we return default.
    }

    return feature.config.defaultValue;
  }

  private castValue(val: string, type: string): any {
    if (type === 'boolean') return true; // If matched, it's true (usually)
    if (type === 'number') return parseFloat(val);
    return val;
  }
}

