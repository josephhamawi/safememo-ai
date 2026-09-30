# Seed data

`agents.json` holds the sample agent configurations. It is provider-agnostic
data and is still current.

The two loader scripts that lived here (`seed.ts`, `legal-demo.ts`) were
written against `firebase-admin` and were deleted with the rest of the
Firebase stack. **`legal-demo.ts` is worth rebuilding against Postgres** — it
seeded the legal contract-review walkthrough, including the one deliberate
contradiction the validation gate is supposed to catch, which is the demo the
landing page points at. Recover it from git history:

    git log --all --diff-filter=D -- seed/legal-demo.ts
    git show <commit>^:seed/legal-demo.ts
