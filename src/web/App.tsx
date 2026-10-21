import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { ActivityDetailPage } from './pages/ActivityDetailPage';
import { ActivityNewPage } from './pages/ActivityNewPage';
import { LoginPage } from './pages/LoginPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/activities/new" element={<ActivityNewPage />} />
          <Route path="/activities/:id" element={<ActivityDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/activities" replace />} />
      </Routes>
    </AuthProvider>
  );
}
