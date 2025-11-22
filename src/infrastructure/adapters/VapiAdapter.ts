import { BaseAdapter, PlatformRequest, PlatformResponse, AdapterConfig } from './BaseAdapter';
import { State, ConversationState, ConversationTurn } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Vapi webhook payload structure
 * Based on Vapi's webhook documentation
 */
interface VapiWebhookPayload {
  /** Event type (e.g., 'function-call', 'end-of-call-report') */
  type: string;
  
  /** Call information */
  call?: {
    id: string;
    orgId?: string;
    type?: string;
    status?: string;
    startedAt?: string;
    endedAt?: string;
  };
  
  /** Messages in the conversation */
  messages?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    time?: number;
  }>;
  
  /** Function call (if type is 'function-call') */
  functionCall?: {
    name: string;
    parameters?: Record<string, any>;
  };
  
  /** Analysis data */
  analysis?: {
    summary?: string;
    successEvaluation?: string;
  };
  
  /** Transcript */
  transcript?: string;
  
  /** Metadata */
  metadata?: Record<string, any>;
}

/**
 * Vapi adapter for voice conversations
 */
export class VapiAdapter extends BaseAdapter {
  constructor(config: AdapterConfig = {}) {
    super(config);
  }

  /**
   * Parse Vapi webhook request
   */
  parseRequest(request: any): PlatformRequest {
    const payload = typeof request === 'string' ? JSON.parse(request) : request;

    return {
      raw: payload,
      metadata: {
        platform: 'vapi',
        eventType: payload.type,
        callId: payload.call?.id,
      },
    };
  }

  /**
   * Extract conversation state from Vapi request
   */
  extractState(request: PlatformRequest): State {
    const payload = request.raw as VapiWebhookPayload;

    // Extract conversation history
    const history: ConversationTurn[] = [];
    if (payload.messages) {
      for (const msg of payload.messages) {
        history.push({
          speaker: msg.role === 'user' ? 'user' : 'agent',
          text: msg.content,
          timestamp: msg.time ? new Date(msg.time).toISOString() : new Date().toISOString(),
        });
      }
    }

    // Extract features
    const features: Record<string, any> = {
      callStatus: payload.call?.status || 'unknown',
      hasTranscript: !!payload.transcript,
      messageCount: payload.messages?.length || 0,
      ...this.extractCustomFeatures(request.raw),
    };

    // Determine intent from analysis
    let intent: string | undefined;
    if (payload.analysis?.summary) {
      intent = 'summarized';
    } else if (payload.functionCall) {
      intent = payload.functionCall.name;
    }

    const conversationState: ConversationState = {
      conversationId: payload.call?.id || `vapi_${Date.now()}`,
      turnNumber: history.length,
      history,
      intent,
      features,
      metadata: {
        platform: 'vapi',
        eventType: payload.type,
        analysis: payload.analysis,
      },
    };

    return new State(conversationState);
  }

  /**
   * Format action as Vapi response
   */
  formatResponse(action: Action, request: PlatformRequest): PlatformResponse {
    const payload = request.raw as VapiWebhookPayload;

    // Build Vapi response based on action type
    let vapiResponse: any = {};

    switch (action.type) {
      case 'ask_question':
        vapiResponse = {
          message: action.getParameter('message', action.name),
        };
        break;

      case 'provide_info':
        vapiResponse = {
          message: action.getParameter('message', action.description),
        };
        break;

      case 'transfer_call':
        vapiResponse = {
          function: 'transferCall',
          parameters: {
            phoneNumber: action.getParameter('phoneNumber'),
            reason: action.getParameter('reason', 'Transferring your call'),
          },
        };
        break;

      case 'end_call':
        vapiResponse = {
          function: 'endCall',
          parameters: {
            message: action.getParameter('message', 'Thank you for calling. Goodbye!'),
          },
        };
        break;

      default:
        // Custom action - pass through parameters
        vapiResponse = {
          message: action.name,
          ...action.parameters,
        };
    }

    return {
      action,
      raw: vapiResponse,
      metadata: {
        platform: 'vapi',
        callId: payload.call?.id,
      },
    };
  }

  /**
   * Helper to check if this is an end-of-call report
   */
  isEndOfCallReport(request: any): boolean {
    const payload = typeof request === 'string' ? JSON.parse(request) : request;
    return payload.type === 'end-of-call-report';
  }

  /**
   * Extract outcome from end-of-call report
   */
  extractOutcome(request: any): { success: boolean; metrics: Record<string, any> } | null {
    if (!this.isEndOfCallReport(request)) {
      return null;
    }

    const payload = typeof request === 'string' ? JSON.parse(request) : request;
    
    // Determine success based on analysis
    const success = 
      payload.analysis?.successEvaluation === 'success' ||
      payload.call?.status === 'completed';

    return {
      success,
      metrics: {
        duration: payload.call?.endedAt && payload.call?.startedAt
          ? new Date(payload.call.endedAt).getTime() - new Date(payload.call.startedAt).getTime()
          : undefined,
        summary: payload.analysis?.summary,
        transcript: payload.transcript,
      },
    };
  }
}

