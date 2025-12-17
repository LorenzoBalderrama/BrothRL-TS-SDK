# BrothRL SDK

>  **The Broth to your AI kitchen 🍜**
>
> **Make your voice agents intelligent** - A TypeScript SDK for adding Reinforcement Learning to voice applications.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)

## What Problem Does It Solve?

Voice apps today make **dumb decisions**. They follow hard-coded conversation flows that can't adapt or optimize. BrothRL changes that by bringing Reinforcement Learning to voice applications.

### The Pain Points

- **Hard-coded flows**: Developers manually program "If user says X, then do Y"
- **No adaptation**: Can't learn from what actually works
- **Missed optimization**: No way to improve conversions, satisfaction, or efficiency
- **Wasted historical data**: Thousands of call recordings with no way to extract strategies
- **Messy Data**: Voice transcripts are unstructured and hard to learn from directly

### What This SDK Provides

- **Makes voice apps intelligent** - Apps learn what actions lead to success  
- **Abstracts RL complexity** - Developers don't need to be RL experts  
- **Turns data into strategy** - Historical calls → optimized policies  
- **Safe production deployment** - Built-in guardrails and fallbacks  
- **Platform agnostic** - Works with any voice platform (Vapi, Retell, Twilio, etc.)  
- **Continuous improvement** - Policies get better as more data comes in
- **Messy Data Solutions** - Built-in tools to convert raw text to structured states

## Quick Start

### Installation

```bash
npm install broth-rl-sdk
```

### Basic Usage

```typescript
import {
  Action,
  ActionSpace,
  ActionType,
  ContextualBandit,
  State,
} from 'broth-rl-sdk';

// 1. Define your action space
const actionSpace = new ActionSpace();
actionSpace.addAction(
  Action.create(ActionType.ASK_QUESTION, 'Ask for details', 'Get more info')
);
actionSpace.addAction(
  Action.create(ActionType.PROVIDE_INFO, 'Give solution', 'Solve problem')
);
actionSpace.addAction(
  Action.create(ActionType.TRANSFER_CALL, 'Transfer', 'Escalate to human')
);

// 2. Create a policy
const policy = new ContextualBandit({
  actionSpace,
  explorationRate: 0.1,
});

// 3. Use it in your conversation flow
const state = new State({
  conversationId: 'call_123',
  turnNumber: 1,
  history: [],
  features: {
    userIntent: 'billing_issue',
    sentiment: 'frustrated',
  },
});

// Select the best action
const action = policy.selectAction(state);
console.log('Agent should:', action.name);

// Update with reward when you know the outcome
policy.update(state, action, 1.0); // 1.0 for success, -1.0 for failure
```

## Core Concepts

### State

Represents the conversation context at any point in time:

```typescript
const state = new State({
  conversationId: 'call_123',
  turnNumber: 3,
  history: [
    { speaker: 'user', text: 'I need help', timestamp: '...' },
    { speaker: 'agent', text: 'How can I help?', timestamp: '...' },
  ],
  intent: 'support',
  features: {
    sentiment: 'neutral',
    accountAge: 'new',
  },
});
```

### Handling Messy Data (StateSchema)

**New in v0.4.0**: Voice data is messy. The `StateSchema` utility helps you convert raw text into structured features that the Bandit can actually learn from.

```typescript
import { StateSchema, Feature } from 'broth-rl-sdk';

// 1. Define your Schema (Zod-style)
const SalesState = StateSchema.define({
  // Enum: Buckets text into specific categories
  intent: Feature.enum(['price_objection', 'info_request', 'closing'])
    .matches({
      price_objection: ['too expensive', 'cost', 'price', 'budget'],
      info_request: ['tell me more', 'how does it work', 'details'],
      closing: ['buy', 'sign up', 'ready']
    })
    .default('info_request'),

  // Boolean: Detects presence of concepts
  is_angry: Feature.boolean()
    .matches({ 
      true: ['stupid', 'hate', 'annoying', 'stop'] 
    }),

  // Custom Extractor: For complex logic
  deal_size: Feature.number()
    .extract((text) => {
      const match = text.match(/\$(\d+)/);
      return match ? parseInt(match[1]) : 0;
    })
});

// 2. Auto-convert Text -> BrothRL State
const state = SalesState.toState("I think it's too expensive for my $500 budget.");

console.log(state.toJSON().features);
// Output: { intent: 'price_objection', is_angry: false, deal_size: 500 }
```

### Action

What the agent can do:

```typescript
const action = Action.create(
  ActionType.ASK_QUESTION,
  'Ask for order number',
  'Request the customer order number',
  { message: 'What is your order number?' }
);
```

### Policy

The "brain" that decides which action to take:

```typescript
const policy = new ContextualBandit({
  actionSpace,
  explorationRate: 0.1, // 10% random exploration
  useUCB: true, // Use upper confidence bound
});
```

### Reward

How you tell the agent what's good:

```typescript
const reward = new Reward();

// Immediate feedback
const immediate = reward.calculateImmediate(state, action, {
  sentiment: 'positive',
});

// Delayed feedback (at end of call)
const delayed = reward.calculateDelayed({
  success: true,
  metrics: { userSatisfaction: 0.9 },
});
```

## Safety & Guardrails

Production voice apps need safety constraints:

```typescript
import { Guardrails, CommonGuardrails } from 'broth-rl-sdk';

const guardrails = new Guardrails({
  rules: [
    CommonGuardrails.maxTurns(20), // Don't let conversations go too long
    CommonGuardrails.noRepeat(3), // Don't repeat the same action
    CommonGuardrails.rateLimit('transfer_call', 1), // Max 1 transfer per call
  ],
  defaultFallback: Action.create(ActionType.END_CALL, 'End gracefully', '...'),
});

// Validate actions before taking them
const safeAction = guardrails.validate(state, action);
```

## Monitoring

Track what your agent is doing:

```typescript
import { Monitor } from 'broth-rl-sdk';

const monitor = new Monitor();

// Log every action
monitor.log(state, action, reward);

// Get statistics
const stats = monitor.getOverallStats();
console.log('Action distribution:', stats.actionDistribution);
console.log('Average turns per conversation:', stats.averageTurnsPerConversation);

// Generate report
console.log(monitor.createReport());
```

## Platform Adapters

### Vapi

```typescript
import { VapiAdapter } from 'broth-rl-sdk';

const adapter = new VapiAdapter();
adapter.setPolicy(policy);

// In your webhook handler
app.post('/vapi-webhook', async (req, res) => {
  const response = await adapter.handleRequest(req.body);
  res.json(response.raw);
});
```

### Twilio Voice (TwiML)

```typescript
import { TwilioAdapter } from 'broth-rl-sdk';

const adapter = new TwilioAdapter({ actionUrl: '/voice/action' });
adapter.setPolicy(policy);

// In your webhook handler
app.post('/voice', async (req, res) => {
  const response = await adapter.handleRequest(req.body);
  res.type('text/xml').send(response.raw);
});
```

### Twilio ConversationRelay (Real-time WebSocket)

```typescript
import { TwilioConversationRelayAdapter } from 'broth-rl-sdk';

const adapter = new TwilioConversationRelayAdapter({
  policy,
  defaultVoice: 'Polly.Joanna',
  welcomeGreeting: 'Hi! How can I help you today?',
});

// HTTP endpoint for incoming calls
app.post('/voice', (req, res) => {
  const twiml = TwilioConversationRelayAdapter.createConnectTwiML({
    websocketUrl: 'wss://your-server.com/websocket',
    welcomeGreeting: 'Hi! How can I help you today?',
  });
  res.type('text/xml').send(twiml);
});

// WebSocket handler for real-time conversation
wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());
    const response = await adapter.handleRequest(message);
    ws.send(JSON.stringify(response.raw));
  });
});
```

### Generic Webhook

```typescript
import { WebhookAdapter } from 'broth-rl-sdk';

const adapter = new WebhookAdapter();
adapter.setPolicy(policy);

const response = await adapter.handleRequest({
  conversationId: 'call_123',
  userInput: 'I need help',
  event: 'user_message',
});
```

## Training from Historical Data

Turn your existing call logs into an optimized policy:

```typescript
import { FlexibleParser } from 'broth-rl-sdk';

// 1. Load your conversation data
const conversations = [
  {
    id: 'conv_001',
    turns: [
      { speaker: 'user', text: 'Help with billing', intent: 'billing' },
      { 
        speaker: 'agent', 
        text: 'Let me help',
        action: { type: 'ask_question', name: 'Ask for details' }
      },
    ],
    outcome: { success: true, userSatisfaction: 0.9 },
  },
  // ... more conversations
];

// 2. Parse into training format
const parser = new FlexibleParser();
const dataset = parser.toTrainingDataset(conversations);

// 3. Train policy
for (const example of dataset.examples) {
  const state = new State({
    conversationId: 'training',
    turnNumber: 0,
    history: [],
    features: example.state,
  });
  
  const action = actionSpace.getAction(example.action.type);
  if (action) {
    policy.update(state, action, example.reward);
  }
}

// 4. Save trained policy
const policyData = policy.toJSON();
fs.writeFileSync('trained_policy.json', JSON.stringify(policyData));
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Voice Platform                 │
│            (Vapi, Twilio, Custom)              │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│              Platform Adapter                   │
│         (Translates platform ↔ SDK)            │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│                 Guardrails                      │
│            (Safety Constraints)                 │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│                   Policy                        │
│         (RL Algorithm - Selects Action)        │
└────────────────┬────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────┐
│                  Monitor                        │
│           (Tracks Performance)                  │
└─────────────────────────────────────────────────┘
```

## What's Included

### Core Components
- **State**: Conversation state representation
- **Action**: Action definitions and space
- **Policy**: RL policy interface
- **Reward**: Reward calculation
- **Environment**: Simulation environment

### Algorithms
- **ContextualBandit**: Simple, effective RL for action selection
- **EpsilonGreedy**: Exploration strategy

### Data
- **Schema**: Standard conversation data format
- **Parsers**: Convert various formats to training data
- **FlexibleParser**: Handles different conversation log formats
- **StateSchema** (New): Zod-like tool to convert text to structured features

### Adapters
- **VapiAdapter**: Vapi platform integration
- **TwilioAdapter**: Twilio Voice integration
- **WebhookAdapter**: Generic webhook integration

### Safety
- **Guardrails**: Safety rules and constraints
- **Monitor**: Logging and performance tracking

## Examples

The snippets above show basic usage. Complete example applications are coming soon.

## Testing

```bash
npm test
```

## Roadmap

- [ ] More RL algorithms (Q-Learning, Policy Gradients)
- [ ] Advanced reward shaping
- [ ] Multi-objective optimization
- [ ] A/B testing framework
- [ ] Cloud-based policy training
- [ ] Pre-trained policies for common use cases

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: [GitHub Issues](https://github.com/LorenzoBalderrama/RL-Voice-SDK/issues)
- **Discussions**: [GitHub Discussions](https://github.com/LorenzoBalderrama/RL-Voice-SDK/discussions)

## Acknowledgments

Built with inspiration from:
- OpenAI's work on RLHF
- DeepMind's RL research
- The voice AI community

---

**Made with ❤️ for the voice AI community**
