-- SafeMemo AI — initial self-hosted schema.
--
-- Replaces the Firestore data model. Tenant isolation was previously enforced
-- by Firestore security rules; here it is enforced in the application layer,
-- so every tenant-scoped table carries user_id and every query filters on it.
-- Row-level security is enabled as a second line of defence (see 002).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  -- Argon2id hash. Null for users created via an external identity provider.
  password_hash text,
  display_name  text,
  is_admin      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: Alice@x.com and alice@x.com are one account.
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

CREATE TABLE sessions (
  -- SHA-256 of the session token. The raw token is never stored, so a database
  -- dump cannot be replayed as a live session.
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_agent  text,
  ip          inet
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Bring-your-own-key provider credentials
-- ---------------------------------------------------------------------------
--
-- Envelope encryption. Each credential gets a fresh random data-encryption key
-- (DEK); the API key is sealed under the DEK and the DEK is sealed under the
-- master key held in MASTER_ENCRYPTION_KEY. Two consequences:
--
--   1. Rotating the master key only requires re-wrapping DEKs (small, fast) —
--      the API-key ciphertext is never touched.
--   2. master_key_id records which master key sealed this row, so a rotation
--      can run incrementally and partially-rotated state is still readable.
--
-- Both layers are AES-256-GCM. The additional authenticated data binds each
-- ciphertext to (credential id, user id, provider), so a row copied into
-- another user's record fails authentication instead of decrypting.

CREATE TABLE provider_credentials (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('anthropic', 'google', 'openai')),
  label           text,

  -- Displayed in the UI so a user can tell two keys apart. Never the full key.
  key_last4       char(4) NOT NULL,

  -- Layer 1: API key sealed under the DEK.
  key_ciphertext  bytea NOT NULL,
  key_iv          bytea NOT NULL,
  key_tag         bytea NOT NULL,

  -- Layer 2: DEK sealed under the master key.
  wrapped_dek     bytea NOT NULL,
  dek_iv          bytea NOT NULL,
  dek_tag         bytea NOT NULL,
  master_key_id   text NOT NULL,

  -- Set when a live call to the provider confirmed the key works.
  verified_at     timestamptz,
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One credential per provider per user. Replacing a key is an update.
  UNIQUE (user_id, provider)
);

CREATE INDEX provider_credentials_master_key_id_idx
  ON provider_credentials (master_key_id);

-- ---------------------------------------------------------------------------
-- Agents
-- ---------------------------------------------------------------------------

CREATE TABLE agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  system_prompt text,
  provider      text NOT NULL DEFAULT 'anthropic'
                  CHECK (provider IN ('anthropic', 'google', 'openai')),
  model         text NOT NULL,
  max_tokens    integer NOT NULL DEFAULT 4096 CHECK (max_tokens BETWEEN 1 AND 128000),
  effort        text CHECK (effort IN ('low', 'medium', 'high', 'xhigh', 'max')),
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agents_user_id_idx ON agents (user_id) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Memory: L1 working, L2 semantic (+ staging), L3 episodic
-- ---------------------------------------------------------------------------

CREATE TABLE conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX conversations_agent_id_idx ON conversations (agent_id, updated_at DESC);

CREATE TABLE messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          text NOT NULL,
  tool_calls       jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens     integer,
  output_tokens    integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_id_idx ON messages (conversation_id, created_at);

-- L2 semantic memory. Only the validation gate writes here; direct inserts
-- from a request handler are a bug, mirroring the old Firestore rule that
-- forbade client creates.
CREATE TABLE semantic_memories (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content       text NOT NULL,
  tags          text[] NOT NULL DEFAULT '{}',
  confidence    real CHECK (confidence BETWEEN 0 AND 1),
  -- 768 dimensions fits Gemini text-embedding-004 and the common local
  -- bge/gte base models. Changing this requires a migration.
  embedding     vector(768),
  source        text,
  approved_by   uuid REFERENCES users(id),
  approved_at   timestamptz,
  purged_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX semantic_memories_agent_id_idx
  ON semantic_memories (agent_id) WHERE purged_at IS NULL;
CREATE INDEX semantic_memories_tags_idx ON semantic_memories USING gin (tags);
CREATE INDEX semantic_memories_embedding_idx
  ON semantic_memories USING hnsw (embedding vector_cosine_ops);

-- Staging queue. Every candidate fact lands here first and needs a human
-- decision (or an auto-approval that is still recorded in the audit chain).
CREATE TABLE staging_memories (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id           uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  content            text NOT NULL,
  tags               text[] NOT NULL DEFAULT '{}',
  confidence         real CHECK (confidence BETWEEN 0 AND 1),
  embedding          vector(768),
  source             text,
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'rejected')),
  flags              jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by         uuid REFERENCES users(id),
  decided_at         timestamptz,
  decision_reason    text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staging_memories_pending_idx
  ON staging_memories (agent_id, created_at) WHERE status = 'pending';

-- L3 episodic log. Append-only.
CREATE TABLE episodic_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id    uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  summary     text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX episodic_memories_agent_id_idx
  ON episodic_memories (agent_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Tamper-evident audit chain
-- ---------------------------------------------------------------------------
--
-- Each entry stores the SHA-256 of (previous hash || canonical payload), so
-- editing any earlier row breaks every later hash. Updates and deletes are
-- blocked by trigger rather than convention.

CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Chain scope. Memory-scoped entries chain per memory; everything else
  -- chains under the reserved scope 'account'.
  chain_key     text NOT NULL,
  action        text NOT NULL,
  actor_id      uuid REFERENCES users(id),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash     bytea,
  entry_hash    bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_chain_key_idx ON audit_logs (chain_key, id);
CREATE INDEX audit_logs_user_id_idx ON audit_logs (user_id, id DESC);

-- Head pointer per chain, updated inside the same transaction as the append.
CREATE TABLE audit_chain_heads (
  chain_key   text PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  head_hash   bytea NOT NULL,
  head_id     bigint NOT NULL REFERENCES audit_logs(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

-- ---------------------------------------------------------------------------
-- Signed audit-trail share links
-- ---------------------------------------------------------------------------

CREATE TABLE audit_shares (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_key    text NOT NULL,
  -- SHA-256 of the issued token. Presence of the row is what makes a token
  -- valid, which gives the revocation the Firebase version lacked.
  token_hash   bytea NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_shares_user_id_idx ON audit_shares (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Usage metering (replaces the Firestore per-tenant daily usage docs)
-- ---------------------------------------------------------------------------

CREATE TABLE usage_daily (
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day            date NOT NULL,
  input_tokens   bigint NOT NULL DEFAULT 0,
  output_tokens  bigint NOT NULL DEFAULT 0,
  embed_chars    bigint NOT NULL DEFAULT 0,
  requests       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Schema bookkeeping
-- ---------------------------------------------------------------------------

CREATE TABLE schema_migrations (
  version     text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);
