import type { BlogPost } from './types';

export const POSTS: BlogPost[] = [
  {
    slug: 'what-is-an-ai-agent',
    title: 'What Is an AI Agent? A Complete Guide for 2026',
    description: 'AI agents are not chatbots. Learn the difference between LLM chatbots and true AI agents that take actions, remember context, and use tools autonomously.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '7 min read',
    tags: ['AI Agents', 'Beginner', 'LLM', 'Automation'],
    category: 'AI Agents',
    content: `
# What Is an AI Agent? A Complete Guide for 2026

AI agents are everywhere in 2026, but most people still confuse them with chatbots. The distinction matters — a chatbot responds; an agent acts.

## The Core Definition

An **AI agent** is a system that uses a large language model (LLM) as its reasoning engine, combined with three things a chatbot lacks:

1. **Tools** — concrete actions it can perform in the real world (read your emails, query a database, run code)
2. **Memory** — persistent state that survives across conversations
3. **Autonomy** — the ability to plan multi-step tasks and execute them without checking in for every step

Where ChatGPT only generates text, an agent can read your inbox, summarize the urgent items, draft replies, and schedule follow-ups — all from a single instruction.

## Why "Agents" Are a 2026 Story

Three things converged in 2025 that made true agents practical:

- **Tool use APIs matured** — Anthropic's tool calling and OpenAI's function calling became reliable enough for production
- **Context windows exploded** — 1M+ token windows made it possible to load entire conversations and documents
- **Standards emerged** — the Model Context Protocol (MCP) gave us a universal way to expose any service as an agent tool

The result: we can finally build agents that aren't just demos.

## What Makes an Agent "Sovereign"

Most cloud chatbots forget you the moment your session ends. A *sovereign* agent keeps its own memory — facts about you, past decisions, lessons learned — that you control. This is the architectural choice behind [Noomachy](/), where every agent runs on three layers of memory: working, semantic, and episodic.

Read more: [Sovereign Memory: Why AI Agents Need Their Own Brain](/blog/sovereign-memory)

## Agents vs Chatbots: A Side-by-Side

| Feature | Chatbot | AI Agent |
|---|---|---|
| Generates text | Yes | Yes |
| Uses tools | No | Yes |
| Remembers across sessions | No | Yes |
| Plans multi-step tasks | No | Yes |
| Takes actions in your apps | No | Yes |
| Costs more per query | No | Sometimes |

## Common Misconceptions

**"I already use ChatGPT, that's an agent."** Not quite — until you give it tools and memory it's just a more polished chatbot. ChatGPT with the GPT-store actions starts to look like an agent.

**"Agents are just complicated workflows."** They're closer to autonomous systems. A workflow runs predetermined steps; an agent decides which steps to run based on context.

**"Agents will replace SaaS."** Probably not soon. Agents will *use* SaaS — calling APIs, automating UIs, stitching tools together — but the underlying services still need to exist.

## Getting Started

The fastest way to experience a real AI agent is to try one. Noomachy lets you create personal agents with sovereign memory in under a minute. You can connect them to your email, calendar, notes, files, and more — and they remember everything between sessions.

[Request early access →](/#early-access)

## Further Reading

- [The Three-Layer Memory System Powering Smart AI Agents](/blog/three-layer-memory)
- [Model Context Protocol (MCP) Explained](/blog/mcp-explained)
- [Building a Personal AI Assistant That Actually Remembers You](/blog/personal-ai-assistant)
`,
  },

  {
    slug: 'sovereign-memory',
    title: 'Sovereign Memory: Why AI Agents Need Their Own Brain',
    description: 'Cloud-only AI forgets you. Sovereign memory means your agent keeps a private, persistent memory that you control. Here is how it works.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Memory', 'Privacy', 'Architecture'],
    category: 'Memory',
    content: `
# Sovereign Memory: Why AI Agents Need Their Own Brain

Most AI services have a memory problem: they don't have one. Every conversation starts from scratch. The model knows nothing about you, your work, or what you discussed yesterday.

This is fine for one-off questions. It's terrible for an agent that's supposed to be your assistant.

## The Sovereign Memory Approach

A sovereign memory system means three things:

1. **Persistent** — facts survive across sessions, devices, and restarts
2. **Owned** — the data lives in your account, not the model provider's logs
3. **Private** — it's encrypted, scoped to you, and never leaves your tenant

When your agent learns that you live in Beirut, work in fintech, prefer concise replies, and have a meeting with your CTO every Tuesday — those facts go into *your* memory, not OpenAI's training data.

## How Noomachy Implements It

Noomachy splits memory into three layers, modeled loosely on human cognition:

- **L1 — Working Memory** (the last 50 messages of the current conversation)
- **L2 — Semantic Memory** (validated long-term facts about you)
- **L3 — Episodic Memory** (records of past decisions and their outcomes)

Each layer has a specific job. Working memory keeps the conversation coherent. Semantic memory holds facts that get loaded into every future conversation. Episodic memory lets the agent learn from what worked and what didn't.

[Read the deep-dive on the three layers →](/blog/three-layer-memory)

## Why "Sovereign" Matters

Cloud AI providers have every incentive to keep your data — it improves their training, their products, and their lock-in. Sovereign memory inverts this: the data belongs to you, the provider just runs the model.

The practical implications:

- **You can export it.** Take your memory with you if you switch providers.
- **You can delete it.** Forget anything anytime, with full control.
- **It can't leak.** A breach of the model API doesn't expose your facts.
- **It works offline.** Local-first architectures mean your memory follows you.

## The Validation Gate

Sovereign memory has a downside: garbage in, garbage out. If the agent saves every random thing the user says, the memory becomes a junk drawer.

Noomachy solves this with a *validation gate*. Before any new fact gets promoted from staging to permanent semantic memory, the system runs three checks:

1. **Duplicate detection** — vector search compares the new fact to existing ones
2. **Contradiction check** — flags anything that conflicts with prior memories
3. **Confidence scoring** — facts below 0.85 confidence need human review

This is the difference between an agent that learns and an agent that hallucinates.

## What You Can Do With Sovereign Memory

- **Personalization that actually works.** The agent knows your preferences without you re-explaining them every time.
- **Cross-session continuity.** Yesterday's conversation is context for today's.
- **Multi-agent collaboration.** Multiple specialized agents can share the same memory pool.
- **Audit trails.** Every memory has a source, a timestamp, and a confidence score.

## Try It

[Noomachy](/) is built on sovereign memory from day one. Request early access and watch your agent's memory get sharper with every validated fact.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'three-layer-memory',
    title: 'The Three-Layer Memory System Powering Smart AI Agents',
    description: 'Working memory, semantic memory, and episodic memory — how a three-layer architecture makes AI agents actually remember and learn.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '8 min read',
    tags: ['Memory', 'Architecture', 'Advanced'],
    category: 'Memory',
    content: `
# The Three-Layer Memory System Powering Smart AI Agents

Most "AI memory" implementations are just key-value stores that save the last N messages. That's not memory. That's a buffer.

Real memory has structure. Inspired by cognitive science, [Noomachy](/) uses a three-layer architecture: working, semantic, and episodic. Each layer does something specific, and together they let an agent actually learn over time.

## L1 — Working Memory

Working memory is the agent's current focus. It contains the last N messages of the active conversation, the tools it has loaded, and any temporary variables the current task needs.

**Lifetime:** 24 hours, then it expires.
**Scope:** Per conversation.
**Purpose:** Keep the conversation coherent.

When you start a new conversation, working memory is fresh. When you say *"as I mentioned before"*, the agent looks here first. If it's not in working memory, it searches the next layer.

## L2 — Semantic Memory

Semantic memory is the long-term knowledge layer. It stores facts about you, your projects, your preferences — anything that should persist forever.

Each fact in semantic memory has:
- A **content string** ("User prefers TypeScript over JavaScript")
- A **confidence score** (0.0 to 1.0)
- A **source** (conversation, document, episodic promotion)
- A **vector embedding** for similarity search
- **Tags** for filtering
- A **last-accessed timestamp**

When you start a new conversation, the agent runs a vector search against semantic memory to find the top-K most relevant facts and injects them into the system prompt. This is how the agent "remembers" you across sessions.

**Lifetime:** Forever (until you delete it).
**Scope:** Per agent (or shared across agents if you choose).
**Purpose:** Long-term knowledge.

### The Validation Gate

You can't just write everything to semantic memory or it becomes useless. New facts go through a **validation gate**:

1. **Duplicate check** — cosine similarity vs existing memories. > 0.92 = duplicate, reject.
2. **Contradiction check** — does this conflict with an existing high-confidence fact?
3. **Auto-approval rule** — if confidence > 0.85 and no conflicts, promote. Otherwise queue for human review.

Read more: [Why Validation Gates Matter in AI Memory Systems](/blog/validation-gates)

## L3 — Episodic Memory

Episodic memory is the diary. Every time the agent completes a task, it logs an *episode*: what was asked, what tools were used, what the outcome was, what could have gone better.

Each episode contains:
- **Task domain** (research, coding, planning, etc.)
- **Session snapshot** (message count, tools used, summary)
- **Outcome** (success / failure / partial)
- **Lessons learned** (extracted by the model after the fact)
- **Tool calls** with timing and results
- **Consolidation score** (how valuable this memory is for future learning)

**Lifetime:** Forever (append-only).
**Scope:** Per agent.
**Purpose:** Learn from experience.

### Episodic Consolidation

Every six hours, a background job clusters similar episodes and promotes the highest-scoring ones to semantic memory. This is how an agent learns patterns: not from training, but from its own history.

## How the Layers Work Together

Imagine you ask your agent: *"Schedule a meeting with Sarah tomorrow at 3pm."*

1. **Working memory** holds the conversation context and any partial info you've shared today.
2. **Semantic memory** is queried: who is Sarah? Vector search returns *"Sarah Johnson is the user's CTO, sarah@acme.com, prefers Zoom over Google Meet"*.
3. **Episodic memory** is checked: have we scheduled meetings with Sarah before? Yes — last time we used calendar_create with the Zoom link in the location field.
4. **Tools** are called: calendar_create with the right defaults.
5. After completion, an **episode is logged** for next time.

This is what a sovereign agent looks like in motion. No model retraining, no manual prompt engineering — just structured memory.

## Try It

Noomachy ships with all three layers active by default. Start chatting and watch your Memory tab fill up with facts the agent has learned.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'mcp-explained',
    title: 'Model Context Protocol (MCP) Explained: The Future of AI Tooling',
    description: 'MCP is the universal standard for connecting AI models to external tools and data. Here is what it is, how it works, and why it matters.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['MCP', 'Tools', 'Standards'],
    category: 'Tools',
    content: `
# Model Context Protocol (MCP) Explained: The Future of AI Tooling

Before MCP, every AI app reinvented the same wheel: how do I let the model call a tool? How do I expose my database to it? Each provider had its own format. Each tool was tightly coupled to one model.

MCP changes that. It's a universal protocol — like HTTP for the AI ecosystem.

## What MCP Actually Is

The **Model Context Protocol** is an open specification, originally introduced by Anthropic, that defines a standard way for AI models to:

- **List available tools** (\`/tools/list\`)
- **Call a tool** (\`/tools/call\`)
- **List available resources** (\`/resources/list\`)
- **Read a resource** (\`/resources/read\`)

That's it. Four endpoints, JSON in, JSON out. Any service can become an "MCP server" by implementing these endpoints, and any AI app can become an "MCP client" by calling them.

## Why It's a Big Deal

Before MCP, if you wanted to give Claude access to your Notion workspace, you had to:

1. Read Notion's API docs
2. Write a custom adapter for Claude's tool format
3. Re-write it for GPT-4, then again for Gemini
4. Maintain three versions forever

With MCP, Notion publishes one MCP server. Every model can use it. No adapters, no rewrites.

## The Two Roles

- **MCP Client** — the AI app (Claude, Noomachy, your custom agent). It discovers and calls tools.
- **MCP Server** — the service exposing tools (your database, your file system, an API wrapper).

A single AI app can connect to dozens of MCP servers simultaneously. Each one adds capabilities.

## How Noomachy Uses MCP

[Noomachy](/) is MCP-native from day one. Every tool — built-in or third-party — is exposed through the MCP protocol:

- **Built-in MCP server** — provides web search, file ops, code execution, database query
- **Custom MCP servers** — users can register any external MCP endpoint in [Skills → Add Custom MCP](/dashboard/skills)
- **Local MCP server** — the desktop app ships with a local MCP server that exposes Apple Mail, Notes, Calendar, Reminders, and more

The cloud agent calls all of these through the same protocol. Whether it's hitting a web API or your local Mac, the interface is identical.

## Building Your Own MCP Server

A minimal MCP server is just an HTTP service with two endpoints. Here's the shape:

\`\`\`
POST /tools/list
{ "tools": [{ "name": "...", "description": "...", "inputSchema": {...} }] }

POST /tools/call
{ "name": "tool_name", "arguments": { ... } }
→ { "content": [{ "type": "text", "text": "..." }] }
\`\`\`

That's literally it. Add authentication, rate limiting, and you have a production-ready MCP server.

## What Comes Next

MCP is rapidly becoming the de-facto standard. Expect to see:

- **Marketplaces** of MCP servers (we're building one in the [Noomachy Skill Marketplace](/dashboard/skills))
- **Local MCP servers** for every major desktop app
- **Cloud MCP gateways** that bundle multiple services
- **MCP-to-MCP routing** so agents can compose tools from multiple sources

If you're building an AI app today and not using MCP, you're locking yourself into one vendor.

## Try It

Noomachy lets you use built-in MCP tools immediately and add your own with one click.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'claude-vs-gemini-2026',
    title: 'Claude vs Gemini: Which AI Model Is Right for Your Agent in 2026',
    description: 'A practical comparison of Anthropic Claude and Google Gemini for building production AI agents — pricing, tool use, context, and real-world tradeoffs.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '7 min read',
    tags: ['Claude', 'Gemini', 'Comparison'],
    category: 'Comparisons',
    content: `
# Claude vs Gemini: Which AI Model Is Right for Your Agent in 2026

If you're building an AI agent in 2026, your two best options are Anthropic's Claude and Google's Gemini. Both are excellent. They're also surprisingly different in practice.

This isn't a benchmark shootout — it's a practical comparison from building [Noomachy](/), a production agent platform that supports both models.

## Quick Verdict

- **Claude** — better at structured reasoning, tool use, and following complex instructions. Best for agents that take actions.
- **Gemini** — better at multimodal tasks, longer raw context, and cheaper for high-volume usage. Best for content-heavy workloads.

If you can only pick one for an agent: **Claude**. If you need a free tier with generous limits: **Gemini Flash**.

## Pricing (2026)

| Tier | Claude Sonnet 4 | Gemini 2.5 Flash |
|---|---|---|
| Input tokens | $3 / 1M | $0.10 / 1M |
| Output tokens | $15 / 1M | $0.40 / 1M |
| Free tier | None | 15 RPM |

Gemini Flash is roughly 30x cheaper. For high-volume read-heavy workloads (summarization, classification, fact extraction), this matters. For agentic workloads, the price gap closes because Claude needs fewer iterations to get the same result.

## Tool Use Quality

This is where Claude pulls ahead. In our testing on agent benchmarks:

- **Claude** correctly chains 3-4 tool calls in a single turn ~95% of the time
- **Gemini** sometimes refuses to call tools even when they're clearly relevant, or hallucinates the tool's response instead of actually invoking it

If your agent needs to read your inbox, then update a database, then send a notification — Claude handles it more reliably.

We use **Claude as the default** in Noomachy and offer Gemini as an opt-in for users who want the cheaper tier.

## Context Window

- **Claude Sonnet 4** — 200K tokens (1M with the extended context tier)
- **Gemini 2.5 Pro** — 2M tokens

Gemini wins on raw context size. But in practice, both are large enough that the limit rarely matters for agentic workloads. What matters more is *attention quality* across long contexts — and there Claude tends to score better.

## Streaming and Tool Calls Together

Both models support streaming. Both support tool calls. But:

- **Claude** streams text deltas AND structured tool_use blocks in the same stream
- **Gemini** has a quirkier streaming API where function calls show up in chunks differently than text

This matters when you want a smooth UX where the user sees tokens flowing in real time AND tool invocations as they happen. Claude's API is cleaner.

## Refusal Rate

Both models have safety filters. Claude is more willing to take actions when given tools. Gemini sometimes "explains why it can't" even when the tools exist and the request is benign.

We had to add explicit instructions to Noomachy's system prompt telling Claude it has tools and should use them — because both models occasionally hallucinate that they don't have access. But Gemini does this more often.

## Multimodal

Gemini wins. It handles images, audio, and video natively in the same prompt. Claude has vision but it's less polished.

If your agent's job involves analyzing screenshots, parsing PDFs, or understanding charts, Gemini is the better fit.

## How Noomachy Lets You Pick

[Noomachy](/) supports both models out of the box. When you create an agent, you choose Claude or Gemini in the model dropdown. You can change it anytime in **Settings → Agent**.

We track Gemini token usage per user with a $5 default budget cap, so users can experiment with Gemini without runaway costs. Claude billing is pay-as-you-go.

## Bottom Line

- Building a serious **agent that takes actions**? Use Claude.
- Building a **content tool** with high volume? Use Gemini Flash.
- Want both? Use [Noomachy](/) — switch per agent with a dropdown.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'agents-vs-automation',
    title: 'AI Agents vs Traditional Automation: When to Use Each',
    description: 'Zapier and Make are great for linear workflows. AI agents shine for tasks that need judgment. Here is how to pick between them.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Automation', 'Workflow', 'Comparison'],
    category: 'Comparisons',
    content: `
# AI Agents vs Traditional Automation: When to Use Each

Should you use Zapier? Make? n8n? Or an AI agent? In 2026, the answer is increasingly: *both, in different places*.

## The Fundamental Difference

**Traditional automation** (Zapier, Make, IFTTT, n8n) executes predetermined sequences. You wire up trigger → action → action → action. The flow is fixed at design time.

**AI agents** (Noomachy, Claude, custom LLM systems) decide what to do at runtime. The flow is determined by the model based on the current situation.

## When Traditional Automation Wins

Use a workflow tool when:

- The steps are **deterministic** (always the same)
- The data formats are **structured** (JSON, CSV, database rows)
- You need **high volume** (thousands of executions/day)
- **Cost per run** matters (Zapier costs cents; LLM calls cost dollars)
- You need **reliability guarantees** (a workflow either runs or it doesn't)

Examples:
- New Stripe payment → log to Sheets → notify Slack
- Form submission → create CRM lead → send welcome email
- Daily report → fetch metrics → generate PDF → email it

These don't need intelligence. They need plumbing.

## When AI Agents Win

Use an agent when:

- The task requires **understanding language**
- The steps depend on **context** that varies each time
- You're dealing with **unstructured input** (emails, documents, voice)
- You need **judgment** about what to do next
- The user wants **conversational interaction**

Examples:
- *"Read my last 10 emails and tell me what's urgent"*
- *"Summarize today's calendar and prep me for the 3pm meeting"*
- *"Find the bug in this codebase and propose a fix"*
- *"Draft a response to this customer complaint in our brand voice"*

These can't be hardcoded. They need reasoning.

## The Hybrid Pattern

The most powerful systems combine both. Use traditional automation for the high-volume, deterministic plumbing. Use an agent for the moments that need judgment.

Example flow:
1. **Zapier trigger:** new email arrives in support inbox
2. **Zapier action:** send email content to your AI agent endpoint
3. **AI agent:** classify the email, decide if it needs human attention, draft a response if it doesn't
4. **Zapier:** if agent flagged it, escalate to Slack; otherwise auto-reply

Now you have automation that's fast and cheap *and* intelligent.

## Where Noomachy Fits

[Noomachy](/) is an agent platform — it gives you the intelligent judgment layer. You can call any Noomachy agent via:

- **Web chat** (the main UI)
- **Telegram, Discord, Slack** (channel adapters)
- **HTTP API** (call it from your existing automation)
- **MCP** (any MCP-compatible client)

So Noomachy slots into your existing workflow stack — Zapier handles the trigger, Noomachy handles the judgment, Zapier handles the follow-up actions.

## Cost Reality Check

A Zapier task costs ~$0.02. A Claude call costs ~$0.10-1.00 depending on length. So yes, agents are 5-50x more expensive *per call*. But they replace work that would otherwise be done by a human at $30+/hour. The economics work for high-value, low-volume tasks. They don't work for high-volume, low-value tasks.

The skill is knowing which is which.

## Try It

[Request early access →](/#early-access) and see how an agent handles tasks your current automation can't.
`,
  },

  {
    slug: 'cloud-ai-privacy-risks',
    title: 'The Privacy Risks of Cloud AI (And How to Mitigate Them)',
    description: 'Every prompt you send to a cloud AI becomes data. Here are the real risks of cloud-only AI and three concrete mitigation strategies.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Privacy', 'Security', 'Compliance'],
    category: 'Privacy',
    content: `
# The Privacy Risks of Cloud AI (And How to Mitigate Them)

Every prompt you type into a cloud AI service becomes data — logged, processed, sometimes used for training, often retained for years. Most users don't think about this until they accidentally paste a customer's social security number into ChatGPT.

Here are the real risks and three concrete things you can do about them.

## Risk 1: Model Training on Your Data

Major providers retain prompts. Some use them for training (with opt-out flags). Even "no training" tiers usually keep logs for safety review.

**What this means:** sensitive data you send today may end up in a model years from now, accessible to other users via clever prompting.

**Mitigation:**
- Use enterprise tiers with explicit no-training contracts
- Self-host open-source models for sensitive workloads
- Run an agent platform that keeps memory local — like [Noomachy's sovereign memory](/blog/sovereign-memory)

## Risk 2: Token Leakage Through OAuth

Most "AI assistant" apps ask you to OAuth into Gmail, Calendar, Notion, etc. The provider gets a long-lived access token that they store somewhere. A breach of the provider exposes your token, which exposes your data.

**Mitigation:**
- Never grant scopes you don't need
- Prefer **local-first** integrations that read your data on your machine
- Use [Noomachy's desktop app](/blog/ai-access-mac-apps) where local Mac apps are exposed via a local MCP server, not via OAuth tokens stored in the cloud

## Risk 3: Prompt Logging and Retention

Most cloud AI services log every prompt. Even if they don't train on it, that log file is a juicy target.

**Mitigation:**
- Self-host the model (Ollama, LM Studio, vLLM)
- Use a privacy-first cloud that contractually deletes logs
- Avoid putting sensitive data in prompts where possible (use placeholder tokens and resolve them locally)

## Risk 4: Memory Lock-In

If your AI provider stores all your "memories," you're locked into them. Want to switch? Your context goes away.

**Mitigation:**
- Choose providers with **export** functionality
- Use sovereign-memory architectures where you own the memory store
- [Noomachy lets you export every memory](/dashboard/memory) as JSON

## Risk 5: Cross-Tenant Leakage

Multi-tenant cloud AI services have to keep different customers' data isolated. Bugs in this isolation are rare but catastrophic. The 2023 ChatGPT incident where users saw each other's chat titles is one example.

**Mitigation:**
- Prefer providers with strong tenant isolation guarantees
- For really sensitive use cases, single-tenant or self-hosted

## The Three Concrete Things to Do

1. **Audit what you actually send.** Most prompts don't need to be sensitive. The 5% that do are the ones that need a different solution.
2. **Use local-first tools when possible.** Don't OAuth into Gmail if you can read mail locally instead.
3. **Choose providers that align incentives.** If the provider's business model is based on training on your data, they have a structural incentive to retain it. Pick providers whose business is selling you the service, not your data.

## Why This Matters for Agents

Agents are more privacy-sensitive than chatbots because they accumulate state. A chatbot forgets you. An agent remembers everything. That makes the storage architecture of your agent provider more important than the model itself.

[Noomachy](/) was designed with privacy-first as a core principle: sovereign memory, local-first integrations via MCP, multi-tenant isolation enforced by Firestore security rules, audit logs for every action.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'vector-search-memory',
    title: 'How Noomachy Uses Vector Search to Find Relevant Memories',
    description: 'Vector embeddings turn semantic memory from a junk drawer into a searchable brain. Here is how it works under the hood.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Vector Search', 'Embeddings', 'Architecture'],
    category: 'Memory',
    content: `
# How Noomachy Uses Vector Search to Find Relevant Memories

Saving memories is the easy part. *Finding* the right ones at the right moment is where the engineering happens.

## The Problem

Your agent has 500 stored memories about you. The user asks: *"What was that book my colleague recommended?"*

A keyword search for "book" might match nothing — the original memory was *"Sarah suggested The Lean Startup"*. There's no literal "book" in there. Semantic search needs to understand that *suggest = recommend* and *The Lean Startup = book*.

Vector embeddings solve this.

## What Embeddings Actually Are

An embedding is a fixed-length list of numbers (typically 768 or 1536 dimensions) that captures the *meaning* of a piece of text. Two pieces of text with similar meaning produce vectors that are close together in this high-dimensional space.

So *"Sarah suggested The Lean Startup"* and *"a book my colleague recommended"* end up as nearby vectors, even though they share no actual words.

## The Pipeline

Here's how [Noomachy](/) uses embeddings under the hood:

### 1. On Memory Creation

When a fact gets saved to semantic memory:
- The fact's text is sent to Vertex AI's \`textembedding-gecko@003\` model
- The model returns a 768-dimensional vector
- The vector is stored alongside the fact

### 2. On Memory Retrieval

When a new conversation starts (or the user asks something):
- The user's message is embedded
- Cosine similarity is computed between the query vector and every memory vector for this agent
- The top-K most similar memories are returned (default K = 10)
- They're injected into the system prompt

This happens in milliseconds for thousands of memories.

### 3. The Hybrid Approach

Pure vector search is great for semantic similarity but can miss exact matches. Noomachy uses a hybrid:

- **Vector similarity** for semantic relevance
- **Tag filtering** for explicit categorization
- **Recency boost** for recently accessed memories
- **Confidence weighting** for high-confidence facts

The combined score determines what gets injected.

## Why Top-K and Not All Memories

You could load *all* of a user's memories into the prompt every time. It's simple and complete. It's also expensive and confusing — irrelevant memories crowd the context window and dilute the model's attention.

Top-K (typically 5-20) gives you the best of both worlds: enough relevant context, no noise.

## The Validation Gate Connection

The validation gate (described in [Sovereign Memory](/blog/sovereign-memory)) uses the same vector search to detect duplicates. When a new fact arrives:

1. Embed the new fact
2. Search existing memories for the closest match
3. If cosine similarity > 0.92 → duplicate, reject
4. If similarity is between 0.7 and 0.92 → similar but not identical, queue for review
5. Below 0.7 → genuinely new, auto-approve if confidence is high enough

This is how you prevent your memory store from filling up with slight rephrasings of the same fact.

## Performance Notes

- Embedding generation: ~50ms per call
- Vector search over 10K memories: < 10ms with proper indexing
- Total memory hydration before each request: ~100-200ms

In production, the embedding step is the bottleneck. Caching embeddings aggressively (which Noomachy does) keeps it fast.

## What This Means For You

You don't need to think about any of this. As a user, you just chat. Your agent quietly embeds, validates, stores, and retrieves — and the result is that it remembers things in a way that *feels* intelligent because it actually understands meaning, not just keywords.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'cost-of-ai-agents',
    title: 'The Real Cost of Running an AI Agent Platform',
    description: 'Token costs, infrastructure, storage — what does it actually cost to run a production AI agent? A breakdown from the trenches.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Cost', 'Infrastructure', 'LLM'],
    category: 'AI Agents',
    content: `
# The Real Cost of Running an AI Agent Platform

Everyone wants to build an AI agent. Few people calculate what it costs to actually run one in production. Here's a real breakdown from running [Noomachy](/).

## Cost Components

A production AI agent platform has roughly five cost buckets:

1. **LLM API calls** (Claude, Gemini, etc.)
2. **Embeddings** for semantic memory
3. **Vector storage / search** (Vertex AI, Pinecone, or Firestore)
4. **Cloud functions / compute** (Firebase, AWS Lambda, etc.)
5. **Database storage** (Firestore, Postgres)

LLM costs dominate. Everything else is cheap by comparison.

## LLM API Costs (2026)

For a typical agent conversation with tool use, expect:

- **Claude Sonnet 4:** ~$0.05–0.30 per turn (depends on context length and tool calls)
- **Gemini 2.5 Flash:** ~$0.001–0.01 per turn (30x cheaper)
- **GPT-4o:** ~$0.05–0.20 per turn

A heavy user doing 50 conversations a day: ~$2–15/day on Claude, ~$0.10–0.50/day on Gemini.

Most users do far less. The median is 5–15 messages a day, costing ~$0.20–1.50.

## Embedding Costs

Embeddings are nearly free at scale:

- Vertex AI \`textembedding-gecko@003\`: $0.025 per 1K characters
- A typical fact is ~100 chars, so ~$0.000003 per memory
- 1000 memories per user costs about $0.003

You can ignore this cost.

## Vector Storage and Search

For Noomachy, we store vectors in Firestore alongside the memory documents. No separate vector DB needed. Cost: included in the regular Firestore storage cost (~$0.18/GB/month).

If you scale beyond ~100K memories per user, you'd want a real vector index (Pinecone, Vertex AI Vector Search, pgvector). At those scales the cost is real but still small compared to LLM calls.

## Cloud Functions

Each request to the agent runs a Cloud Function. With Firebase Functions Gen 2:

- ~$0.0001 per invocation
- ~$0.00001667 per CPU-second
- Free tier covers ~125K invocations/month

For most users this is essentially free. Only at high scale does compute become noticeable.

## Database Storage

Firestore charges:
- $0.18/GB/month for storage
- $0.06 per 100K reads
- $0.18 per 100K writes

A user with 100 conversations and 500 memories: ~5MB total. Negligible.

## The Actual Per-User Cost

Putting it all together for a typical Noomachy user (active, daily use):

- LLM (mostly Claude): $1–5/month
- Embeddings: $0.01/month
- Functions: $0.10/month
- Firestore: $0.05/month
- **Total: ~$1.50–5.50/month**

For heavy users (50+ conversations/day): up to $50/month, almost entirely LLM.

## How to Lower Costs

If you're running your own agent platform:

1. **Use smaller models for sub-tasks.** Use Claude Sonnet for reasoning, but Gemini Flash or Haiku for fact extraction, intent classification, summarization.
2. **Cache aggressively.** Embeddings, tool results, intermediate computations.
3. **Limit context.** Don't pass every memory — use top-K vector search.
4. **Set per-user budget caps.** Noomachy has a $5/month default cap on Gemini for free-tier users.
5. **Use prompt caching.** Anthropic's prompt caching can cut token costs by 50–90% on repeated system prompts.

## Pricing Implications

This is why most AI assistant products either:
- Charge $20+/month (covering even heavy users)
- Use Gemini-style cheap models exclusively
- Limit usage with hard caps and tiers
- Run as loss leaders to gather data for training

[Noomachy](/) bounds this with a per-tenant daily USD cap (default $5/day) that fails closed before a runaway bill, and routes to Claude for validation-critical work with Gemini as the cost-tier fallback. The economics work because the cap is the ceiling, not the expectation — most tenants stay well under it.

## Bottom Line

Running an AI agent is **cheaper than people think** (if you're frugal) and **more expensive than people expect** (if you're sloppy). The lever is what model you use and how much context you pass. Get those right and the rest doesn't matter.

[Request early access →](/#early-access)
`,
  },

  {
    slug: 'ai-for-developers',
    title: 'AI Agents for Developers: Code Execution, File Access, and More',
    description: 'How AI agents can actually help with coding — running code, reading files, querying databases — not just generating text.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '5 min read',
    tags: ['Developers', 'Coding', 'Tools'],
    category: 'AI Agents',
    content: `
# AI Agents for Developers: Code Execution, File Access, and More

AI for coding is in a weird place. Copilot helps you write the next line. ChatGPT explains a stack trace. But neither can actually *run* the code or *check* if a file exists. They're suggestion engines, not engineering partners.

A real AI agent for developers can do both.

## What Code Execution Unlocks

When your agent can execute code, the workflow changes completely:

- *"Write a Python script that downloads my GitHub stars and saves them as CSV."* → It writes the script, runs it, hands you the file.
- *"Test this regex against these 50 strings."* → It runs the test in JavaScript and shows you which ones match.
- *"Calculate the standard deviation of these numbers."* → It just does it.

No more *"here's the code, you run it and tell me what happened"*. The agent runs it.

## File Access Patterns

Combine code execution with file access and you can do real engineering tasks:

- *"Read this log file and tell me the top 5 most frequent errors."*
- *"Find all TypeScript files in src/ that import lodash."*
- *"Look at my package.json and tell me which dependencies are outdated."*

The agent reads the files itself, processes them, and answers — no manual copying.

## Database Queries

The \`db_query\` tool in [Noomachy](/) lets agents query Firestore directly:

- *"How many active users do we have?"*
- *"What's the most recently created agent?"*
- *"Find all conversations from the last 24 hours that had errors."*

Combined with code execution, the agent can *analyze* the data, not just retrieve it.

## Web Search for Documentation

Sometimes the agent needs context from outside its training data — a new library, a recent API change. The \`web_search\` tool gives it that. So when you ask *"how do I migrate from React Router 6 to 7"*, it can fetch the actual migration guide instead of guessing from outdated training data.

## The Sandbox Question

Code execution sounds scary. A misbehaving agent could rm -rf your home directory. Noomachy runs all code execution in a sandbox:

- **JavaScript:** isolated-vm with strict memory and timeout limits
- **Python:** child process with no network or filesystem access by default

The sandbox is the difference between "AI that can run code" and "AI that shouldn't run code."

## Real Workflow Example

Here's what a typical developer workflow looks like in [Noomachy](/) with the \`code_execution\`, \`web_search\`, and \`file_operations\` skills installed:

1. *"Read the README in my-project and summarize what the app does."*
2. *"Now look at the package.json and check if there are any vulnerabilities in the deps."*
3. *"Search the web for the latest version of express and tell me the breaking changes from our current version."*
4. *"Write a test script in JavaScript that benchmarks our regex patterns and run it."*
5. *"Save the results as a markdown report."*

This is one chat, one agent, no copy-pasting. The agent uses tools as needed.

## Pair Programming or Replacement?

Agents won't replace developers — but they will replace a lot of the *tedium* of developer work. The annoying file searches, the dependency audits, the data sanity checks, the documentation lookups. All of that becomes a single chat away.

Use the time you save to do the thinking the agent can't do.

## Try It

[Request early access →](/#early-access) and install the **Code Execution**, **File Operations**, **Web Search**, and **Database Query** skills on a fresh agent. Then ask it to help you with real work.
`,
  },

  {
    slug: 'validation-gates',
    title: 'Why Validation Gates Matter in AI Memory Systems',
    description: 'Naive AI memory becomes a junk drawer. Validation gates filter out duplicates, contradictions, and noise so memory stays useful.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '5 min read',
    tags: ['Memory', 'Quality', 'Architecture'],
    category: 'Memory',
    content: `
# Why Validation Gates Matter in AI Memory Systems

The first time you build AI memory, the temptation is to save everything. Every fact the model extracts, every detail the user mentions, straight to storage. It feels comprehensive.

A week later, the memory store is a swamp. Dozens of slightly-different copies of the same fact. Contradictions. Outdated information sitting next to fresh information. The model is more confused than it would have been with no memory at all.

The fix is a **validation gate**.

## What a Validation Gate Does

A validation gate sits between the **fact extraction** step and the **persistent store**. Every new fact goes through it before being saved. The gate runs three checks:

1. **Duplicate detection** — is this fact already known?
2. **Contradiction check** — does this conflict with an existing high-confidence fact?
3. **Confidence scoring** — how sure are we that this fact is accurate?

Based on the results, the fact is either:
- **Auto-approved** and promoted to long-term memory
- **Rejected** as a duplicate or contradiction
- **Queued for review** if it's ambiguous

## How [Noomachy](/) Implements It

Noomachy's validation gate runs as a Firestore trigger. When a new fact gets written to the staging collection, the trigger fires automatically:

\`\`\`
1. Embed the new fact (Vertex AI textembedding-gecko)
2. Vector search existing memories for the closest match
3. If cosine similarity > 0.92 → mark as duplicate, reject
4. Run Claude with a "does X contradict Y?" prompt for any near-matches
5. If contradiction → flag for human review
6. If confidence > 0.85 and no conflicts → auto-approve, promote to semantic memory
7. Otherwise → leave in staging for the user to review
\`\`\`

The whole pipeline runs in under a second.

## Why Auto-Approval Has a Threshold

The auto-approval threshold (default 0.85) is the key knob. Set it too low and noise gets through. Set it too high and the user has to manually approve every fact, defeating the purpose.

0.85 turns out to be a sweet spot:
- **Above 0.85:** facts that the model is genuinely confident about (extracted from clear user statements)
- **Below 0.85:** speculation, inference, or ambiguous wording

Users can adjust this in **Agent Settings → Memory** if they want stricter or looser auto-approval.

## What Gets Filtered Out

Real examples of facts that the validation gate rejects:

- *"User likes coffee"* (already known with confidence 0.95)
- *"User lives in Beirut"* vs *"User lives in Dubai"* (contradiction — flagged for review)
- *"User mentioned they might be considering thinking about starting a project"* (confidence too low)
- *"The current date is X"* (transient, not worth long-term storage)

What gets through:

- Concrete personal facts ("Joseph works at KodeFoundry")
- Strong preferences ("Prefers dark mode in all apps")
- Project details ("Building an AI agent platform called Noomachy")
- Relationships ("Sarah is the user's CTO")

## The Validation Queue UI

For facts that don't auto-approve, Noomachy shows them in a **Validation Queue** in the Memory Explorer. You can:

- Approve them manually
- Reject them with a reason
- Edit the wording before approving

This puts you in control of what your agent learns. After a few weeks of curating, the memory store becomes a high-signal record of the things that actually matter.

## Why This Matters Long-Term

A memory store with no validation degrades over months. The signal-to-noise ratio drops. The model spends its context budget on irrelevant facts. Eventually it's worse than no memory at all.

A memory store with good validation **gets better over time**. The longer you use it, the smarter your agent becomes — because every memory in the store is one that survived the gate.

## Try It

[Request early access →](/#early-access) and watch your agent's Memory tab fill up with auto-validated facts. Anything that needs review will show up in the validation queue.
`,
  },

  {
    slug: 'self-hosted-vs-hosted',
    title: 'Self-Hosted vs Hosted AI Agents: Which Should You Choose?',
    description: 'Run your own agent stack or use a managed platform? A practical comparison of cost, complexity, privacy, and control.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Self-Hosted', 'Hosted', 'Comparison'],
    category: 'Comparisons',
    content: `
# Self-Hosted vs Hosted AI Agents: Which Should You Choose?

If you're building or buying an AI agent in 2026, you have two paths: run it yourself or use a managed platform. Both are valid. Neither is universally better.

## The Self-Hosted Pitch

Running your own agent stack means:

- **You own everything** — code, data, model deployments, infrastructure
- **No vendor lock-in** — switch components freely
- **Cost control at scale** — once you exceed a managed platform's free/pro tiers, self-hosting can be cheaper
- **Compliance** — for regulated industries (healthcare, finance, government), self-hosting is sometimes the only legal option
- **Custom modifications** — change anything you want, when you want

The downside: you're now an infrastructure team. You maintain everything. When OpenAI changes its API, you patch it. When your vector DB has a bug, you debug it. When the model drifts, you re-evaluate.

## The Hosted Pitch

Using a managed platform like [Noomachy](/) means:

- **Setup in minutes** — sign up, create an agent, start chatting
- **Maintenance is someone else's problem** — model upgrades, security patches, scaling
- **Cheaper at small scale** — pay-as-you-go, no fixed infrastructure cost
- **Multi-channel out of the box** — web, Telegram, Discord, Slack already wired up
- **Built-in features** — sovereign memory, validation gates, MCP tooling, audit logs
- **Focus on your use case** — not the plumbing

The downside: you're trusting a vendor with your data and your continuity. If they change pricing or shut down, you have to migrate.

## Cost Comparison

For a single team:
- **Hosted (Noomachy):** design-partner pricing during early access; a per-tenant daily USD cap bounds spend
- **Self-hosted (1 server + LLM API):** ~$20–40/month server + your token costs

For 1000+ users:
- **Hosted (Noomachy):** custom pricing, scales with usage
- **Self-hosted:** ~$200–500/month infrastructure + your token costs + DevOps time

The break-even is around 50–100 active users, depending on usage patterns.

## Privacy Comparison

Self-hosted is *theoretically* more private — no third party touches your data. But in practice, most self-hosted deployments still call cloud LLM APIs (OpenAI, Anthropic) for the actual model inference. Your prompts are still going to a third party.

Truly private = self-hosted + a self-hosted model (Llama 3, Mistral). That gets you full data sovereignty but the model quality is currently a step behind frontier cloud models.

A hosted platform like [Noomachy](/) can offer **sovereign memory** (your data lives in your account, not the provider's training set) without going full self-hosted. This is the middle path most users actually want.

## Complexity Comparison

A bare-minimum self-hosted agent stack:
- An LLM provider integration (or local model)
- Vector database for embeddings
- Persistent state store
- Tool execution framework
- API gateway
- Auth system
- Observability / logging
- Scheduling / queues for background tasks

That's a real engineering project. Months of work for the first version, ongoing maintenance forever.

A hosted platform: sign up, create agent, done. The 8 components above already exist; you don't see them.

## When to Pick Each

**Self-host if:**
- You have an engineering team that wants to build this anyway
- You're in a regulated industry (HIPAA, FINRA, GDPR critical)
- You're at scale where infrastructure costs justify it
- You need deeply custom behavior you can't get from a platform
- You want to use a self-hosted model

**Use hosted (like [Noomachy](/)) if:**
- You want to build features, not infrastructure
- You're a solo user or small team
- You want multi-channel out of the box
- You want sovereign memory without running your own database
- You want to be productive in the next 5 minutes, not the next 5 months

## The Hybrid Option

There's a third path: use a hosted platform for the dashboard / orchestration / memory, but plug in your own MCP servers for custom tools. This is what most Noomachy power users do — they get the platform benefits plus custom integrations.

[Request early access →](/#early-access) and see how far the hosted version gets you before you'd ever need to self-host.
`,
  },

  {
    slug: 'how-agents-learn',
    title: 'How AI Agents Learn From Every Interaction',
    description: 'Modern AI agents do not need fine-tuning to improve. They learn through structured memory and context updates. Here is how it works.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '5 min read',
    tags: ['Learning', 'Memory', 'Adaptation'],
    category: 'Memory',
    content: `
# How AI Agents Learn From Every Interaction

"Learning" is a loaded word in AI. Most people think of model training — gradient descent, backpropagation, weeks of GPU time. But there's another kind of learning that happens at the agent layer, and it's often more useful.

## In-Context Learning

An AI agent can "learn" without ever updating model weights. The trick: structured memory + context injection.

Every time you have a conversation with the agent, three things happen in the background:

1. **Facts are extracted** from the conversation (using the model itself)
2. **Episodes are logged** with task context, tools used, and outcomes
3. **Behavior patterns** are updated (most-used tools, preferred response style, active hours)

Next time you start a conversation, all of that gets injected into the system prompt. The model now has access to it. From its perspective, it remembers.

## Three Types of Learning

[Noomachy](/) tracks three distinct kinds of learning:

### 1. Factual Learning

When you say *"my CTO is Sarah and her email is sarah@acme.com"*, that fact gets extracted, validated, and stored in semantic memory. Next time you ask *"email Sarah about the proposal"*, the agent knows who Sarah is.

### 2. Episodic Learning

When the agent successfully completes a task (e.g., "scheduled the meeting"), it logs an episode. Over time, it can reference these episodes — *"last time you scheduled with Sarah you used Zoom, want me to do the same?"*

### 3. Behavioral Learning

The system tracks how you interact: which tools you use most, how long your messages typically are, what hours you're active. This becomes a behavior profile that conditions the agent's responses. If you always send 1-line messages, the agent learns to be concise. If you always ask for detail, it gets verbose.

## Why This Beats Fine-Tuning

Fine-tuning sounds powerful but it's the wrong tool for personal AI:

- **Slow** — hours to days per cycle
- **Expensive** — GPU time costs real money
- **Hard to reverse** — bad fine-tunes need to be retrained from scratch
- **Provider-dependent** — most cloud APIs don't support per-user fine-tunes
- **Catastrophic forgetting** — fine-tuning on new data can hurt performance on old tasks

Memory-based learning has none of these problems:

- **Instant** — facts are available the next conversation
- **Cheap** — embedding cost is negligible
- **Reversible** — delete a memory, agent forgets it
- **Provider-agnostic** — works with any model that accepts system prompts
- **No drift** — the underlying model never changes

## The Validation Loop

Learning is only useful if what's learned is correct. Bad memories produce worse responses than no memory at all.

Noomachy uses a **validation gate** ([read more here](/blog/validation-gates)) to filter incoming facts before they reach long-term storage:

- Duplicate detection via vector similarity
- Contradiction checks against existing high-confidence facts
- Auto-approval threshold (default 0.85)

This is the difference between learning and noise.

## The Behavior Profile Example

Here's what the system learns about a typical user after 50 conversations:

\`\`\`
Frequently uses: mail_read_inbox (12x), calendar_today (9x), notes_search (7x)
Typical task areas: communication, productivity, planning
Prefers short, concise responses
Most active around: 09:00, 14:00, 18:00 UTC
Total interactions: 247
\`\`\`

That summary is injected into every system prompt. The model adapts naturally — not because it was trained, but because it has more context.

## Try It

[Request early access →](/#early-access) and chat with Noomachy for a week. You'll watch the Memory tab fill up with facts and the behavior profile sharpen. The agent will actually feel different than it did on day one — not because the model changed, but because its context did.
`,
  },

  {
    slug: 'choosing-an-ai-agent-platform',
    title: 'How to Choose an AI Agent Platform in 2026',
    description: 'A buyer guide for picking an AI agent platform — the questions to ask, the red flags to watch for, and what really matters.',
    date: '2026-04-11',
    author: 'Noomachy Team',
    readTime: '6 min read',
    tags: ['Platform', 'Buying Guide', 'Comparison'],
    category: 'Comparisons',
    content: `
# How to Choose an AI Agent Platform in 2026

There are dozens of AI agent platforms now. Most look identical on the marketing page. Here's how to actually pick one.

## Question 1: Do they support tool use?

A "platform" without tool use is just a chatbot wrapper. Skip it. Real agents need to take actions in the world.

Specifically, look for:
- **MCP support** (the open Model Context Protocol)
- **Built-in tools** for common tasks (web search, file access, etc.)
- **Custom tool registration** so you can add your own

## Question 2: Where does memory live?

There are three patterns:
1. **No memory** (chatbot — skip)
2. **Provider-owned memory** (vendor lock-in, privacy concerns)
3. **Sovereign memory** (you own it, can export it, can delete it)

[Sovereign memory](/blog/sovereign-memory) is the right answer for almost any serious use case. Avoid vendors that store your context in their training pool.

## Question 3: Which LLM(s) can it use?

Single-model platforms are risky. The state of the art changes every few months. Look for platforms that let you switch between Claude, Gemini, GPT-4, etc., per agent or per request.

[Noomachy](/) supports both Claude and Gemini natively, with model selection per agent.

## Question 4: How many channels?

Web-only agents are fine for tools. Personal assistants need to follow you everywhere — Telegram, Discord, Slack, mobile, etc. The same agent across multiple channels with shared memory is the killer feature.

## Question 5: Can it access local data?

Cloud-only agents are blind to your local files, apps, and context. The platforms that win in 2026 will have a story for **local integration** — typically via a desktop app that exposes local resources through MCP.

## Question 6: What's the privacy model?

Ask:
- Where are prompts logged?
- Are they used for training?
- Can you delete your data?
- Is there multi-tenant isolation enforced at the database level?
- Are audit logs available?

If the answers are vague, walk away.

## Question 7: How much does it actually cost?

Read the pricing carefully:

- **Per-token pricing** — pay-as-you-go based on usage
- **Per-message pricing** — predictable but rarely cheaper
- **Tiered pricing** — usage caps with overage fees
- **Enterprise pricing** — custom contracts

Beware "unlimited" plans — they always have hidden caps.

[See our breakdown of real AI agent costs →](/blog/cost-of-ai-agents)

## Question 8: How customizable is the agent itself?

Important things to look for:
- **Custom system prompts** — you should be able to define agent personality
- **Memory configuration** — auto-approval thresholds, retention rules
- **Skill installation** — pick which tools each agent has
- **Per-agent model selection** — different agents can use different LLMs

If the platform forces every agent to be the same, it's a chatbot service in disguise.

## Question 9: Is there an open standard?

Vendor lock-in is the silent killer. Platforms built on open standards (MCP, OpenAPI, standard auth flows) let you migrate. Proprietary stacks trap you.

## Question 10: Can you try it free?

Any serious platform offers a meaningful free tier. If you have to talk to sales just to evaluate, you'll have a bad time later.

## The Noomachy Comparison

Here's how [Noomachy](/) answers each question:

| Question | Noomachy |
|---|---|
| Tool use? | Full MCP, 19+ built-in skills, custom MCP support |
| Memory? | Sovereign, three-layer, exportable |
| LLMs? | Claude + Gemini, switchable per agent |
| Channels? | Web, Telegram, Discord, Slack |
| Local access? | Desktop app with local MCP server |
| Privacy? | Multi-tenant Firestore, no training, audit logs |
| Cost? | Per-tenant daily USD cap (default $5/day), fails closed; design-partner pricing in early access |
| Customizable? | System prompts, memory config, skill picker, model picker |
| Open standards? | MCP throughout |
| Access? | Early access for legal & compliance design partners |

[Request early access →](/#early-access) and see the validation gate and audit trail on your own contracts.

## The Bottom Line

The right platform isn't the one with the flashiest marketing. It's the one that scores well on the questions above — the ones that determine whether you'll still be happy with it in a year.
`,
  },
];
