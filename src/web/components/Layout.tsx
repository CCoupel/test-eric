import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { AppVersion } from './AppVersion';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="app-header">
        <span className="brand">Inscriptions-club</span>
        <nav>
          <NavLink to="/activities">Activités</NavLink>
        </nav>
        <span className="user">
          {user?.name} ·{' '}
          <button type="button" className="linkbtn" data-testid="logout-button" onClick={() => void onLogout()}>
            Se déconnecter
          </button>
        </span>
      </header>
      <main className="page">{children}
        <AppVersion />
      </main>
    </>
  );
}
