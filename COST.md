# Cost model

Noomachy runs entirely on Firebase + Vertex AI + Anthropic/Gemini. This doc is
a back-of-envelope projection of what the bill looks like at 10 / 100 / 1000
active tenants, plus a guide to tuning the per-tenant cap.

> **Spark vs. Blaze.** Cloud Functions Gen 2 require Blaze (pay-as-you-go).
> Spark cannot host the orchestrator at all. Set a Firebase budget alert
> regardless of which tier you think you're on.

## What costs money

| Surface | Cost driver | Where it's bounded |
|---|---|---|
| Anthropic Claude (orchestrator) | Input + output tokens | `MAX_LLM_OUTPUT_TOKENS = 4096` in `cost/budgetGuard.ts`; per-agent `maxTokens` is also capped against this ceiling |
| Google Gemini (cost-tier fallback) | Input + output tokens | Same ceiling |
| Vertex AI textembedding-gecko | Input characters | `MAX_EMBEDDING_INPUT_CHARS = 8000` per call |
| Firestore reads | Document fetches per request | All `collection(...).get()` calls have `.limit()` (audited 2026-05) |
| Firestore writes | Memory writes, audit log entries | Every staging write goes through validation gate; no scheduled jobs |
| Cloud Functions invocations | Cold starts + execution time | `agentRouter` 300s, `mcpServer` 120s, channel webhooks 60s |
| Cloud Storage | Attachments | Not currently used in core flow |

## What used to cost money (now disabled)

These were removed in the 2026-05 pivot. Listing them so future-you doesn't
reintroduce them by accident:

- `consolidateEpisodes` Cloud Schedule (every 6h) — deleted.
- `runDueGoals` Cloud Schedule (every 1 minute) — primary cost driver,
  deleted along with the auto-pilot feature.
- Behavior-learning batch refreshes — never made it to production.

## Per-tenant cap

`functions/src/cost/budgetGuard.ts:MAX_DAILY_COST_USD = 5.0`

Each tenant has a daily ledger at `users/{tenantId}/usage/{YYYY-MM-DD}`:

```
{
  tenantId, date,
  totalUSD,
  claudeInputTokens, claudeOutputTokens,
  geminiInputTokens, geminiOutputTokens,
  embeddingChars,
  memoryWrites,
  lastUpdatedAt
}
```

Flow:

1. Every LLM call and embedding starts with `assertWithinBudget(tenantId)`.
2. If `totalUSD >= cap`: throws `BudgetExceededError`, router returns HTTP 429.
3. If `totalUSD >= 0.8 * cap`: logs a warning (still proceeds).
4. After the call, `recordUsage()` increments `totalUSD` atomically.
5. Cap resets when the date rolls over (UTC).

### Overriding the cap per tenant

Set `users/{tenantId}.dailyCapOverrideUSD` to any positive number. Admin-only
write. The tenant doc is the right place because it's already part of the
tenant's identity boundary; we don't need a new collection.

```ts
// e.g. raise to $50/day for a paying customer
await db.doc(`users/${tenantId}`).update({ dailyCapOverrideUSD: 50 });
```

### Changing the global default

Edit `MAX_DAILY_COST_USD` in `cost/budgetGuard.ts`. There is intentionally no
runtime config for this — changing it is a deploy-gated event. We don't want
"the cap got bumped to $500 by accident in a config UI" stories.

## Estimated bill at 10 / 100 / 1000 tenants

Assumptions:

- Active tenant = 20 dashboard sessions/month, ~10 LLM round-trips/session,
  ~5 embeddings per session.
- Avg LLM round-trip: 3k input tokens + 800 output tokens (Claude Sonnet 4.6).
- Avg embedding: 600 chars.
- 95% of tenants stay well under the $5/day cap; assume average daily spend
  is $1.20 across all tenants.
- Firestore: ~50k reads / 2k writes per active tenant per month at this volume.

|  | 10 tenants | 100 tenants | 1000 tenants |
|---|---|---|---|
| Anthropic Claude | ~$30/mo | ~$300/mo | ~$3,000/mo |
| Vertex embeddings | ~$2/mo | ~$15/mo | ~$140/mo |
| Firestore reads | <$5/mo | ~$30/mo | ~$280/mo |
| Firestore writes | <$2/mo | ~$10/mo | ~$90/mo |
| Cloud Functions | <$5/mo | ~$25/mo | ~$220/mo |
| **Total (per month)** | **~$45** | **~$380** | **~$3,730** |

Caveats:

- These are *production* numbers. Add ~30% for dev/staging traffic.
- Hard ceiling at the cap means worst-case per-tenant exposure is
  `5 USD/day × 30 days = $150/month/tenant`. At 1000 tenants the absolute
  worst case is $150k/month — not realistic, but the cap is what bounds it.
- Firestore costs assume the hash-chained audit log writes one entry per
  memory action. For high-write workloads (e.g. 100+ memory approvals/day
  per tenant), audit collection writes dominate; consider archiving entries
  older than 90 days to a cheaper tier.
- Gemini fallback isn't modeled here because it's only used when Claude
  is unavailable. If you make it the primary model, divide Anthropic costs
  by ~10.

## Bill alarms

Set these up before any traffic hits production:

1. **Firebase budget alert** — 50%, 75%, 100% of monthly target. Set the
   target at 2x the projection above for the first 6 months.
2. **GCP billing alert** for Vertex AI specifically. Embedding cost can
   compound silently if a tenant pastes a 100k-char doc.
3. **Cloud Logging alert** on `BudgetExceededError` events. If you see more
   than 5/day, either tenants are saturating their cap (good — they're
   active) or you have a runaway bug (bad).

## When to revisit

Revisit this document when:

- A tenant requests an override > $50/day. Update the table.
- A new model or service is added (e.g. Claude Opus, Vector Search managed
  index). Add a line to "What costs money."
- A scheduled job is reintroduced. Update both this doc and `index.ts`.
- The bill exceeds 30% of MRR. Time to renegotiate enterprise pricing with
  Anthropic / Google.
