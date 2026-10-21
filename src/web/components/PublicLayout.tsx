import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppVersion } from './AppVersion';

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <main className="public">
      {children}
      <p className="foot">
        Inscriptions-club · <Link to="/confidentialite">Politique de confidentialité</Link>
      </p>
      <AppVersion />
    </main>
  );
}
