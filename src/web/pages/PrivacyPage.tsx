import { useEffect, useState } from 'react';
import { publicApi } from '../api/public';
import { PublicLayout } from '../components/PublicLayout';

export function PrivacyPage() {
  const [contact, setContact] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    publicApi
      .info()
      .then((i) => active && setContact(i.contact_email))
      .catch(() => undefined); // repli : texte générique ci-dessous
    return () => {
      active = false;
    };
  }, []);

  return (
    <PublicLayout>
      <section className="screen">
        <h1>Politique de confidentialité</h1>
        <h2>Données collectées</h2>
        <p>Lors d’une inscription : le nom du participant, le nom du parent ou tuteur (pour un mineur) et une adresse e-mail de contact.</p>
        <h2>Finalités</h2>
        <p>Ces informations servent uniquement à gérer votre inscription à l’activité du club et à vous contacter à son sujet. Elles ne sont ni vendues ni transmises à des tiers.</p>
        <h2>Conservation</h2>
        <p>Vos données sont conservées jusqu’à 12 mois après la date de l’activité, puis supprimées automatiquement.</p>
        <h2>Vos droits</h2>
        <p>
          Vous pouvez vous désinscrire et faire effacer vos données à tout moment grâce au lien de gestion affiché à la fin de votre inscription
          (page « Mon inscription »). Pour toute autre demande (accès, rectification), contactez le bureau du club{' '}
          {contact ? (
            <>
              à l’adresse <a href={`mailto:${contact}`} data-testid="privacy-contact">{contact}</a>.
            </>
          ) : (
            <>via votre responsable d’activité.</>
          )}
        </p>
        <h2>Mineurs</h2>
        <p>L’inscription d’un mineur est faite par son parent ou tuteur légal, qui en confirme la qualité lors de l’inscription.</p>
      </section>
    </PublicLayout>
  );
}
