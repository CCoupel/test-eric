-- 003_activities : activités (contracts/models.md). `registrations` arrive avec le LOT-3.
CREATE TABLE activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 2000),
  starts_at   timestamptz NOT NULL,
  location    text NOT NULL CHECK (char_length(location) BETWEEN 1 AND 200),
  capacity    integer CHECK (capacity IS NULL OR capacity > 0),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  public_slug text NOT NULL UNIQUE,
  owner_id    uuid NOT NULL REFERENCES users (id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_starts_at_idx ON activities (starts_at DESC);
