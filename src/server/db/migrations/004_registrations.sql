-- 004_registrations : inscriptions (contracts/models.md). Les endpoints publics arrivent avec l'issue #6 ;
-- la table est créée dès #5 pour les compteurs (registrations_count / remaining_places) et les garde-fous 409.
CREATE TABLE registrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id       uuid NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
  participant_name  text NOT NULL CHECK (char_length(participant_name) BETWEEN 1 AND 120),
  is_minor          boolean NOT NULL,
  contact_name      text NOT NULL CHECK (char_length(contact_name) BETWEEN 1 AND 120),
  contact_email     citext NOT NULL,
  consent_at        timestamptz NOT NULL,
  consent_version   text NOT NULL,
  manage_token_hash text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);
-- Un parent peut inscrire plusieurs enfants : unicité par (activité, e-mail, nom du participant).
CREATE UNIQUE INDEX registrations_unique_participant ON registrations (activity_id, contact_email, lower(participant_name));
CREATE INDEX registrations_activity_idx ON registrations (activity_id, created_at);
