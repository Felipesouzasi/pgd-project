import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useReactTable, getCoreRowModel, flexRender,
  createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, Plus, RefreshCw, ChevronUp, ChevronDown,
  ChevronsUpDown, ChevronLeft, ChevronRight,
  Eye, CheckSquare, Download, Calendar, BarChart2,
  Clock, Loader2, CheckCircle2, XCircle, ScanSearch,
  FileSpreadsheet, FileText, ChevronDown as ChevDown, Award, AlertCircle, ShieldAlert,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import StatusBadge from '../components/acoes/StatusBadge';
import { exportExcel, exportCSV, splitBr, cleanStatus, fmtDate } from '../lib/export';
import type { Acao, PaginatedResponse, StatusItem } from '../types';

const col = createColumnHelper<Acao>();

function fmt(v: number | null | undefined) {
  if (v == null) return '0,00';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function ListCell({ value }: { value: string | null }) {
  const items = splitBr(value);
  if (!items.length) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex flex-col">
      {items.map((item, idx) => {
        const dash = item.startsWith('- ') ? '- ' : '';
        const name = dash ? item.slice(2) : item;
        return (
          <span key={idx} className="text-xs leading-tight">
            {dash && <span className="text-white/50">{dash}</span>}
            <span className="text-white/70">{name}</span>
          </span>
        );
      })}
    </div>
  );
}

function CulturaCell({ value }: { value: string | null }) {
  const items = splitBr(value);
  if (!items.length) return <span className="text-gray-600">—</span>;
  return (
    <div className="flex flex-col gap-px">
      {items.map((item, idx) => (
        <span key={idx} className="text-gray-300 text-xs leading-tight">{item}</span>
      ))}
    </div>
  );
}

function ProgressIcon({ status }: { status: string }) {
  const s = cleanStatus(status).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('FINALIZADA'))    return <CheckCircle2 size={18} className="text-green-500" />;
  if (s.includes('CANCELADA'))     return <XCircle size={18} className="text-rose-500" />;
  if (s.includes('REPROVADA') || s.includes('RECUSADA') || s.includes('PENDENTES'))
    return <Clock size={18} className="text-orange-400" />;
  if (s.includes('ANALISE'))       return <ScanSearch size={18} className="text-purple-400" />;
  if (s.includes('PLANEJADA'))     return <Clock size={18} className="text-green-400" />;
  if (s.includes('AGUARDANDO') || s.includes('APROVACAO'))
    return <Loader2 size={18} className="text-yellow-400" />;
  return <Clock size={18} className="text-gray-500" />;
}

export default function Acoes() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusId, setStatusId] = useState<number | undefined>(
    searchParams.get('status_id') ? Number(searchParams.get('status_id')) : undefined,
  );
  const [dtInicio, setDtInicio] = useState<string | undefined>(searchParams.get('dt_inicio') ?? undefined);
  const [dtFim, setDtFim]       = useState<string | undefined>(searchParams.get('dt_fim') ?? undefined);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Deep-link vindo do Dashboard BI: limpa a URL depois de aplicar o filtro
  useEffect(() => {
    if (searchParams.toString()) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [exportOpen, setExportOpen] = useState(false);
  const [adminModalAcaoId, setAdminModalAcaoId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const sortBy = sorting[0]?.id ?? 'acao_id';
  const sortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : 'desc';

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['acoes', page, limit, search, statusId, dtInicio, dtFim, sortBy, sortDir],
    queryFn: () =>
      api.get<PaginatedResponse<Acao>>('/actions', {
        params: {
          page, limit, search: search || undefined, status_id: statusId || undefined,
          dt_inicio: dtInicio || undefined, dt_fim: dtFim || undefined,
          sort_by: sortBy, sort_dir: sortDir,
        },
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const { data: statusList } = useQuery({
    queryKey: ['status-list'],
    queryFn: () => api.get<StatusItem[]>('/actions/status-list').then((r) => r.data),
    staleTime: Infinity,
  });

  async function downloadPdf(acaoId: number) {
    try {
      const response = await api.get(`/actions/${acaoId}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `acao_${acaoId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  }

  const columns = [
    col.accessor('acao_id', { header: 'Ação', size: 70,
      cell: (i) => <span className="font-mono text-gray-300 text-xs">{i.getValue()}</span> }),
    col.accessor('dt_acao', { header: 'Data Ação', size: 95,
      cell: (i) => <span className="text-xs">{fmtDate(i.getValue())}</span> }),
    col.accessor('consultor', { header: 'Consultor', size: 155,
      cell: (i) => <span className="text-white/75 font-medium text-xs">{i.getValue()}</span> }),
    col.accessor('filial', { header: 'Filial', size: 120,
      cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('municipio', { header: 'Município', size: 110,
      cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('atividade', { header: 'Atividade', size: 155,
      cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('vlr_previsto_ar', { header: 'Vlr Prev. AR', size: 105,
      cell: (i) => <span className="text-xs font-mono">{fmt(i.getValue())}</span> }),
    col.accessor('produtos', { header: 'Produtos', size: 165, enableSorting: false,
      cell: (i) => <ListCell value={i.getValue()} /> }),
    col.accessor('culturas', { header: 'Culturas', size: 175, enableSorting: false,
      cell: (i) => <CulturaCell value={i.getValue()} /> }),
    col.accessor('status_nome', { header: 'Status', size: 175,
      cell: (i) => <StatusBadge statusId={i.row.original.status_id} statusNome={cleanStatus(i.getValue())} /> }),
    col.display({ id: 'progresso', header: 'Progresso', size: 70,
      cell: (i) => (
        <div className="flex justify-center">
          <ProgressIcon status={i.row.original.status_nome} />
        </div>
      ),
    }),
    col.display({ id: 'opcoes', header: 'Opções', size: 140,
      cell: (i) => {
        const row = i.row.original;
        const visao = user?.pgd_acao_visao;
        const isAdmin = visao === 'ADM' || user?.priv_admin === 'S';
        // Usar status_nome para evitar dependência de IDs hardcoded do banco
        const sNome = (row.status_nome ?? '').toUpperCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const isPlanejada   = sNome.includes('PLANEJADA');
        const isEmAprovacao = sNome.includes('APROVACAO');
        const isEmAnalise   = sNome.includes('ANALISE');
        const isReprovada   = sNome.includes('REPROVADA') || sNome.includes('RECUSADA');
        // APROVADA (GR) = status onde Tamara/ADM escolhe destino final (3 opções)
        const isAprovadaGR  = sNome.includes('APROVADA') && sNome.includes('GR');
        return (
          <div className="flex items-center gap-0.5">
            {/*
              Regras de visibilidade por perfil + status_nome:
              GD  → olho apenas em EM APROVAÇÃO
              COM → olho apenas quando reprovada (GD ou GER reprovou)
              GER → olho em EM APROVAÇÃO; lupa em EM ANÁLISE
              ADM → olho sempre; botão Tamara em APROVADA (GR); S + histórico sempre
              GD/COM → double-check (comprovar) em PLANEJADA
            */}

            {/* Olho */}
            {(isAdmin ||
              (visao === 'GER' && isEmAprovacao) ||
              (visao === 'GD'  && isEmAprovacao) ||
              (visao === 'COM' && isReprovada)
            ) && (
              <ActionBtn icon={<Eye size={13} />} title="Visualizar"
                onClick={() => navigate(`/acoes/${row.acao_id}`)} />
            )}

            {/* Double-check: comprovar — GD/COM/ADM em PLANEJADA */}
            {(visao === 'GD' || visao === 'COM' || isAdmin) && isPlanejada && (
              <ActionBtn icon={<CheckSquare size={13} />} title="Comprovar ação" green
                onClick={() => navigate(`/acoes/${row.acao_id}/comprovacao`)} />
            )}

            {/* Lupa: analisar comprovação — GER/ADM em EM ANÁLISE */}
            {(visao === 'GER' || isAdmin) && isEmAnalise && (
              <ActionBtn icon={<ScanSearch size={13} />} title="Analisar / Aprovar"
                onClick={() => navigate(`/acoes/${row.acao_id}`)} />
            )}

            {/* Tamara: ADM destina ação final — APROVADA (GR) */}
            {isAdmin && isAprovadaGR && (
              <ActionBtn icon={<Award size={13} />} title="Realizada aprovada — definir encaminhamento"
                onClick={() => navigate(`/acoes/${row.acao_id}`)} />
            )}

            {/* Calendário: reprogramar data — GD/COM/ADM */}
            {(visao === 'GD' || visao === 'COM' || isAdmin) && (
              <ActionBtn icon={<Calendar size={13} />} title="Reprogramar data"
                onClick={() => navigate(`/acoes/${row.acao_id}/reprogramar`)} />
            )}

            {/* PDF */}
            <ActionBtn icon={<FileText size={13} />} title="PDF da ação" red
              onClick={() => downloadPdf(row.acao_id)} />

            {/* S + Histórico: apenas ADM */}
            {isAdmin && (
              <>
                <ActionBtn
                  icon={<span className="text-[10px] font-bold leading-none">S</span>}
                  title="Controle de Status (ADM)"
                  onClick={() => setAdminModalAcaoId(row.acao_id)}
                />
                <ActionBtn icon={<BarChart2 size={13} />} title="Histórico de status"
                  onClick={() => navigate(`/acoes/${row.acao_id}?tab=historico`)} />
              </>
            )}
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data: data?.data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    manualPagination: true,
    pageCount: data?.meta.total_pages ?? 1,
    getCoreRowModel: getCoreRowModel(),
  });

  const meta = data?.meta;
  const rows = data?.data ?? [];

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden px-6 pt-6 pb-0 gap-3">

      {/* Título */}
      <h2 className="text-xl font-semibold text-white shrink-0">Consulta Ações</h2>

      {/* Toolbar: filtros à esquerda, ações à direita */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Esquerda */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <Search size={14} className="ml-3 text-gray-500 shrink-0" />
            <input type="text" value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Busca rápida..."
              className="bg-transparent px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none w-52"
            />
          </div>
          <select value={statusId ?? ''}
            onChange={(e) => { setStatusId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
            className="bg-gray-900 border border-gray-800 text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
          >
            <option value="">Todos os status</option>
            {statusList?.map((s) => <option key={s.status_id} value={s.status_id}>{s.nome}</option>)}
          </select>

          {(statusId || dtInicio || dtFim) && (
            <button
              onClick={() => { setStatusId(undefined); setDtInicio(undefined); setDtFim(undefined); setPage(1); }}
              className="flex items-center gap-1.5 bg-green-500/15 border border-green-500/30 text-green-400 text-xs font-medium px-3 py-2 rounded-lg hover:bg-green-500/25 transition-colors"
              title="Filtro aplicado a partir do Dashboard — clique para limpar"
            >
              Filtro do Dashboard ✕
            </button>
          )}
        </div>

        {/* Direita */}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => navigate("/acoes/nova")} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={16} /> Nova Ação
          </button>

          <div className="relative">
            <button onClick={() => setExportOpen((o) => !o)}
              className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors">
              <Download size={14} /> Exportação
              <ChevDown size={13} className={`transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-gray-900 border border-gray-800 rounded-lg shadow-xl z-10 overflow-hidden">
                <button onClick={() => { exportExcel(rows); setExportOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                  <FileSpreadsheet size={14} className="text-green-500" /> Excel (.xls)
                </button>
                <button onClick={() => { exportCSV(rows); setExportOpen(false); }}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
                  <FileText size={14} className="text-green-400" /> CSV (.csv)
                </button>
              </div>
            )}
          </div>

          <button onClick={() => refetch()}
            className="p-2 text-gray-400 hover:text-white bg-gray-900 border border-gray-800 rounded-lg transition-colors" title="Atualizar">
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Card da tabela */}
      <div className="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {/*
          overflow-auto aqui: o scroll horizontal fica visível na borda inferior do card.
          A paginação está DENTRO deste div — aparece apenas ao rolar até o fim.
        */}
        <div className="h-full overflow-auto">
          <table className="text-sm" style={{ minWidth: '1400px', width: '100%' }}>
            <thead className="sticky top-0 z-10">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-gray-800 bg-gray-900">
                  {hg.headers.map((header) => (
                    <th key={header.id} style={{ width: header.getSize(), minWidth: header.getSize() }}
                      className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap select-none">
                      {header.column.getCanSort() ? (
                        <button onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1 hover:text-white transition-colors">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getIsSorted() === 'asc' ? <ChevronUp size={12} /> :
                           header.column.getIsSorted() === 'desc' ? <ChevronDown size={12} /> :
                           <ChevronsUpDown size={12} className="opacity-30" />}
                        </button>
                      ) : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {isFetching && !data ? (
                <tr><td colSpan={columns.length} className="text-center py-16 text-gray-500">
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" />Carregando...
                </td></tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-16 text-gray-500">
                  Nenhuma ação encontrada.
                </td></tr>
              ) : (
                table.getRowModel().rows.map((row, idx) => (
                  <tr key={row.id}
                    className={`border-b border-gray-800/60 hover:bg-gray-800/40 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-900/30'}`}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-1 text-gray-300 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Paginação dentro do scroll — visível só ao chegar no fim */}
          {meta && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-900 text-sm text-gray-400">
              <span className="text-xs">
                Página {meta.page} de {meta.total_pages} — {((meta.page - 1) * meta.limit + 1).toLocaleString('pt-BR')} a{' '}
                {Math.min(meta.page * meta.limit, meta.total).toLocaleString('pt-BR')} de {meta.total.toLocaleString('pt-BR')}
              </span>
              <div className="flex items-center gap-1">
                <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft size={15} /></PagBtn>
                <PagBtn onClick={() => setPage((p) => Math.min(meta.total_pages, p + 1))} disabled={page === meta.total_pages}><ChevronRight size={15} /></PagBtn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Modal ADM — forçar status direto da grid */}
    {adminModalAcaoId !== null && (
      <AdminStatusModal
        acaoId={adminModalAcaoId}
        onClose={() => setAdminModalAcaoId(null)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['acoes'] });
          setAdminModalAcaoId(null);
        }}
      />
    )}
    </>
  );
}

function AdminStatusModal({ acaoId, onClose, onSuccess }: { acaoId: number; onClose: () => void; onSuccess: () => void }) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [detalhe, setDetalhe]               = useState('');
  const [error, setError]                   = useState('');

  const { data: historico = [] } = useQuery<{ acao_status_id: number; dt_status: string; status_nome: string; detalhe: string | null; usuario: string }[]>({
    queryKey: ['acao-history', acaoId],
    queryFn: () => api.get(`/actions/${acaoId}/history`).then(r => r.data),
  });
  const { data: statusList = [] } = useQuery<{ status_id: number; nome: string }[]>({
    queryKey: ['status-list-all'],
    queryFn: () => api.get('/actions/status-list?all=true').then(r => r.data),
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: () => api.patch(`/actions/${acaoId}/status`, {
      status_id: Number(selectedStatus),
      justificativa: detalhe.trim() || undefined,
    }),
    onSuccess,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Erro ao alterar status.');
    },
  });

  function handleSubmit() {
    if (!selectedStatus)     { setError('Selecione um status'); return; }
    if (!detalhe.trim())     { setError('Justificativa é obrigatória'); return; }
    setError(''); mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#1a1d27] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <ShieldAlert size={18} className="text-rose-400" />
            <div>
              <p className="font-semibold text-white text-sm">Status Atribuídos à Ação #{acaoId}</p>
              <p className="text-xs text-white/40">{new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {/* Histórico */}
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Histórico</p>
          <div className="rounded-xl border border-white/8 overflow-hidden mb-5">
            <div className="grid grid-cols-4 bg-white/4 border-b border-white/8 px-4 py-2">
              {['Dt. Status','Status','Detalhe','Usuário'].map(h => (
                <span key={h} className="text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {historico.length === 0 && <p className="px-4 py-5 text-center text-sm text-white/30">Sem histórico.</p>}
            {historico.map(h => (
              <div key={h.acao_status_id} className="grid grid-cols-4 px-4 py-2.5 border-b border-white/5 hover:bg-white/3">
                <span className="text-xs text-white/50 font-mono">{new Date(h.dt_status).toLocaleString('pt-BR')}</span>
                <span className="text-xs text-white/80">{h.status_nome}</span>
                <span className="text-xs text-white/50 truncate">{h.detalhe || '—'}</span>
                <span className="text-xs text-green-400">{h.usuario}</span>
              </div>
            ))}
          </div>

          {/* Form */}
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Novo Status</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Status <span className="text-rose-400">*</span></label>
              <select value={selectedStatus} onChange={e => { setSelectedStatus(e.target.value); setError(''); }}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-[#0d0f17] text-sm text-white outline-none focus:border-green-500/60 transition-all">
                <option value="">Selecione um status</option>
                {statusList.map(s => <option key={s.status_id} value={s.status_id}>{s.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Observação / Detalhes <span className="text-rose-400">*</span></label>
              <textarea value={detalhe} onChange={e => setDetalhe(e.target.value)} rows={4}
                placeholder="Justificativa para alteração de status"
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-white/20 outline-none focus:border-green-500/60 transition-all resize-none" />
            </div>
          </div>
          {error && <p className="text-xs text-rose-400 mt-2 flex items-center gap-1"><AlertCircle size={11}/>{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-all">Sair</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-all">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
            Incluir
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ icon, title, green, red, onClick }: { icon: React.ReactNode; title: string; green?: boolean; red?: boolean; onClick?: () => void }) {
  const cls = green ? 'text-green-400 hover:bg-green-900/40'
             : red  ? 'text-red-400 hover:bg-red-900/30'
             : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800';
  return <button title={title} onClick={onClick} className={`p-1.5 rounded transition-colors ${cls}`}>{icon}</button>;
}

function PagBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}
