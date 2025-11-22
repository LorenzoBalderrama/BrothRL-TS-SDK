import { BaseAdapter, PlatformRequest, PlatformResponse, AdapterConfig } from './BaseAdapter';
import { State, ConversationState, ConversationTurn } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Twilio request structure
 * Based on Twilio's Voice API
 */
interface TwilioRequest {
  /** Call SID */
  CallSid?: string;
  
  /** From number */
  From?: string;
  
  /** To number */
  To?: string;
  
  /** Call status */
  CallStatus?: string;
  
  /** Speech result (from Gather) */
  SpeechResult?: string;
  
  /** Digits pressed (from Gather) */
  Digits?: string;
  
  /** Conversation context (custom) */
  conversationContext?: string;
  
  /** Custom parameters */
  [key: string]: any;
}

/**
 * TwiML response builder
 */
class TwiMLBuilder {
  private elements: string[] = [];

  say(text: string, voice?: string): this {
    const voiceAttr = voice ? ` voice="${voice}"` : '';
    this.elements.push(`<Say${voiceAttr}>${this.escape(text)}</Say>`);
    return this;
  }

  gather(options: {
    input?: string[];
    timeout?: number;
    numDigits?: number;
    action?: string;
    method?: string;
  }): this {
    const input = options.input?.join(' ') || 'speech';
    const timeout = options.timeout || 3;
    const numDigits = options.numDigits;
    const action = options.action || '';
    const method = options.method || 'POST';

    let attrs = `input="${input}" timeout="${timeout}"`;
    if (numDigits) attrs += ` numDigits="${numDigits}"`;
    if (action) attrs += ` action="${action}" method="${method}"`;

    this.elements.push(`<Gather ${attrs}></Gather>`);
    return this;
  }

  redirect(url: string, method?: string): this {
    const methodAttr = method ? ` method="${method}"` : '';
    this.elements.push(`<Redirect${methodAttr}>${this.escape(url)}</Redirect>`);
    return this;
  }

  hangup(): this {
    this.elements.push('<Hangup/>');
    return this;
  }

  dial(number: string): this {
    this.elements.push(`<Dial>${this.escape(number)}</Dial>`);
    return this;
  }

  pause(length?: number): this {
    const lengthAttr = length ? ` length="${length}"` : '';
    this.elements.push(`<Pause${lengthAttr}/>`);
    return this;
  }

  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  build(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${this.elements.join('')}</Response>`;
  }
}

/**
 * Twilio adapter for voice conversations
 */
export class TwilioAdapter extends BaseAdapter {
  private actionUrl: string;

  constructor(config: AdapterConfig & { actionUrl?: string } = {}) {
    super(config);
    this.actionUrl = config.actionUrl || '/voice/action';
  }

  /**
   * Parse Twilio request
   */
  parseRequest(request: any): PlatformRequest {
    return {
      raw: request,
      metadata: {
        platform: 'twilio',
        callSid: request.CallSid,
        from: request.From,
        to: request.To,
      },
    };
  }

  /**
   * Extract conversation state from Twilio request
   */
  extractState(request: PlatformRequest): State {
    const twilioReq = request.raw as TwilioRequest;

    // Parse conversation context if available
    let history: ConversationTurn[] = [];
    let turnNumber = 0;
    
    if (twilioReq.conversationContext) {
      try {
        const context = JSON.parse(twilioReq.conversationContext);
        history = context.history || [];
        turnNumber = context.turnNumber || 0;
      } catch (e) {
        // Invalid context, start fresh
      }
    }

    // Add current user input if available
    if (twilioReq.SpeechResult) {
      history.push({
        speaker: 'user',
        text: twilioReq.SpeechResult,
        timestamp: new Date().toISOString(),
      });
      turnNumber++;
    } else if (twilioReq.Digits) {
      history.push({
        speaker: 'user',
        text: `Pressed: ${twilioReq.Digits}`,
        timestamp: new Date().toISOString(),
      });
      turnNumber++;
    }

    // Extract features
    const features: Record<string, any> = {
      callStatus: twilioReq.CallStatus || 'unknown',
      hasDigits: !!twilioReq.Digits,
      hasSpeech: !!twilioReq.SpeechResult,
      ...this.extractCustomFeatures(request.raw),
    };

    const conversationState: ConversationState = {
      conversationId: twilioReq.CallSid || `twilio_${Date.now()}`,
      turnNumber,
      history,
      features,
      userInfo: {
        phoneNumber: twilioReq.From,
      },
      metadata: {
        platform: 'twilio',
        to: twilioReq.To,
        callStatus: twilioReq.CallStatus,
      },
    };

    return new State(conversationState);
  }

  /**
   * Format action as Twilio TwiML response
   */
  formatResponse(action: Action, request: PlatformRequest): PlatformResponse {
    const twiml = new TwiMLBuilder();
    const twilioReq = request.raw as TwilioRequest;

    // Build conversation context for next request
    const currentState = this.extractState(request);
    const conversationContext = JSON.stringify({
      history: currentState.data.history,
      turnNumber: currentState.data.turnNumber,
    });

    switch (action.type) {
      case 'ask_question':
        twiml.say(action.getParameter<string>('message') || action.name);
        twiml.gather({
          input: ['speech'],
          timeout: action.getParameter<number>('timeout') || 3,
          action: `${this.actionUrl}?conversationContext=${encodeURIComponent(conversationContext)}`,
        });
        break;

      case 'provide_info':
        twiml.say(action.getParameter<string>('message') || action.description);
        twiml.redirect(`${this.actionUrl}?conversationContext=${encodeURIComponent(conversationContext)}`);
        break;

      case 'transfer_call': {
        const message = action.getParameter<string>('message') || 'Transferring your call. Please hold.';
        twiml.say(message);
        twiml.dial(action.getParameter<string>('phoneNumber') || '');
        break;
      }

      case 'end_call':
        twiml.say(action.getParameter<string>('message') || 'Thank you for calling. Goodbye!');
        twiml.hangup();
        break;

      case 'clarify':
        twiml.say(action.getParameter<string>('message') || 'I\'m sorry, could you repeat that?');
        twiml.gather({
          input: ['speech'],
          timeout: 3,
          action: `${this.actionUrl}?conversationContext=${encodeURIComponent(conversationContext)}`,
        });
        break;

      default:
        // Custom action
        twiml.say(action.name);
        twiml.redirect(`${this.actionUrl}?conversationContext=${encodeURIComponent(conversationContext)}`);
    }

    return {
      action,
      raw: twiml.build(),
      metadata: {
        platform: 'twilio',
        callSid: twilioReq.CallSid,
        contentType: 'text/xml',
      },
    };
  }

  /**
   * Set the action URL for callbacks
   */
  setActionUrl(url: string): void {
    this.actionUrl = url;
  }

  /**
   * Helper to check if call ended
   */
  isCallEnded(request: any): boolean {
    return request.CallStatus === 'completed' || request.CallStatus === 'no-answer';
  }
}

