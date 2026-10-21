import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppVersion } from '../components/AppVersion';

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/activities" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/activities', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError('E-mail ou mot de passe incorrect.');
      else if (err instanceof ApiError && err.status === 429) setError('Trop de tentatives. Réessayez dans une minute.');
      else if (err instanceof ApiError && err.status === 400) setError('Saisissez un e-mail et un mot de passe valides.');
      else setError(err instanceof ApiError ? err.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <section className="screen">
        <h1>Connexion responsable</h1>
        <form onSubmit={(e) => void onSubmit(e)}>
          <label htmlFor="login-email">E-mail</label>
          <input id="login-email" type="email" autoComplete="username" required data-testid="login-email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="login-password">Mot de passe</label>
          <input id="login-password" type="password" autoComplete="current-password" required data-testid="login-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="error" role="alert" data-testid="login-error">{error}</p>}
          <button type="submit" className="btn primary" data-testid="login-submit" disabled={busy}>Se connecter</button>
        </form>
        <p className="hint">Pas de création de compte en ligne : demandez un accès au bureau du club.</p>
      </section>
      <AppVersion />
    </main>
  );
}
