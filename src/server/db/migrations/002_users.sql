-- 002_users : responsables d'activité (contracts/models.md). Aucune table de sessions (JWT en cookie).
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'manager')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
