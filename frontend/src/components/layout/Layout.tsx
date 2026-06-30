import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth.store';
import { useThemeStore } from '../../stores/theme.store';
import Sidebar from './Sidebar';

export default function Layout() {
  const token = useAuthStore((s) => s.token);
  const { theme } = useThemeStore();
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className={`flex h-screen overflow-hidden ${
      theme === 'dark' ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'
    }`}>
      <Sidebar />
      {/* min-w-0 evita que flex item expanda além da tela */}
      <main className="flex-1 overflow-hidden min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
