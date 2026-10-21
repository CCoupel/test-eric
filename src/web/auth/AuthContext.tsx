import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError, setUnauthorizedHandler } from '../api/client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api<{ user: User }>('GET', '/api/auth/me')
      .then((r) => active && setUser(r.user))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    setUnauthorizedHandler(() => setUser(null));
    return () => {
      active = false;
      setUnauthorizedHandler(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User }>('POST', '/api/auth/login', { email, password });
    setUser(r.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('POST', '/api/auth/logout');
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
