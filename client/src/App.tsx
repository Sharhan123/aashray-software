import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingScreen } from './components/ui';
import { useAuth } from './state/useAuth';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './shell/AppShell';
import { BillingPage, DashboardLivePage, MessagesPage, OwnerRemindersPage, PaymentsPage, PropertiesPage, ReportsPage, ResidentDetailPage, ResidentsPage, RoomsPage, SettingsPage, StaffPage } from './pages/BusinessPages';

export function App() {
  const { state } = useAuth();
  if (state.status === 'loading') return <LoadingScreen />;
  return <Routes>
    <Route path="/login" element={state.status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
    <Route element={<ProtectedRoute />}><Route element={<AppShell />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<DashboardLivePage />} />
      <Route path="properties" element={<PropertiesPage />} />
      <Route path="properties/:id" element={<PropertiesPage />} />
      <Route path="residents" element={<ResidentsPage />} />
      <Route path="residents/:id" element={<ResidentDetailPage />} />
      <Route path="rooms" element={<RoomsPage />} />
      <Route path="billing" element={<BillingPage />} />
      <Route path="payments" element={<PaymentsPage />} />
      <Route path="messages" element={<MessagesPage />} />
      <Route path="reminders" element={<OwnerRemindersPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="staff" element={<StaffPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route></Route>
    <Route path="*" element={<Navigate to={state.status === 'authenticated' ? '/' : '/login'} replace />} />
  </Routes>;
}
