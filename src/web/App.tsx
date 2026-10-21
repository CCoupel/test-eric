import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { RequireAuth } from './auth/RequireAuth';
import { ActivitiesPage } from './pages/ActivitiesPage';
import { ActivityDetailPage } from './pages/ActivityDetailPage';
import { ActivityNewPage } from './pages/ActivityNewPage';
import { MailingDetailPage } from './pages/MailingDetailPage';
import { MailingNewPage } from './pages/MailingNewPage';
import { MailingsPage } from './pages/MailingsPage';
import { UnsubscribePage } from './pages/UnsubscribePage';
import { LoginPage } from './pages/LoginPage';
import { ManageRegistrationPage } from './pages/ManageRegistrationPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { PublicActivityPage } from './pages/PublicActivityPage';

function PrivateApp() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/activities/new" element={<ActivityNewPage />} />
          <Route path="/activities/:id" element={<ActivityDetailPage />} />
          <Route path="/mailings" element={<MailingsPage />} />
          <Route path="/mailings/new" element={<MailingNewPage />} />
          <Route path="/mailings/:id" element={<MailingDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/activities" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export function App() {
  // Pages publiques hors AuthProvider : aucun appel /api/auth/me pour les participants.
  return (
    <Routes>
      <Route path="/a/:slug" element={<PublicActivityPage />} />
      <Route path="/r/:token" element={<ManageRegistrationPage />} />
      <Route path="/u/:token" element={<UnsubscribePage />} />
      <Route path="/confidentialite" element={<PrivacyPage />} />
      <Route path="/*" element={<PrivateApp />} />
    </Routes>
  );
}
