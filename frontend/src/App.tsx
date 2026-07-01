import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RequireAuth from './components/auth/RequireAuth';
import Layout from './components/layout/Layout';
import Login from './pages/Login';
import DefinirSenha from './pages/DefinirSenha';
import Acoes from './pages/Acoes';
import VisualizacaoAcoes from './pages/VisualizacaoAcoes';
import NovaAcao from './pages/NovaAcao';
import DetalheAcao from './pages/DetalheAcao';
import Comprovacao from './pages/Comprovacao';
import RedefinirSenha from './pages/RedefinirSenha';
import Dashboard from './pages/Dashboard';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/login" element={<Login />} />
          <Route path="/definir-senha"   element={<DefinirSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

          {/* Rotas protegidas */}
          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/acoes"        element={<Acoes />} />
              <Route path="/acoes/nova"   element={<NovaAcao />} />
              <Route path="/acoes/:id"   element={<DetalheAcao />} />
              <Route path="/acoes/:id/comprovacao" element={<Comprovacao />} />
              <Route path="/visualizacao" element={<VisualizacaoAcoes />} />
              <Route path="/dashboard"   element={<Dashboard />} />
              <Route path="/"             element={<Navigate to="/acoes" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
