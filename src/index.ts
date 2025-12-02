// Domain entities
export { State, ConversationState, ConversationTurn } from './domain/entities/State';
export { Action, ActionDefinition, ActionType, ActionSpace } from './domain/entities/Action';
export { Reward, RewardSignal, ConversationOutcome, RewardConfig } from './domain/entities/Reward';
export { 
  ConversationData,
  ConversationBatch,
  TrainingExample,
  TrainingDataset,
  Outcome,
} from './domain/entities/schema';

// Domain interfaces
export { IPolicy, PolicyConfig } from './domain/interfaces/IPolicy';
export { IPolicyStorage } from './domain/interfaces/IPolicyStorage';

// Domain base classes
export { Policy } from './domain/base/Policy';

// Domain services
export { Environment, EnvironmentConfig, StepResult } from './domain/services/Environment';

// Algorithm implementations
export { ContextualBandit, ContextualBanditConfig } from './infrastructure/algorithms/ContextualBandit';
export { EpsilonGreedy, EpsilonGreedyConfig } from './infrastructure/algorithms/EpsilonGreedy';

// Data infrastructure
export { IParser, BaseParser } from './infrastructure/data/Parser';
export { DefaultParser, FlexibleParser } from './infrastructure/data/DefaultParser';
export { MemoryStorage } from './infrastructure/storage/MemoryStorage';

// Adapter infrastructure
export { BaseAdapter, PlatformRequest, PlatformResponse, AdapterConfig } from './infrastructure/adapters/BaseAdapter';
export { VapiAdapter } from './infrastructure/adapters/VapiAdapter';
export { TwilioAdapter } from './infrastructure/adapters/TwilioAdapter';
export { 
  TwilioConversationRelayAdapter, 
  ConversationRelayConfig,
  ConversationRelayIncomingMessage,
  ConversationRelayOutgoingMessage,
  ConversationRelayMessageType
} from './infrastructure/adapters/TwilioConversationRelayAdapter';
export { WebhookAdapter } from './infrastructure/adapters/WebhookAdapter';

// Safety infrastructure
export { Guardrails, GuardrailConfig, GuardrailRule, Violation, CommonGuardrails } from './infrastructure/safety/Guardrails';
export { Monitor, MonitorConfig, LogEntry, Metric } from './infrastructure/safety/Monitor';

// Utilities
export { StateSchema, Feature, FeatureConfig } from './infrastructure/utils/StateSchema';

// Version
export const VERSION = '0.4.1';
