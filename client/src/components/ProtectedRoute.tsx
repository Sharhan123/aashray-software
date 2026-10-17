import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../state/useAuth';
import { LoadingScreen } from './ui';
export function ProtectedRoute() {
  const { state } = useAuth(); const location = useLocation();
  if (state.status === 'loading') return <LoadingScreen />;
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
