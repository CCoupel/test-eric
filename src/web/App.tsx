import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';

declare const __APP_VERSION__: string;

interface Health {
  status: string;
  version: string;
  db: string;
}

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; health: Health }
  | { kind: 'error'; message: string };

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue';

function Home() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/health', { signal: controller.signal })
      .then(async (res) => {
        const health = (await res.json()) as Health;
        setState(res.ok ? { kind: 'ok', health } : { kind: 'error', message: `HTTP ${res.status} (db : ${health.db})` });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Erreur réseau' });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <h1>Inscriptions-club</h1>
      <p>Version de l’application : <strong data-testid="app-version">{APP_VERSION}</strong></p>
      <section aria-live="polite">
        <h2>État du serveur</h2>
        {state.kind === 'loading' && <p>Vérification en cours…</p>}
        {state.kind === 'ok' && (
          <p>Serveur : {state.health.status} — base : {state.health.db} — version {state.health.version}</p>
        )}
        {state.kind === 'error' && <p role="alert">Serveur indisponible : {state.message}</p>}
      </section>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
