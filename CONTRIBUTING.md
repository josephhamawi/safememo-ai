# Contributing

## Getting set up

See [Quick start](README.md#quick-start). You need Docker and a provider API
key; there is no way to run the agent loop without one.

```bash
cd server && npm install
npm test          # unit tests; integration tests skip without a database
npm run typecheck
```

For the integration suite, point it at a disposable database:

```bash
docker compose up -d db
TEST_DATABASE_URL=postgres://safememo:<password>@localhost:5432/safememo npm test
```

It drops and recreates the schema on every run, so do not aim it at anything
you care about.

## Before opening a pull request

- `npm run typecheck` passes in both `server/` and `web/`. TypeScript runs in
  strict mode with `noUncheckedIndexedAccess`; please do not loosen it.
- `npm test` passes in `server/`.
- New SQL goes in a new numbered file under `server/src/db/migrations/`.
  Migrations are forward-only and never edited after they land.

## Things that will get a PR sent back

- **Reading a provider key back out.** There is no endpoint that returns a
  stored key and there should not be one. If you need the plaintext, decrypt it
  for one operation and zero the buffer in a `finally`.
- **Skipping the validation gate.** Nothing writes to `semantic_memories`
  except the approval path. Agents write to `staging_memories`.
- **Breaking the audit chain.** Appends must happen in the same transaction as
  the action they describe. `audit_logs` is append-only by trigger.
- **Trusting model output.** Tool inputs are validated with Zod at execution
  time, and `userId` always comes from the session, never from tool arguments.
- **Logging secrets.** No API key, ciphertext, session token, or password hash
  in a log line or an error message.

## Style

Match the surrounding code. Comments explain *why* — a constraint, a
trade-off, a non-obvious failure mode — not what the next line does.
