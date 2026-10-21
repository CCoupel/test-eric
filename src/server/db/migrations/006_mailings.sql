-- 006_mailings : historique des e-mails groupés (contracts/models.md, issue #7). Créé dès #6 car la désinscription et la purge RGPD
-- anonymisent déjà `mailing_recipients` (email, error, registration_id). Les services d'envoi arrivent avec #7.
CREATE TABLE mailings (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 200),
  body             text NOT NULL CHECK (char_length(body) <= 20000),
  sender_id        uuid NOT NULL REFERENCES users (id),
  status           text NOT NULL CHECK (status IN ('sending', 'sent', 'partial', 'failed')),
  recipients_count integer NOT NULL,
  sent_count       integer NOT NULL DEFAULT 0,
  failed_count     integer NOT NULL DEFAULT 0,
  transport        text NOT NULL CHECK (transport IN ('smtp', 'stub')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);

CREATE TABLE mailing_activities (
  mailing_id  uuid NOT NULL REFERENCES mailings (id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  PRIMARY KEY (mailing_id, activity_id)
);

CREATE TABLE mailing_recipients (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailing_id      uuid NOT NULL REFERENCES mailings (id) ON DELETE CASCADE,
  registration_id uuid REFERENCES registrations (id) ON DELETE SET NULL,
  email           citext,
  status          text NOT NULL CHECK (status IN ('sent', 'failed', 'stubbed')),
  error           text,
  sent_at         timestamptz
);
CREATE INDEX mailing_recipients_registration_idx ON mailing_recipients (registration_id);
