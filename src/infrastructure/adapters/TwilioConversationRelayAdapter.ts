import { BaseAdapter, PlatformRequest, PlatformResponse, AdapterConfig } from './BaseAdapter';
import { State, ConversationState, ConversationTurn } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Twilio ConversationRelay WebSocket message types
 * Based on Twilio's ConversationRelay documentation
 */
export type ConversationRelayMessageType = 
  | 'setup'      // Initial handshake
  | 'start'      // Conversation started
  | 'prompt'     // User speech recognized or agent should speak
  | 'interrupt'  // User interrupted agent
  | 'stop'       // Conversation stopped
  | 'dtmf'       // DTMF digit received
  | 'mark'       // Mark event
  | 'clear';     // Clear buffered audio

/**
 * Incoming message from Twilio ConversationRelay
 */
export interface ConversationRelayIncomingMessage {
  /** Message type */
  type: ConversationRelayMessageType;
  
  /** Sequence number */
  sequenceNumber?: number;
  
  /** Call SID */
  callSid?: string;
  
  /** Stream SID */
  streamSid?: string;
  
  /** User speech transcript (for 'prompt' type) */
  voicePrompt?: string;
  
  /** DTMF digits (for 'dtmf' type) */
  dtmf?: string;
  
  /** Mark name (for 'mark' type) */
  mark?: string;
  
  /** Setup parameters */
  setup?: {
    callSid: string;
    streamSid: string;
    from?: string;
    to?: string;
    customParameters?: Record<string, any>;
  };
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Outgoing message to Twilio ConversationRelay
 */
export interface ConversationRelayOutgoingMessage {
  /** Message type */
  type: ConversationRelayMessageType;
  
  /** Sequence number (should increment) */
  sequenceNumber?: number;
  
  /** Text to speak (for 'prompt' type) */
  voicePrompt?: string;
  
  /** Parameters for text-to-speech */
  parameters?: {
    /** Voice to use (e.g., 'Polly.Joanna', 'Google.en-US-Standard-A') */
    voice?: string;
    
    /** Speech rate (0.5 to 2.0) */
    rate?: number;
    
    /** Speaking volume (0 to 100) */
    volume?: number;
    
    /** Language code (e.g., 'en-US') */
    language?: string;
  };
  
  /** Mark name (for 'mark' type) */
  mark?: string;
  
  /** Additional custom parameters */
  customParameters?: Record<string, any>;
}

/**
 * Configuration for ConversationRelay adapter
 */
export interface ConversationRelayConfig extends AdapterConfig {
  /** Default voice for text-to-speech */
  defaultVoice?: string;
  
  /** Default speech rate */
  defaultRate?: number;
  
  /** Default volume */
  defaultVolume?: number;
  
  /** Default language */
  defaultLanguage?: string;
  
  /** Welcome greeting message */
  welcomeGreeting?: string;
  
  /** Whether to include setup response */
  includeSetupResponse?: boolean;
}

/**
 * Twilio ConversationRelay adapter for WebSocket-based voice conversations
 * 
 * This adapter handles real-time bidirectional communication with Twilio's
 * ConversationRelay service, which provides speech recognition and synthesis
 * over WebSocket connections.
 * 
 * @example
 * ```typescript
 * const adapter = new TwilioConversationRelayAdapter({
 *   policy: myPolicy,
 *   defaultVoice: 'Polly.Joanna',
 *   welcomeGreeting: 'Hi! How can I help you today?'
 * });
 * 
 * // In your WebSocket handler
 * ws.on('message', async (data) => {
 *   const message = JSON.parse(data);
 *   const response = await adapter.handleRequest(message);
 *   ws.send(JSON.stringify(response.raw));
 * });
 * ```
 */
export class TwilioConversationRelayAdapter extends BaseAdapter {
  private defaultVoice: string;
  private defaultRate: number;
  private defaultVolume: number;
  private defaultLanguage: string;
  private welcomeGreeting: string;
  private includeSetupResponse: boolean;
  
  // Track conversation state per stream
  private conversationStates: Map<string, {
    history: ConversationTurn[];
    turnNumber: number;
    sequenceNumber: number;
    callSid?: string;
    from?: string;
    to?: string;
    customParameters?: Record<string, any>;
  }> = new Map();

  constructor(config: ConversationRelayConfig = {}) {
    super(config);
    this.defaultVoice = config.defaultVoice || 'Polly.Joanna';
    this.defaultRate = config.defaultRate || 1.0;
    this.defaultVolume = config.defaultVolume || 80;
    this.defaultLanguage = config.defaultLanguage || 'en-US';
    this.welcomeGreeting = config.welcomeGreeting || 'Hello! How can I help you today?';
    this.includeSetupResponse = config.includeSetupResponse ?? true;
  }

  /**
   * Parse ConversationRelay WebSocket message
   */
  parseRequest(request: any): PlatformRequest {
    const message = request as ConversationRelayIncomingMessage;
    
    return {
      raw: request,
      metadata: {
        platform: 'twilio-conversationrelay',
        messageType: message.type,
        callSid: message.callSid || message.setup?.callSid,
        streamSid: message.streamSid,
        sequenceNumber: message.sequenceNumber,
      },
    };
  }

  /**
   * Extract conversation state from ConversationRelay message
   */
  extractState(request: PlatformRequest): State {
    const message = request.raw as ConversationRelayIncomingMessage;
    const streamSid = message.streamSid || 'unknown';
    
    // Get or initialize conversation state
    let convState = this.conversationStates.get(streamSid);
    
    if (!convState) {
      convState = {
        history: [],
        turnNumber: 0,
        sequenceNumber: 0,
        callSid: message.callSid || message.setup?.callSid,
        from: message.setup?.from,
        to: message.setup?.to,
        customParameters: message.setup?.customParameters,
      };
      this.conversationStates.set(streamSid, convState);
    }

    // Handle different message types
    switch (message.type) {
      case 'setup':
        // Initialize conversation
        if (message.setup) {
          convState.callSid = message.setup.callSid;
          convState.from = message.setup.from;
          convState.to = message.setup.to;
          convState.customParameters = message.setup.customParameters;
        }
        break;

      case 'prompt':
        // User spoke - add to history
        if (message.voicePrompt) {
          convState.history.push({
            speaker: 'user',
            text: message.voicePrompt,
            timestamp: new Date().toISOString(),
          });
          convState.turnNumber++;
        }
        break;

      case 'dtmf':
        // User pressed digit
        if (message.dtmf) {
          convState.history.push({
            speaker: 'user',
            text: `Pressed: ${message.dtmf}`,
            timestamp: new Date().toISOString(),
          });
          convState.turnNumber++;
        }
        break;

      case 'interrupt':
        // User interrupted - mark in history
        convState.history.push({
          speaker: 'user',
          text: '[interrupted]',
          timestamp: new Date().toISOString(),
        });
        break;

      case 'stop':
        // Conversation ended - clean up
        this.conversationStates.delete(streamSid);
        break;
    }

    // Extract features
    const features: Record<string, any> = {
      messageType: message.type,
      hasVoicePrompt: !!message.voicePrompt,
      hasDtmf: !!message.dtmf,
      isInterrupted: message.type === 'interrupt',
      isSetup: message.type === 'setup',
      isStop: message.type === 'stop',
      ...this.extractCustomFeatures(request.raw),
    };

    // Determine intent from user input
    let intent: string | undefined;
    if (message.voicePrompt) {
      intent = this.inferIntent(message.voicePrompt);
    }

    const conversationState: ConversationState = {
      conversationId: convState.callSid || `relay_${streamSid}`,
      turnNumber: convState.turnNumber,
      history: [...convState.history],
      intent,
      features,
      userInfo: {
        phoneNumber: convState.from,
      },
      metadata: {
        platform: 'twilio-conversationrelay',
        streamSid,
        to: convState.to,
        customParameters: convState.customParameters,
        sequenceNumber: message.sequenceNumber,
      },
    };

    return new State(conversationState);
  }

  /**
   * Format action as ConversationRelay WebSocket message
   */
  formatResponse(action: Action, request: PlatformRequest): PlatformResponse {
    const message = request.raw as ConversationRelayIncomingMessage;
    const streamSid = message.streamSid || 'unknown';
    const convState = this.conversationStates.get(streamSid);
    
    // Increment sequence number
    const sequenceNumber = convState ? ++convState.sequenceNumber : 1;

    let outgoingMessage: ConversationRelayOutgoingMessage;

    // Handle setup message
    if (message.type === 'setup' && this.includeSetupResponse) {
      outgoingMessage = {
        type: 'setup',
        sequenceNumber,
      };
      
      // Send setup response and welcome greeting as separate messages
      const welcomeMessage: ConversationRelayOutgoingMessage = {
        type: 'prompt',
        sequenceNumber: sequenceNumber + 1,
        voicePrompt: this.welcomeGreeting,
        parameters: this.getVoiceParameters(action),
      };

      // Store agent response in history
      if (convState) {
        convState.history.push({
          speaker: 'agent',
          text: this.welcomeGreeting,
          timestamp: new Date().toISOString(),
        });
      }

      return {
        action,
        raw: [outgoingMessage, welcomeMessage], // Return both messages
        metadata: {
          platform: 'twilio-conversationrelay',
          streamSid,
          sequenceNumber,
          messageType: 'setup',
        },
      };
    }

    // Handle action types
    let responseText: string = '';
    let shouldEndCall = false;

    switch (action.type) {
      case 'ask_question':
        responseText = action.getParameter<string>('message') || action.name;
        break;

      case 'provide_info':
        responseText = action.getParameter<string>('message') || action.description;
        break;

      case 'clarify':
        responseText = action.getParameter<string>('message') || 'I\'m sorry, could you please repeat that?';
        break;

      case 'end_call':
        responseText = action.getParameter<string>('message') || 'Thank you for your time. Goodbye!';
        shouldEndCall = true;
        break;

      case 'transfer_call':
        responseText = action.getParameter<string>('message') || 'Let me transfer you to the right person.';
        // Note: Actual transfer would need additional Twilio API calls
        break;

      default:
        // Custom action - use name or description
        responseText = action.getParameter<string>('message') || action.name;
    }

    // Create the prompt message
    outgoingMessage = {
      type: 'prompt',
      sequenceNumber,
      voicePrompt: responseText,
      parameters: this.getVoiceParameters(action),
      customParameters: action.getParameter<Record<string, any>>('customParameters'),
    };

    // Store agent response in history
    if (convState) {
      convState.history.push({
        speaker: 'agent',
        text: responseText,
        timestamp: new Date().toISOString(),
      });
    }

    // If ending call, send stop message after prompt
    const messages: ConversationRelayOutgoingMessage[] = [outgoingMessage];
    if (shouldEndCall) {
      messages.push({
        type: 'stop',
        sequenceNumber: sequenceNumber + 1,
      });
    }

    return {
      action,
      raw: messages.length === 1 ? messages[0] : messages,
      metadata: {
        platform: 'twilio-conversationrelay',
        streamSid,
        sequenceNumber,
        messageType: shouldEndCall ? ['prompt', 'stop'] : 'prompt',
      },
    };
  }

  /**
   * Get voice parameters from action or use defaults
   */
  private getVoiceParameters(action: Action): ConversationRelayOutgoingMessage['parameters'] {
    return {
      voice: action.getParameter<string>('voice') || this.defaultVoice,
      rate: action.getParameter<number>('rate') || this.defaultRate,
      volume: action.getParameter<number>('volume') || this.defaultVolume,
      language: action.getParameter<string>('language') || this.defaultLanguage,
    };
  }

  /**
   * Simple intent inference from user text
   * Can be overridden for more sophisticated NLU
   */
  private inferIntent(text: string): string | undefined {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('help') || lowerText.includes('assist')) {
      return 'request_help';
    } else if (lowerText.includes('transfer') || lowerText.includes('speak to')) {
      return 'request_transfer';
    } else if (lowerText.includes('bye') || lowerText.includes('goodbye') || lowerText.includes('end')) {
      return 'end_conversation';
    } else if (lowerText.includes('?') || lowerText.includes('what') || lowerText.includes('how') || lowerText.includes('why')) {
      return 'ask_question';
    } else if (lowerText.includes('yes') || lowerText.includes('yeah') || lowerText.includes('correct')) {
      return 'confirm';
    } else if (lowerText.includes('no') || lowerText.includes('nope') || lowerText.includes('incorrect')) {
      return 'deny';
    }
    
    return 'general_statement';
  }

  /**
   * Clean up conversation state for a specific stream
   */
  cleanupStream(streamSid: string): void {
    this.conversationStates.delete(streamSid);
  }

  /**
   * Clean up all conversation states
   */
  cleanupAll(): void {
    this.conversationStates.clear();
  }

  /**
   * Get active stream count
   */
  getActiveStreamCount(): number {
    return this.conversationStates.size;
  }

  /**
   * Get conversation history for a stream
   */
  getStreamHistory(streamSid: string): ConversationTurn[] | undefined {
    return this.conversationStates.get(streamSid)?.history;
  }

  /**
   * Helper to create TwiML for initiating ConversationRelay connection
   * This should be used in your HTTP endpoint that Twilio calls
   */
  static createConnectTwiML(options: {
    websocketUrl: string;
    welcomeGreeting?: string;
    voice?: string;
    dtmfDetection?: boolean;
    interruptible?: boolean;
    actionUrl?: string;
  }): string {
    const {
      websocketUrl,
      welcomeGreeting = 'Hello!',
      voice,
      dtmfDetection = false,
      interruptible = true,
      actionUrl,
    } = options;

    let twiml = '<?xml version="1.0" encoding="UTF-8"?>';
    twiml += '<Response>';
    
    if (actionUrl) {
      twiml += `<Connect action="${actionUrl}">`;
    } else {
      twiml += '<Connect>';
    }
    
    twiml += `<ConversationRelay url="${websocketUrl}"`;
    twiml += ` welcomeGreeting="${welcomeGreeting}"`;
    
    if (voice) {
      twiml += ` voice="${voice}"`;
    }
    
    if (dtmfDetection) {
      twiml += ' dtmfDetection="true"';
    }
    
    if (!interruptible) {
      twiml += ' interruptible="false"';
    }
    
    twiml += '/>';
    twiml += '</Connect>';
    twiml += '</Response>';

    return twiml;
  }

  /**
   * Validate Twilio signature for WebSocket handshake security
   * See: https://www.twilio.com/docs/usage/security
   */
  static validateSignature(
    authToken: string,
    signature: string,
    url: string,
    params: Record<string, any> = {}
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require('crypto');
    
    // Build the data string
    let data = url;
    
    // Sort params and append
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }
    
    // Create HMAC
    const hmac = crypto.createHmac('sha1', authToken);
    hmac.update(data, 'utf-8');
    const expectedSignature = hmac.digest('base64');
    
    return signature === expectedSignature;
  }
}

