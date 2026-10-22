-- 009 : un destinataire de mailing = une ADRESSE. Supprimer UNE inscription ne doit pas effacer l'adresse (ni invalider le lien de désabonnement)
-- tant qu'une autre inscription de cette adresse subsiste dans les activités de l'envoi ; elle est effacée avec la dernière.
CREATE OR REPLACE FUNCTION anonymize_recipients_on_registration_delete() RETURNS trigger AS $$
BEGIN
  UPDATE mailing_recipients mr
     SET email = NULL, error = NULL, unsubscribe_token_hash = NULL
   WHERE (mr.registration_id = OLD.id OR mr.email = OLD.contact_email)
     AND NOT EXISTS (
       SELECT 1 FROM registrations r2 JOIN mailing_activities ma ON ma.activity_id = r2.activity_id
        WHERE ma.mailing_id = mr.mailing_id AND r2.contact_email = mr.email AND r2.id <> OLD.id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
