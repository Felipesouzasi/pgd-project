import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';

/**
 * Protege rotas autenticadas.
 * - Sem token → /login
 * - must_change_password → /definir-senha (bloqueado até trocar)
 */
export default function RequireAuth() {
  const { token, user } = useAuthStore();

  if (!token || !user) return <Navigate to="/login" replace />;
  if (user.must_change_password) return <Navigate to="/definir-senha" replace />;

  return <Outlet />;
}
