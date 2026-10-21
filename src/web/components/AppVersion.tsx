declare const __APP_VERSION__: string;

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'inconnue';

export function AppVersion() {
  return (
    <p className="hint version" data-testid="app-version">
      Version {APP_VERSION}
    </p>
  );
}
