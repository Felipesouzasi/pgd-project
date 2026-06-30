import { useState, useEffect } from 'react';
import {
  useReactTable, getCoreRowModel, flexRender,
  createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { useQuery } from '@tanstack/react-query';
import {
  Search, RefreshCw, ChevronUp, ChevronDown,
  ChevronsUpDown, ChevronLeft, ChevronRight,
  Download, Loader2, Clock, CheckCircle2, XCircle,
  ScanSearch, FileText, FileSpreadsheet, X, AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import StatusBadge from '../components/acoes/StatusBadge';
import { exportExcel, exportCSV, splitBr, cleanStatus, fmtDate } from '../lib/export';
import type { Acao, PaginatedResponse, StatusItem } from '../types';

const col = createColumnHelper<Acao>();

function fmt(v: number | null | undefined) {
  if (v == null) return '0,00';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function ItemList({ value }: { value: string | null }) {
  const items = splitBr(value);
  if (!items.length) return <span className="text-white/30">—</span>;
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      {items.map((item, idx) => {
        const clean = item.replace(/^-\s*/, '');
        return (
          <span key={idx} className="text-xs leading-snug text-white/70">
            {`- ${clean}`}
          </span>
        );
      })}
    </div>
  );
}

function ListCell({ value }: { value: string | null }) {
  return <ItemList value={value} />;
}

function CulturaCell({ value }: { value: string | null }) {
const items = splitBr(value);
  if (!items.length) return <span className="text-white/30">—</span>;
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      {items.map((item, idx) => {
        const clean = item.replace(/^-\s*/, '');
        return (
          <span key={idx} className="text-xs leading-snug text-white/70">
            {`- ${clean}`}
          </span>
        );
      })}
    </div>
  );
}

function ProgressIcon({ status }: { status: string }) {
  const s = cleanStatus(status).toUpperCase();
  if (s.includes('FINALIZADA'))    return <CheckCircle2 size={18} className="text-green-500" />;
  if (s.includes('REPROVADA') || s.includes('RECUSADA') || s.includes('PENDENTES'))
    return <XCircle size={18} className="text-red-500" />;
  if (s.includes('ANÁLISE') || s.includes('ANALISE'))
    return <ScanSearch size={18} className="text-purple-400" />;
  if (s.includes('PLANEJADA'))     return <Clock size={18} className="text-green-400" />;
  if (s.includes('AGUARDANDO') || s.includes('APROVAÇÃO') || s.includes('APROVACAO'))
    return <Loader2 size={18} className="text-yellow-400" />;
  return <Clock size={18} className="text-gray-500" />;
}

// ── Modal de exportação ───────────────────────────────────────────────────────

const LIMIT_OPTIONS = [
  { label: 'Página atual (50)',  value: 50 },
  { label: 'Últimas 100',        value: 100 },
  { label: 'Últimas 500',        value: 500 },
  { label: 'Últimas 1.000',      value: 1000 },
  { label: 'Todas (pode demorar)', value: 9999 },
];

interface ExportModalProps {
  currentSearch: string;
  currentStatusId: number | undefined;
  onClose: () => void;
}

function ExportModal({ currentSearch, currentStatusId, onClose }: ExportModalProps) {
  const [limit, setLimit]       = useState(100);
  const [dtInicio, setDtInicio] = useState('');
  const [dtFim, setDtFim]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function fetchAndExport(format: 'excel' | 'csv') {
    setError('');
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: 1,
        limit,
        sort_by: 'acao_id',
        sort_dir: 'desc',
      };
      if (currentSearch) params.search    = currentSearch;
      if (currentStatusId) params.status_id = currentStatusId;
      if (dtInicio) params.dt_inicio = dtInicio;
      if (dtFim)    params.dt_fim    = dtFim;

      const res = await api.get<PaginatedResponse<Acao>>('/actions', { params });
      const rows = res.data.data;
      if (!rows.length) { setError('Nenhum registro encontrado para os filtros selecionados.'); return; }
      if (format === 'excel') exportExcel(rows);
      else                    exportCSV(rows);
      onClose();
    } catch {
      setError('Erro ao buscar dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Download size={16} className="text-green-500" />
            <p className="font-semibold text-white text-sm">Exportar Ações</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Quantidade */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Quantidade de registros
            </label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-green-600"
            >
              {LIMIT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Filtro de período */}
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-2">
              Período da ação <span className="text-gray-600 normal-case font-normal">(opcional)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date" value={dtInicio} onChange={(e) => setDtInicio(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
              />
              <span className="text-gray-500 text-xs shrink-0">até</span>
              <input
                type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
              />
            </div>
          </div>

          {/* Filtros ativos */}
          {(currentSearch || currentStatusId) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-600/10 border border-green-600/20">
              <AlertCircle size={13} className="text-green-400 mt-0.5 shrink-0" />
              <p className="text-xs text-green-300">
                Filtros ativos da tela serão aplicados
                {currentSearch && <> — busca: <strong>"{currentSearch}"</strong></>}
                {currentStatusId && <> — status filtrado</>}
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle size={12} /> {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} disabled={loading}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40">
            Cancelar
          </button>
          <button onClick={() => fetchAndExport('csv')} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-40">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} className="text-green-400" />}
            CSV
          </button>
          <button onClick={() => fetchAndExport('excel')} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-40">
            {loading ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            Excel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function VisualizacaoAcoes() {
  const [page, setPage]               = useState(1);
  const [limit]                       = useState(50);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]           = useState('');
  const [statusId, setStatusId]       = useState<number | undefined>(undefined);
  const [sorting, setSorting]         = useState<SortingState>([]);
  const [exportOpen, setExportOpen]   = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const sortBy  = sorting[0]?.id ?? 'acao_id';
  const sortDir = sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : 'desc';

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['acoes-vis', page, limit, search, statusId, sortBy, sortDir],
    queryFn: () =>
      api.get<PaginatedResponse<Acao>>('/actions', {
        params: { page, limit, search: search || undefined, status_id: statusId || undefined, sort_by: sortBy, sort_dir: sortDir },
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
    col.display({ id: 'pdf', header: 'PDF', size: 60,
      cell: (i) => (
        <div className="flex justify-center">
          <button title="Baixar PDF" onClick={() => downloadPdf(i.row.original.acao_id)}
            className="p-1.5 rounded text-red-400 hover:bg-red-900/30 transition-colors">
            <FileText size={15} />
          </button>
        </div>
      ),
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

  return (
    <>
    <div className="flex flex-col h-full overflow-hidden px-6 pt-6 pb-0 gap-3">

      {/* Título */}
      <h2 className="text-xl font-semibold text-white shrink-0">Visualização Ações PGD</h2>

      {/* Toolbar */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <Search size={14} className="ml-3 text-gray-500 shrink-0" />
            <input
              type="text" value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Busca rápida..."
              className="bg-transparent px-2 py-2 text-sm text-white placeholder-gray-600 focus:outline-none w-52"
            />
          </div>
          <select
            value={statusId ?? ''}
            onChange={(e) => { setStatusId(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
            className="bg-gray-900 border border-gray-800 text-sm text-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-600"
          >
            <option value="">Todos os status</option>
            {statusList?.map((s) => <option key={s.status_id} value={s.status_id}>{s.nome}</option>)}
          </select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            <Download size={14} /> Exportação
          </button>

          <button onClick={() => refetch()}
            className="p-2 text-gray-400 hover:text-white bg-gray-900 border border-gray-800 rounded-lg transition-colors" title="Atualizar">
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="flex-1 min-h-0 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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

          {/* Paginação — igual à grid principal (dentro do scroll) */}
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

    {/* Modal de exportação */}
    {exportOpen && (
      <ExportModal
        currentSearch={search}
        currentStatusId={statusId}
        onClose={() => setExportOpen(false)}
      />
    )}
    </>
  );
}

function PagBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="p-1.5 rounded hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  );
}
