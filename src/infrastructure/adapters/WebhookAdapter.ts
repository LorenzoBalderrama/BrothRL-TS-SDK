import { BaseAdapter, PlatformRequest, PlatformResponse, AdapterConfig } from './BaseAdapter';
import { State, ConversationState, ConversationTurn } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Generic webhook request format
 */
interface WebhookRequest {
  /** Conversation/call ID */
  conversationId?: string;
  
  /** Current conversation state */
  state?: {
    turnNumber?: number;
    history?: Array<{
      speaker: 'agent' | 'user';
      text: string;
      timestamp?: string;
    }>;
    features?: Record<string, any>;
    metadata?: Record<string, any>;
  };
  
  /** Latest user input */
  userInput?: string;
  
  /** Event type */
  event?: string;
  
  /** Custom data */
  data?: Record<string, any>;
}

/**
 * Generic webhook response format
 */
interface WebhookResponse {
  /** Action to take */
  action: {
    type: string;
    name: string;
    parameters?: Record<string, any>;
  };
  
  /** Message to speak/display */
  message?: string;
  
  /** Whether conversation should end */
  endConversation?: boolean;
  
  /** Updated state */
  state?: any;
  
  /** Custom data */
  data?: Record<string, any>;
}

/**
 * Generic webhook adapter for any platform
 * 
 * This adapter works with a flexible JSON format that can be adapted
 * to any voice platform by the developer.
 */
export class WebhookAdapter extends BaseAdapter {
  constructor(config: AdapterConfig = {}) {
    super(config);
  }

  /**
   * Parse generic webhook request
   */
  parseRequest(request: any): PlatformRequest {
    const payload = typeof request === 'string' ? JSON.parse(request) : request;

    return {
      raw: payload,
      metadata: {
        platform: 'webhook',
        conversationId: payload.conversationId,
        event: payload.event,
      },
    };
  }

  /**
   * Extract conversation state from request
   */
  extractState(request: PlatformRequest): State {
    const payload = request.raw as WebhookRequest;

    // Use provided state or create new one
    let history: ConversationTurn[] = [];
    let turnNumber = 0;
    let features: Record<string, any> = {};

    if (payload.state) {
      history = (payload.state.history || []).map(h => ({
        ...h,
        timestamp: h.timestamp || new Date().toISOString()
      }));
      turnNumber = payload.state.turnNumber || 0;
      features = payload.state.features || {};
    }

    // Add user input if provided
    if (payload.userInput) {
      history.push({
        speaker: 'user' as const,
        text: payload.userInput,
        timestamp: new Date().toISOString(),
      });
      turnNumber++;
    }

    // Merge custom features
    const customFeatures = this.extractCustomFeatures(request.raw);
    features = { ...features, ...customFeatures };

    const conversationState: ConversationState = {
      conversationId: payload.conversationId || `webhook_${Date.now()}`,
      turnNumber,
      history,
      features,
      metadata: {
        platform: 'webhook',
        event: payload.event,
        data: payload.data,
      },
    };

    return new State(conversationState);
  }

  /**
   * Format action as generic webhook response
   */
  formatResponse(action: Action, request: PlatformRequest): PlatformResponse {
    const currentState = this.extractState(request);

    // Add agent's action to history
    const updatedHistory = [
      ...currentState.data.history,
      {
        speaker: 'agent' as const,
        text: action.name,
        timestamp: new Date().toISOString(),
      },
    ];

    const response: WebhookResponse = {
      action: {
        type: action.type,
        name: action.name,
        parameters: action.parameters,
      },
      message: action.getParameter('message', action.description),
      endConversation: action.type === 'end_call',
      state: {
        turnNumber: currentState.data.turnNumber + 1,
        history: updatedHistory,
        features: currentState.data.features,
      },
      data: action.metadata,
    };

    return {
      action,
      raw: response,
      metadata: {
        platform: 'webhook',
        conversationId: currentState.data.conversationId,
      },
    };
  }

  /**
   * Create a webhook request from scratch (useful for testing)
   */
  static createRequest(options: {
    conversationId?: string;
    userInput?: string;
    event?: string;
    state?: any;
    data?: Record<string, any>;
  }): WebhookRequest {
    return {
      conversationId: options.conversationId || `test_${Date.now()}`,
      userInput: options.userInput,
      event: options.event || 'user_message',
      state: options.state,
      data: options.data,
    };
  }
}

