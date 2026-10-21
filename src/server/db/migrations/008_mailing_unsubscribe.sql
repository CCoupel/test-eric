-- 008 : désabonnement en un clic (RFC 8058) + anti double-envoi.
--  * mailing_recipients.unsubscribe_token_hash : SHA-256 du token propre au message (jamais en clair) ; NULL une fois utilisé/anonymisé.
--  * mailings.fingerprint : empreinte (sujet, corps, activités) pour refuser un rejeu < 5 min.
ALTER TABLE mailing_recipients ADD COLUMN unsubscribe_token_hash text UNIQUE;
ALTER TABLE mailings ADD COLUMN fingerprint text;
CREATE INDEX mailings_sender_fingerprint_idx ON mailings (sender_id, fingerprint, created_at);
CREATE INDEX mailings_created_at_idx ON mailings (created_at);

-- Le trigger de suppression d'inscription (007) invalide aussi le lien de désabonnement des messages liés.
CREATE OR REPLACE FUNCTION anonymize_recipients_on_registration_delete() RETURNS trigger AS $$
BEGIN
  UPDATE mailing_recipients SET email = NULL, error = NULL, unsubscribe_token_hash = NULL WHERE registration_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
