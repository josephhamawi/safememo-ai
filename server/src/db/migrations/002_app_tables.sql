-- Tables backing the dashboard: notifications, custom slash commands, and the
-- user profile fields the Firestore `users/{uid}` document carried.

-- ---------------------------------------------------------------------------
-- User profile
-- ---------------------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN preferences          jsonb   NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
--
-- The Firestore rule for these never matched: it declared
-- `/notifications/{userId}/{notificationId}` (three segments, ending on a
-- collection) while the client wrote `notifications/{uid}/items/{id}`. Client
-- reads were denied outright. A plain table with a user_id column removes the
-- whole class of path/rule mismatch.

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  title       text NOT NULL,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Custom slash commands
-- ---------------------------------------------------------------------------

CREATE TABLE custom_commands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (name ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  description text,
  prompt      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX custom_commands_user_idx ON custom_commands (user_id, name);

-- ---------------------------------------------------------------------------
-- Early-access requests (landing page lead capture)
-- ---------------------------------------------------------------------------
--
-- The Firestore rule allowed unauthenticated creates and size-capped only
-- four named fields, so an attacker could attach an unchecked 900 KB field and
-- write unbounded documents. Column types and lengths enforce the shape here,
-- and the API rate-limits the endpoint.

CREATE TABLE early_access_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  name          text CHECK (length(name) <= 200),
  organization  text CHECK (length(organization) <= 200),
  use_case      text CHECK (length(use_case) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX early_access_requests_created_idx
  ON early_access_requests (created_at DESC);
