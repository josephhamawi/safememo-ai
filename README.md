# Noomachy

**Next-generation AI Agent Platform with Sovereign Memory**

Noomachy is a multi-tenant AI agent platform built on Firebase's serverless architecture. It features a three-layer sovereign memory system, real-time collaborative agents, MCP-based skill execution, and multi-channel deployment.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Firebase Hosting                       │
│              Next.js 14 (App Router)                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Sidebar   │  │ Chat         │  │ Right Panel       │  │
│  │ - Agents  │  │ - Messages   │  │ - Memory Graph    │  │
│  │ - Convos  │  │ - Streaming  │  │ - Tools           │  │
│  │ - Skills  │  │ - Input      │  │ - Timeline        │  │
│  └──────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │ Firestore Real-time Sync
┌─────────────────────┴───────────────────────────────────┐
│               Cloud Functions (Gen 2)                    │
│  ┌────────────┐ ┌───────────┐ ┌────────────────────┐   │
│  │ Agent      │ │ Channel   │ │ MCP Server         │   │
│  │ Router     │ │ Adapters  │ │ - file_operations  │   │
│  │ Orchestr.  │ │ Telegram  │ │ - web_search       │   │
│  │ Memory Mgr │ │ Discord   │ │ - code_execution   │   │
│  │            │ │ Slack     │ │ - database_query   │   │
│  └────────────┘ └───────────┘ └────────────────────┘   │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│                    Data Layer                             │
│                                                          │
│  Firestore (Native)           Vertex AI Vector Search    │
│  ┌─────────────────┐         ┌───────────────────┐      │
│  │ L1: Working     │ ←sync→  │ 768-dim Embeddings │      │
│  │ L2: Semantic    │ ←search→│ textembedding-     │      │
│  │ L3: Episodic    │         │ gecko@003          │      │
│  └─────────────────┘         └───────────────────┘      │
│                                                          │
│  Firebase Auth    Cloud Storage    Audit Logs            │
│  (Google/GitHub)  (Attachments)    (Tamper-proof)        │
└─────────────────────────────────────────────────────────┘
```

## Three-Layer Sovereign Memory

| Layer | Name | Purpose | TTL |
|-------|------|---------|-----|
| L1 | Working Memory | Active session context, last 20 messages | 24 hours |
| L2 | Semantic Memory | Long-term knowledge with vector embeddings | Permanent |
| L3 | Episodic Memory | Decision logs, tool call history | Permanent |

**Key Innovation: Validation Gate**
All L2 writes go through a human-in-the-loop validation workflow. New facts are staged, checked for duplicates/contradictions, and require approval before becoming permanent knowledge. Auto-approval rules reduce friction for high-confidence, non-contradictory data.

## Tech Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, D3.js
- **Backend:** Firebase Cloud Functions Gen 2, Node.js 20
- **Database:** Firestore (Native mode)
- **Vector Search:** Vertex AI (textembedding-gecko@003, 768 dims)
- **AI:** Anthropic Claude (primary), Google Gemini (fallback)
- **Auth:** Firebase Authentication (Google, GitHub, Email)
- **Storage:** Firebase Cloud Storage
- **Tools:** MCP (Model Context Protocol) with sandboxed execution

## Quick Start

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm i -g firebase-tools`)
- Firebase project (create at [console.firebase.google.com](https://console.firebase.google.com))

### Setup

```bash
# Clone and install
cd noomachy
cd functions && npm install && cd ..
cd web && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your Firebase config and API keys

cp functions/.env.example functions/.env
# Edit functions/.env with your Anthropic API key and other secrets
```

### Local Development (Emulators)

```bash
# Start Firebase emulators
./scripts/emulator.sh

# In another terminal, start Next.js dev server
cd web && npm run dev

# (Optional) Seed sample data
cd seed && npx ts-node seed.ts
```

The emulator UI is at http://localhost:4000 and the web app at http://localhost:3000.

### Deploy to Firebase

```bash
# Deploy everything
./scripts/deploy.sh all

# Or deploy individually
./scripts/deploy.sh functions
./scripts/deploy.sh hosting
./scripts/deploy.sh rules
./scripts/deploy.sh indexes
```

### Set Firebase Secrets

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set MCP_SERVER_SECRET
firebase functions:secrets:set SERPER_API_KEY
# Add channel tokens as needed
```

## Project Structure

```
noomachy/
├── firebase.json              # Firebase configuration
├── firestore.rules            # Security rules
├── firestore.indexes.json     # Composite indexes
├── storage.rules              # Storage security rules
├── functions/                 # Cloud Functions (backend)
│   └── src/
│       ├── agents/            # Router, orchestrator, MCP executor
│       ├── channels/          # Telegram, Discord, Slack adapters
│       ├── mcp/               # MCP server + built-in tools
│       │   └── tools/         # file_operations, web_search, etc.
│       ├── memory/            # Memory manager, validation, consolidation
│       ├── security/          # Sandbox, audit logger
│       ├── types/             # Shared TypeScript interfaces
│       ├── triggers.ts        # Firestore triggers
│       └── index.ts           # Function exports
├── web/                       # Next.js frontend
│   └── src/
│       ├── app/               # App Router pages
│       │   ├── auth/          # Login page
│       │   ├── dashboard/     # Main dashboard
│       │   └── api/           # API routes
│       ├── components/        # React components
│       │   ├── chat/          # Chat interface
│       │   ├── memory/        # Memory graph, explorer, validation
│       │   ├── collaborative/ # Presence, timeline
│       │   └── dashboard/     # Notifications, skill marketplace
│       ├── hooks/             # Custom React hooks
│       ├── store/             # Zustand state management
│       ├── lib/               # Firebase client config
│       └── types/             # Client-side types
├── seed/                      # Sample data for development
├── scripts/                   # Deployment and dev scripts
└── README.md
```

## Sample Agents

The seed data includes four pre-configured agents:

| Agent | Type | Description |
|-------|------|-------------|
| **Atlas** | General | Broad knowledge assistant |
| **Forge** | Code | Software development specialist |
| **Sage** | Research | Deep analysis and synthesis |
| **Muse** | Creative | Writing and brainstorming partner |

## Testing

```bash
# Run Cloud Functions tests
cd functions && npm test

# Run with coverage
cd functions && npx jest --coverage
```

## Environment Variables

### Web App (.env)
| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config (from Firebase Console) |
| `NEXT_PUBLIC_USE_EMULATORS` | Set to 'true' for local development |

### Cloud Functions (functions/.env or Firebase Secrets)
| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Claude API key |
| `VERTEX_AI_PROJECT_ID` | GCP project for embeddings |
| `MCP_SERVER_SECRET` | Secret for MCP server auth |
| `SERPER_API_KEY` | Web search API key |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `DISCORD_BOT_TOKEN` | Discord bot token |
| `SLACK_BOT_TOKEN` | Slack bot token |

## License

Proprietary - All Rights Reserved
