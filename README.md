# Noomachy

**Tamper-proof memory for compliance-bound AI agents.**

Noomachy is the only agent memory layer with human-in-the-loop fact validation,
SHA-256 hash-chained audit trails, and tenant isolation by default. Built for
legal, healthcare, and finance teams who need every fact their AI agents recall
to be defensible after the fact.

## What's different

Most agent memory layers passively extract facts and write them straight to
storage. When an auditor asks "where did this claim come from," there's no
chain to follow.

Noomachy works differently:

1. **Validation gate.** No memory reaches long-term storage without passing
   through a staging queue. Cosine-similarity dedup, contradiction detection,
   and plain-English explanations let a human approve or reject each fact.
2. **Hash-chained audit log.** Every approval, rejection, and tool call is
   sealed with SHA-256 and linked to its predecessor. Modifying any earlier
   entry invalidates every later hash. Verification is one click.
3. **Per-tenant cost guardrail.** A daily USD cap (default $5) shuts off
   expensive operations before they become a Firebase bill. Override per
   tenant when needed.
4. **Signed share links for auditors.** "Share audit trail" mints a 7-day
   HMAC-signed URL that exposes a single memory's lineage to outside counsel
   without provisioning accounts.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                Next.js dashboard                        │
│  Memory explorer · Validation queue · Audit trail UI    │
└─────────────────────┬───────────────────────────────────┘
                      │ Firestore real-time sync
┌─────────────────────┴───────────────────────────────────┐
│           Cloud Functions (Gen 2, Node 20)              │
│  agentRouter   validationGate   auditShare/mintToken    │
│  budgetGuard   memoryManager    auditLogger (chain)     │
└─────────────────────┬───────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────┐
│                Data layer                                │
│  Firestore (multi-tenant, isolated by ownerId)          │
│  Vertex AI textembedding-gecko (768-dim, capped input)  │
│  auditLogs (append-only, hash-chained per memoryId)     │
└─────────────────────────────────────────────────────────┘
```

## Three-layer memory

| Layer | Name | Purpose | TTL |
|-------|------|---------|-----|
| L1 | Working memory | Active session context, last 20 messages | 24 hours |
| L2 | Semantic memory | Validated long-term facts. Goes through the gate. | Permanent (or one-click purge) |
| L3 | Episodic memory | Append-only decision log. Append-only. | Permanent |

## Trust posture

Noomachy ships the technical controls compliance teams ask for. We are not
yet certified — certification depends on your specific deployment. The
substrate is here; your auditor signs off.

- **Tamper-evident audit log** — SHA-256 chained per memoryId.
- **Tenant-isolated, encrypted at rest** — Firestore security rules enforce
  cross-tenant blocks; encryption at rest is on by default.
- **Right-to-erasure** — TTL on working memory, manual purge on semantic
  memory, every deletion recorded in the audit chain.

## Cost guardrails

Each tenant has a per-day USD cap. Default is `$5/day`, set in
`functions/src/cost/budgetGuard.ts:MAX_DAILY_COST_USD`. Per-tenant overrides
live in `users/{tenantId}.dailyCapOverrideUSD`.

When a tenant approaches 80% of cap, every LLM/embedding call logs a warning.
At 100%, the next request fails closed with HTTP 429 and a clear error message.
The cap resets at 00:00 UTC.

See `COST.md` for the cost model and tuning guide.

## Tech stack

- **Frontend** Next.js 16, React 19, TypeScript, Tailwind
- **Backend** Firebase Cloud Functions Gen 2, Node 20
- **Database** Firestore (Native mode), append-only audit collection
- **Vector search** Vertex AI textembedding-gecko@003 (768-dim)
- **LLM** Anthropic Claude (primary), Google Gemini (cost-tier fallback)
- **Auth** Firebase Authentication

## Setup

```bash
# Install
cd functions && npm install && cd ..
cd web && npm install && cd ..

# Configure
cp .env.example .env
cp functions/.env.example functions/.env

# Set required secrets
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set AUDIT_SHARE_SECRET   # any high-entropy 32+ byte string
firebase functions:secrets:set MCP_SERVER_SECRET
firebase functions:secrets:set SERPER_API_KEY
```

## Local dev

```bash
./scripts/emulator.sh                   # Firebase emulators
cd web && npm run dev                   # Next.js
cd seed && npx ts-node legal-demo.ts    # Seed legal contract review demo
```

## Deploy

```bash
./scripts/deploy.sh all
# or selectively:
./scripts/deploy.sh functions
./scripts/deploy.sh hosting
./scripts/deploy.sh rules
./scripts/deploy.sh indexes
```

## Project layout

```
noomachy/
├── functions/src/
│   ├── agents/          # router, orchestrator, mcpExecutor
│   ├── audit/           # share endpoint, mintToken (signed links)
│   ├── channels/        # telegram, discord, slack adapters
│   ├── cost/            # budgetGuard.ts (per-tenant daily cap)
│   ├── mcp/             # MCP server + built-in tools
│   ├── memory/          # memoryManager, validationGate, vectorSearch
│   ├── security/        # auditLogger (hash-chained)
│   └── triggers.ts      # Firestore triggers for staging → semantic
├── web/src/
│   ├── app/
│   │   ├── audit/share/                      # public signed-link viewer
│   │   ├── audit/[agentId]/[memoryId]/       # owner audit trail
│   │   ├── dashboard/memory/                 # memory explorer
│   │   ├── dashboard/validation/             # validation queue page
│   │   └── page.tsx                          # landing (legal vertical)
│   └── components/
│       ├── memory/      # MemoryExplorer, MemoryGraph, ValidationQueue
│       └── ...
├── seed/                # demo data (legal contract review)
├── ROADMAP.md           # what's shipped / blocked-on-validation / next
└── COST.md              # Firebase bill model + tuning guide
```

## Tests

Audit log integrity is unit-tested. Other surfaces are validated manually until
we have paying customers.

```bash
cd functions && npm test
```

## License

Proprietary. All rights reserved.
