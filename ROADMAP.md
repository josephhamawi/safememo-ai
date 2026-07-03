# Noomachy roadmap

This is a living document. Edit when something ships, when something is no
longer blocked, or when a customer conversation reshapes priorities.

## Shipped now (May 2026)

The pivot from horizontal "AI agent platform" to vertical "auditable agent
memory for compliance-bound industries" is complete. As of this commit:

- **Validation gate** with cosine-similarity dedup, contradiction detection,
  and plain-English contradiction explanations surfaced in the dashboard.
- **Hash-chained audit log** (`functions/src/security/auditLogger.ts`):
  every memory action writes `chainHash = SHA256(previousChainHash || resultHash)`
  so any tampering with an earlier entry breaks every later hash.
- **Signed-token audit share** (`functions/src/audit/share.ts` +
  `mintToken.ts`): owner clicks "Share audit trail" in the dashboard; gets a
  7-day HMAC-signed URL outside counsel can open without provisioning an account.
- **Per-tenant cost guardrail** (`functions/src/cost/budgetGuard.ts`): default
  $5/day USD cap, soft warning at 80%, hard fail-closed at 100% with HTTP 429.
- **Legal contract review demo** (`seed/legal-demo.ts`): 5 approved memories
  + 1 staged contradiction so the gate has something to flag.
- **Landing page rewritten** for the legal vertical with three rephrased
  trust signals (tamper-evident audit log, tenant-isolated, right-to-erasure)
  and an early-access form replacing the hardcoded pricing tiers.

## Stripped (no longer claimed)

The following were removed from code and copy because they were either
incomplete or off-strategy for the new positioning:

- WhatsApp adapter (no implementation, removed from types/UI/copy).
- Telegram / Discord / Slack webhooks (`functions/src/channels/`) — verified
  signatures but never invoked the agent (returned a placeholder). Deleted
  from code, exports, types, settings/onboarding UI, and env examples. The
  dashboard is the only surface until a customer's workflow needs a channel.
- Self-serve email sign-up on the login page — the front door is now
  demo/early-access only; existing users still sign in.
- Skill marketplace UI (`web/src/components/dashboard/SkillMarketplace.tsx`,
  `web/src/app/dashboard/skills/page.tsx`) — UI was scaffolding only.
- Auto-pilot scheduler (`functions/src/goals/`,
  `functions/src/memory/consolidation.ts`,
  `functions/src/mcp/tools/scheduleFollowup.ts`) — was the primary cost
  driver; cron jobs are gone, source removed.
- Desktop MCP UI claims (download page, slash commands for clipboard/email/
  calendar). The `useDesktopMcp` hook is preserved because it costs nothing
  when not in Electron, but it is no longer surfaced.
- Hardcoded $0/$29/Custom pricing — replaced with "Request early access".

## Blocked on customer validation

We will not build these until at least one paying customer asks for them or
three early-access conversations confirm the demand:

| Capability | Trigger to unblock |
|---|---|
| Stripe billing + subscription tiers | First paid contract signed |
| Public REST/GraphQL API | A design partner explicitly wants to embed |
| SDK (JS, Python) | Two design partners want programmatic access |
| WhatsApp / additional channels | Customer with channel in their workflow |
| SAML / SSO | Customer with > 50 seats and IT requirement |
| On-prem / VPC deployment | Customer with data-residency requirement |
| Real desktop MCP integrations | Reframing pivot — likely never under this positioning |

## Q3 2026 — if 3+ paying customers

Triggered by signed annual contracts, not LOIs. Approximate order:

1. **SOC 2 Type II readiness program.** Engage an auditor (Vanta or Drata),
   close the gap on policies, MFA enforcement, vendor management, employee
   onboarding controls. Target Type I in Q3, Type II in Q4. Will let us
   replace the current "tamper-evident audit log" wording with a real cert.
2. **Multi-region deployment.** Currently `us-central1` only. Add `europe-west1`
   for EU customers; configure Firestore multi-region; document data residency.
3. **Cryptographic chain attestation.** Optional Merkle root anchoring of the
   audit chain to a public chain (Sigstore or Bitcoin via OpenTimestamps). 
   Sells well to legal teams worried about insider modification.
4. **Reviewer roles + delegation.** Today every memory approval is owner-only.
   Add Reviewer / Admin / Auditor roles with scoped permissions. Required
   for any team larger than 1.
5. **Bulk import + redaction.** "Onboarding day": ingest historical contracts/
   matter notes as memories, with PII redaction before embedding.
6. **Webhook outputs.** Notify external systems on memory approve/reject
   (Slack, email, custom URL). Compliance teams want this for SIEM integration.

## Explicit non-goals (this quarter)

- Cross-tenant collaboration features. Multi-tenancy is a strict isolation
  story; sharing across tenants undermines the trust posture.
- Personal-assistant features (calendar, email, files). Reframed into the
  legal/compliance vertical; out of scope.
- Free public API. Will gate behind paid plans when API ships.
- Mobile apps. Dashboard-only until a customer asks otherwise.

## How to update this doc

When you ship something from "Blocked" or "Q3," move it to "Shipped now"
with a one-line note about what triggered the unblock. When you discover a
new requirement from a customer call, add it to "Blocked" with the trigger
that would unblock it.
