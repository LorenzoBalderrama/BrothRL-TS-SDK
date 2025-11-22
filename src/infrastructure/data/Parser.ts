import { ConversationData, ConversationBatch, TrainingDataset } from '../../domain/entities/schema';

/**
 * Parser interface for converting raw data into conversation data
 */
export interface IParser {
  /**
   * Parse a single conversation
   * @param raw Raw data in any format
   * @returns Parsed conversation data
   */
  parseConversation(raw: any): ConversationData;

  /**
   * Parse multiple conversations
   * @param raw Raw data containing multiple conversations
   * @returns Batch of parsed conversations
   */
  parseBatch(raw: any): ConversationBatch;

  /**
   * Validate that data conforms to expected format
   * @param raw Raw data to validate
   * @returns True if valid, false otherwise
   */
  validate(raw: any): boolean;

  /**
   * Convert conversation data to training dataset
   * @param conversations Array of conversation data
   * @returns Training dataset ready for RL
   */
  toTrainingDataset(conversations: ConversationData[]): TrainingDataset;
}

/**
 * Base parser with common functionality
 */
export abstract class BaseParser implements IParser {
  abstract parseConversation(raw: any): ConversationData;
  
  abstract parseBatch(raw: any): ConversationBatch;
  
  abstract validate(raw: any): boolean;

  /**
   * Convert conversations to training dataset
   * This is a default implementation that can be overridden
   */
  toTrainingDataset(conversations: ConversationData[]): TrainingDataset {
    const examples = conversations.flatMap(conv => 
      this.extractExamples(conv)
    );

    const totalReward = examples.reduce((sum, ex) => sum + ex.reward, 0);
    const successCount = conversations.filter(c => c.outcome.success).length;

    return {
      examples,
      metadata: {
        totalConversations: conversations.length,
        totalTurns: examples.length,
        averageReward: examples.length > 0 ? totalReward / examples.length : 0,
        successRate: conversations.length > 0 ? successCount / conversations.length : 0,
      },
    };
  }

  /**
   * Extract training examples from a single conversation
   * Can be overridden for custom extraction logic
   */
  protected extractExamples(conversation: ConversationData): any[] {
    const examples: any[] = [];
    const outcomeReward = conversation.outcome.success ? 1.0 : -1.0;

    // Extract state-action-reward tuples from turns
    const agentTurns = conversation.turns.filter(t => t.speaker === 'agent' && t.action);

    for (let i = 0; i < agentTurns.length; i++) {
      const turn = agentTurns[i];
      
      if (!turn.action) continue;

      // Calculate reward for this action
      // Delayed reward from outcome, discounted by position
      const discount = Math.pow(0.99, agentTurns.length - i - 1);
      const reward = outcomeReward * discount;

      // Extract state features
      const state = turn.state || {};
      
      // Create context key from state
      const contextParts: string[] = [];
      if (turn.intent) contextParts.push(`intent:${turn.intent}`);
      if (turn.sentiment) contextParts.push(`sentiment:${turn.sentiment}`);
      const context = contextParts.join('|') || 'default';

      examples.push({
        state,
        context,
        action: turn.action,
        reward,
        info: {
          conversationId: conversation.id,
          turnIndex: i,
          sentiment: turn.sentiment,
          intent: turn.intent,
        },
      });
    }

    return examples;
  }

  /**
   * Helper to safely parse JSON
   */
  protected safeJsonParse(raw: any): any {
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (e) {
        throw new Error(`Invalid JSON: ${e}`);
      }
    }
    return raw;
  }

  /**
   * Helper to validate required fields
   */
  protected hasRequiredFields(obj: any, fields: string[]): boolean {
    return fields.every(field => field in obj && obj[field] !== undefined);
  }
}

