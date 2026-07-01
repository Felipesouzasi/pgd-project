import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Dashboard from './Dashboard';
import api from '../lib/api';

// ── Mocks ──
vi.mock('../lib/api', () => ({
  default: { get: vi.fn() },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('recharts', async () => {
  const OriginalRechartsModule = await vi.importActual('recharts');
  const MockComponent = ({ children }: any) => <div>{children}</div>;
  return {
    ...OriginalRechartsModule,
    ResponsiveContainer: MockComponent, BarChart: MockComponent, Bar: MockComponent,
    XAxis: MockComponent, YAxis: MockComponent, CartesianGrid: MockComponent, Tooltip: MockComponent,
    PieChart: MockComponent, Pie: MockComponent, Cell: MockComponent, Line: MockComponent,
    Legend: MockComponent, Area: MockComponent, AreaChart: MockComponent,
  };
});

// Mock SVG elements that cause JSDOM warnings
vi.mock('defs', () => ({ default: 'defs' }));
vi.mock('linearGradient', () => ({ default: 'linearGradient' }));
vi.mock('stop', () => ({ default: 'stop' }));

describe('Dashboard Component - Interações e Cobertura', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();

    // Setup base API responses
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/dashboard/kpis') return Promise.resolve({ data: { 
        total_acoes: 100, finalizadas: 50, em_andamento: 30, reprovadas: 20,
        total_investido_ar: 1500000, total_previsto_ar: 2000000,
        total_investido_forn: 500, total_previsto_forn: 1000,
        publico_previsto_finalizadas: 100, publico_realizado_finalizadas: 85
      } });
      if (url === '/dashboard/por-status') return Promise.resolve({ data: [
        { status_id: 1, status: 'Planejada', total: 10 },
        { status_id: 2, status: 'Aguardando', total: 5 },
        { status_id: 3, status: 'SemCor', total: 2 }, // para testar fallback statusColor
      ]});
      if (url === '/dashboard/prazos') return Promise.resolve({ data: {
        total_aberto: 50, vencidas: 10, vence_7: 5, vence_14: 15, vence_30: 10, vence_depois: 10, dias_atraso_max: 42
      } });
      if (url === '/dashboard/anos') return Promise.resolve({ data: [{ ano: 2023 }, { ano: 2024 }] });
      if (url === '/dashboard/filiais') return Promise.resolve({ data: [{ filial: 'Filial A' }, { filial: 'Filial B' }] });
      if (url === '/dashboard/consultores') return Promise.resolve({ data: [
        { consultor: 'João 123456789012345678901234567890', total: 10, finalizadas: 8, vlr_ar: 500000 },
        { consultor: 'Maria', total: 10, finalizadas: 4, vlr_ar: 10000 }, // pct < 50
        { consultor: 'Pedro', total: 10, finalizadas: 6, vlr_ar: 200 },   // pct < 80
      ]});
      if (url === '/dashboard/regional') return Promise.resolve({ data: [
        { regional: 'Sul', total: 40, vlr_ar: 1000000 }
      ]});
      if (url === '/dashboard/por-mes') return Promise.resolve({ data: [
        { mes: '2024-01', total: 15, vlr_ar: 100000, vlr_forn: 20000 }
      ]});
      if (url === '/dashboard/por-filial') return Promise.resolve({ data: {
        filiais: [{ filial: 'Filial A', total: 50, vlr_ar: 800000 }],
        sem_filial: { filial: 'N/A', total: 5, vlr_ar: 10000 }
      }});
      if (url === '/dashboard/por-tipo') return Promise.resolve({ data: [
        { tipo: 'DT', total: 60, vlr_ar: 1200000 }
      ]});
      if (url === '/dashboard/produtos') return Promise.resolve({ data: [
        { produto: 'Prod 1 Longo nome para truncar', total: 20 }
      ]});
      if (url === '/dashboard/culturas') return Promise.resolve({ data: [
        { cultura: 'Cult 1 Longo nome para truncar', total: 30 }
      ]});
      return Promise.resolve({ data: [] });
    });
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('renderiza os KPIs com formatação correta de dinheiro (milhões e simples)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('R$1.5M')).toBeInTheDocument(); // 1500000 formatado (fmtK > 1M)
      expect(screen.getByText('R$500')).toBeInTheDocument();  // 500 formatado (fmtK < 1000)
    });
    
    // Verifica conversão de público
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('interage com os filtros do topo (Ano, Filial, Tipo)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Todos os anos')).toBeInTheDocument();
      expect(screen.getByText('2024')).toBeInTheDocument();
      expect(screen.getByText('Filial A')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    
    fireEvent.change(selects[0], { target: { value: '2024' } });
    fireEvent.change(selects[1], { target: { value: 'Filial A' } });
    fireEvent.change(selects[2], { target: { value: 'DT' } });

    // Clica no refresh button
    const refreshBtn = screen.getByRole('button', { name: '' }).closest('button');
    if (refreshBtn) fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/dashboard/por-status', expect.objectContaining({
        params: expect.objectContaining({ ano: '2024', filial: 'Filial A', tp_acao: 'DT' })
      }));
    });
  });

  it('testa a navegação dos cards de prazos', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('até 42 dias de atraso')).toBeInTheDocument();
    });

    // Clica em Vencidas
    fireEvent.click(screen.getByText('Vencidas'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('dt_fim='));

    // Clica em Vence em até 7 dias
    fireEvent.click(screen.getByText('Vence em até 7 dias'));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('dt_inicio='));

    // Vence em 8 a 14 dias
    fireEvent.click(screen.getByText('Vence em 8 a 14 dias'));
    expect(mockNavigate).toHaveBeenCalledTimes(3);

    // Vence em 15 a 30 dias
    fireEvent.click(screen.getByText('Vence em 15 a 30 dias'));
    expect(mockNavigate).toHaveBeenCalledTimes(4);

    // Vence depois de 30 dias
    fireEvent.click(screen.getByText('Vence depois de 30 dias'));
    expect(mockNavigate).toHaveBeenCalledTimes(5);
  });

  it('testa os cliques na lista lateral de status (Visão Geral)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Planejada')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Planejada'));
    expect(mockNavigate).toHaveBeenCalledWith('/acoes?status_id=1');
  });

  it('testa aba Financeiro e o FilialPicker', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Dashboard PGD')).toBeInTheDocument());
    
    fireEvent.click(screen.getByText('Financeiro'));
    await waitFor(() => expect(screen.getByText('Investido AR por Filial')).toBeInTheDocument());

    // Verifica aviso de sem_filial
    expect(screen.getByText(/5 ações sem filial cadastrada/i)).toBeInTheDocument();

    // Abre FilialPicker
    const pickerBtn = screen.getByText(/Filiais \(/);
    fireEvent.click(pickerBtn);

    // Clica em Limpar
    fireEvent.click(screen.getByText('Limpar'));
    
    // Clica na Filial A (checkbox)
    const checkbox = screen.getByLabelText('Filial A');
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox); // desmarca
    
    // Selecionar todas
    fireEvent.click(screen.getByText('Selecionar todas'));
    
    // Fecha o modal clicando fora (backdrop)
    const backdrop = document.querySelector('.fixed.inset-0.z-10');
    if (backdrop) fireEvent.click(backdrop);
  });

  it('testa aba Equipe e tabela de consultores', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Dashboard PGD')).toBeInTheDocument());
    
    fireEvent.click(screen.getByText('Equipe'));
    await waitFor(() => expect(screen.getByText('Top 10 Consultores por Ações')).toBeInTheDocument());

    // Tem consultor truncado (lenght > 26)
    // Tem cálculo de porcentagem (80% verde, 40% vermelho)
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('testa aba Portfólio', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Dashboard PGD')).toBeInTheDocument());
    
    fireEvent.click(screen.getByText('Portfólio'));
    await waitFor(() => expect(screen.getByText('Top Produtos')).toBeInTheDocument());
    
    // Verifica aviso de sem_filial na grid de Filiais do portfólio
    expect(screen.getByText(/5 ações sem filial cadastrada/i)).toBeInTheDocument();
  });

  it('testa filtros de data da Evolução Mensal', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Evolução Mensal de Ações')).toBeInTheDocument());

    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);

    fireEvent.change(dateInputs[0], { target: { value: '2023-01-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2023-12-31' } });
  });

  it('renderiza fallback de dados vazios', async () => {
    (api.get as any).mockResolvedValue({ data: [] });
    renderDashboard();
    
    await waitFor(() => {
      // "Tipo de Ação" empty state
      const emptyDivs = screen.getAllByText('Sem dados');
      expect(emptyDivs.length).toBeGreaterThan(0);
    });
    
    fireEvent.click(screen.getByText('Financeiro'));
    await waitFor(() => {
      expect(screen.getAllByText('Sem dados').length).toBeGreaterThan(0);
    });
  });
});
