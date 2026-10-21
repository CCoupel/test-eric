-- 007 : défense en profondeur RGPD. Tout DELETE d'une inscription (SQL direct, cascade d'activité, futur code) efface
-- l'e-mail et l'erreur de transport des destinataires d'envois liés ; la FK ON DELETE SET NULL ne retire que le lien.
CREATE FUNCTION anonymize_recipients_on_registration_delete() RETURNS trigger AS $$
BEGIN
  UPDATE mailing_recipients SET email = NULL, error = NULL WHERE registration_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registrations_anonymize_recipients
  BEFORE DELETE ON registrations
  FOR EACH ROW EXECUTE FUNCTION anonymize_recipients_on_registration_delete();
