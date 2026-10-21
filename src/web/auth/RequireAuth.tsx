import { Navigate, Outlet } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <p className="page">Chargement…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
