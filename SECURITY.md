# Security Policy

## Reporting a vulnerability

Please report security issues privately. Do not open a public issue.

Use GitHub's [private vulnerability reporting](https://github.com/josephhamawi/safememo-ai/security/advisories/new),
or email the maintainer.

Include what you did, what happened, and what you expected. A proof of concept
helps but is not required. You will get an acknowledgement within a few days.

## Scope

SafeMemo AI is self-hosted: each deployment is operated by whoever runs it, so
there is no shared production environment to attack. Reports should target the
code in this repository.

Particularly interested in:

- Anything that reads a stored provider API key back out, in any form
- Tenant isolation failures — one account reading or writing another's data
- Forging or tampering with an audit chain without detection
- Authentication and session handling
- Share tokens that resolve when they should not

Out of scope: findings that require an already-compromised host or database, and
anything that depends on an operator misconfiguring their own deployment
(publishing Postgres to the internet, committing `.env`, and so on).

## Handling of secrets

`MASTER_ENCRYPTION_KEY` wraps every stored provider credential. It lives only in
the server's environment and is never written to the database, logs, or any API
response. Operators should back it up separately from the database — losing it
makes every stored credential permanently unreadable, and leaking it alongside a
database dump exposes all of them.

Rotation is supported and resumable:

```bash
# Move the current values to the _PREVIOUS_ variables, set new ones, restart,
# then run until it reports zero rows remaining.
npm run rotate-master-key
```

## What the code deliberately does not do

- No endpoint returns a decrypted provider key, for any role.
- Decryption failures return a uniform error message; the cause is logged
  server-side only, so failed attempts give no oracle.
- Audit payloads record metadata about credentials, never key material or its
  length.
- In production the error handler returns a generic message rather than the
  exception, so driver errors and stack traces never reach a client.
