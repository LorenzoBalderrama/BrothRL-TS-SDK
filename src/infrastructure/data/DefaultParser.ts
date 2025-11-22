import { BaseParser } from './Parser';
import { ConversationData, ConversationBatch } from '../../domain/entities/schema';

/**
 * Default JSON parser for conversation data
 * 
 * Expects data in the ConversationData format defined in schema.ts
 */
export class DefaultParser extends BaseParser {
  /**
   * Parse a single conversation from JSON
   */
  parseConversation(raw: any): ConversationData {
    const data = this.safeJsonParse(raw);

    if (!this.validate(data)) {
      throw new Error('Invalid conversation data format');
    }

    return data as ConversationData;
  }

  /**
   * Parse a batch of conversations
   */
  parseBatch(raw: any): ConversationBatch {
    const data = this.safeJsonParse(raw);

    // Handle array of conversations
    if (Array.isArray(data)) {
      return {
        conversations: data.map(c => this.parseConversation(c)),
      };
    }

    // Handle batch object
    if (data.conversations && Array.isArray(data.conversations)) {
      return {
        conversations: data.conversations.map((c: any) => this.parseConversation(c)),
        metadata: data.metadata,
      };
    }

    throw new Error('Invalid batch format: expected array or object with conversations field');
  }

  /**
   * Validate conversation data format
   */
  validate(raw: any): boolean {
    if (!raw || typeof raw !== 'object') {
      return false;
    }

    // Check required fields
    if (!this.hasRequiredFields(raw, ['id', 'turns', 'outcome'])) {
      return false;
    }

    // Validate turns array
    if (!Array.isArray(raw.turns)) {
      return false;
    }

    for (const turn of raw.turns) {
      if (!this.hasRequiredFields(turn, ['timestamp', 'speaker', 'text'])) {
        return false;
      }

      if (turn.speaker !== 'agent' && turn.speaker !== 'user') {
        return false;
      }
    }

    // Validate outcome
    if (!this.hasRequiredFields(raw.outcome, ['success'])) {
      return false;
    }

    if (typeof raw.outcome.success !== 'boolean') {
      return false;
    }

    return true;
  }
}

/**
 * Flexible parser that accepts various formats and normalizes them
 */
export class FlexibleParser extends DefaultParser {
  /**
   * Parse conversation with more lenient validation
   */
  parseConversation(raw: any): ConversationData {
    const data = this.safeJsonParse(raw);

    // Try to normalize the data
    const normalized = this.normalizeConversation(data);

    if (!this.validate(normalized)) {
      throw new Error('Could not normalize conversation data');
    }

    return normalized;
  }

  /**
   * Normalize conversation data to standard format
   */
  private normalizeConversation(data: any): ConversationData {
    const normalized: ConversationData = {
      id: data.id || data.conversationId || data.call_id || `conv_${Date.now()}`,
      turns: [],
      outcome: {
        success: false,
      },
    };

    // Normalize turns
    if (data.turns && Array.isArray(data.turns)) {
      normalized.turns = data.turns.map((t: any) => this.normalizeTurn(t));
    } else if (data.messages && Array.isArray(data.messages)) {
      normalized.turns = data.messages.map((t: any) => this.normalizeTurn(t));
    } else if (data.transcript && Array.isArray(data.transcript)) {
      normalized.turns = data.transcript.map((t: any) => this.normalizeTurn(t));
    }

    // Normalize outcome
    if (data.outcome) {
      normalized.outcome = this.normalizeOutcome(data.outcome);
    } else if (data.result) {
      normalized.outcome = this.normalizeOutcome(data.result);
    } else if (data.success !== undefined) {
      normalized.outcome = { success: !!data.success };
    }

    // Copy optional fields
    if (data.startTime) normalized.startTime = data.startTime;
    if (data.endTime) normalized.endTime = data.endTime;
    if (data.duration) normalized.duration = data.duration;
    if (data.user) normalized.user = data.user;
    if (data.agent) normalized.agent = data.agent;
    if (data.platform) normalized.platform = data.platform;
    if (data.metadata) normalized.metadata = data.metadata;

    return normalized;
  }

  /**
   * Normalize a single turn
   */
  private normalizeTurn(turn: any): any {
    return {
      timestamp: turn.timestamp || turn.time || new Date().toISOString(),
      speaker: this.normalizeSpeaker(turn.speaker || turn.role || turn.from),
      text: turn.text || turn.message || turn.content || '',
      action: turn.action,
      state: turn.state,
      sentiment: turn.sentiment,
      intent: turn.intent,
      metadata: turn.metadata,
    };
  }

  /**
   * Normalize speaker field
   */
  private normalizeSpeaker(speaker: any): 'agent' | 'user' {
    const s = String(speaker).toLowerCase();
    
    if (s.includes('agent') || s.includes('assistant') || s.includes('bot')) {
      return 'agent';
    }
    
    return 'user';
  }

  /**
   * Normalize outcome
   */
  private normalizeOutcome(outcome: any): any {
    return {
      success: !!outcome.success || !!outcome.resolved || !!outcome.goalAchieved,
      type: outcome.type || outcome.outcomeType,
      score: outcome.score,
      userSatisfaction: outcome.userSatisfaction || outcome.satisfaction || outcome.rating,
      goalAchieved: outcome.goalAchieved,
      metrics: outcome.metrics,
    };
  }
}

