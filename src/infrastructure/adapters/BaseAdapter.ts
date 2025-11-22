import { State, ConversationState } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';
import { IPolicy } from '../../domain/interfaces/IPolicy';

/**
 * Request from a voice platform
 */
export interface PlatformRequest {
  /** Raw request payload */
  raw: any;
  
  /** Conversation state extracted from request */
  state?: ConversationState;
  
  /** Platform-specific metadata */
  metadata?: Record<string, any>;
}

/**
 * Response to send back to platform
 */
export interface PlatformResponse {
  /** The action to take */
  action: Action;
  
  /** Platform-specific response format */
  raw: any;
  
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  /** Policy to use for action selection */
  policy?: IPolicy;
  
  /** Whether to automatically update policy */
  autoUpdate?: boolean;
  
  /** Custom extractors for state features */
  featureExtractors?: Record<string, (request: any) => any>;
}

/**
 * Base adapter interface for voice platforms
 */
export abstract class BaseAdapter {
  protected policy: IPolicy | null;
  protected autoUpdate: boolean;
  protected featureExtractors: Record<string, (request: any) => any>;

  constructor(config: AdapterConfig = {}) {
    this.policy = config.policy ?? null;
    this.autoUpdate = config.autoUpdate ?? true;
    this.featureExtractors = config.featureExtractors ?? {};
  }

  /**
   * Set the policy
   */
  setPolicy(policy: IPolicy): void {
    this.policy = policy;
  }

  /**
   * Get the policy
   */
  getPolicy(): IPolicy | null {
    return this.policy;
  }

  /**
   * Handle incoming request from platform
   * @param request Raw request from the platform
   * @returns Response to send back
   */
  async handleRequest(request: any): Promise<PlatformResponse> {
    // Parse the request
    const platformRequest = this.parseRequest(request);

    // Extract state
    const state = this.extractState(platformRequest);

    // Select action using policy
    if (!this.policy) {
      throw new Error('No policy set. Call setPolicy() before handling requests.');
    }

    const action = await this.policy.selectAction(state);

    // Format response for platform
    const response = this.formatResponse(action, platformRequest);

    return response;
  }

  /**
   * Handle feedback/reward for a previous action
   * @param conversationId The conversation ID
   * @param state The state where action was taken
   * @param action The action that was taken
   * @param reward The reward received
   */
  async handleFeedback(
    _conversationId: string,
    state: State,
    action: Action,
    reward: number
  ): Promise<void> {
    if (this.autoUpdate && this.policy) {
      await this.policy.update(state, action, reward);
    }
  }

  /**
   * Parse raw platform request into standard format
   * Must be implemented by platform-specific adapters
   */
  abstract parseRequest(request: any): PlatformRequest;

  /**
   * Extract conversation state from request
   * Must be implemented by platform-specific adapters
   */
  abstract extractState(request: PlatformRequest): State;

  /**
   * Format action as platform-specific response
   * Must be implemented by platform-specific adapters
   */
  abstract formatResponse(action: Action, request: PlatformRequest): PlatformResponse;

  /**
   * Register a custom feature extractor
   */
  registerFeatureExtractor(name: string, extractor: (request: any) => any): void {
    this.featureExtractors[name] = extractor;
  }

  /**
   * Extract features using registered extractors
   */
  protected extractCustomFeatures(request: any): Record<string, any> {
    const features: Record<string, any> = {};

    for (const [name, extractor] of Object.entries(this.featureExtractors)) {
      try {
        features[name] = extractor(request);
      } catch (error) {
        console.warn(`Feature extractor '${name}' failed:`, error);
      }
    }

    return features;
  }
}

