import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, ScanSearch, Loader2,
  AlertCircle, X, Check, FileText, Calendar, ShieldAlert,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import StatusBadge from '../components/acoes/StatusBadge';
import { cleanStatus, fmtDate } from '../lib/export';

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AcaoDetalhe {
  acao_id: number;
  tp_acao: 'DT' | 'R' | 'DINAC' | null;
  dt_acao: string | null;
  dt_cadastro: string | null;
  consultor: string | null;
  consultor_id: number | null;
  unidade: string | null;
  gerente_regional: string | null;
  gerente_unidade: string | null;
  filial: string | null;
  municipio: string | null;
  dtm: string | null;
  tripe: string | null;
  atividade: string | null;
  atividade_justificativa: string | null;
  publico_previsto: number | null;
  publico_realizado: number | null;
  vlr_previsto_ar: number | null;
  vlr_previsto_fornecedor: number | null;
  vlr_investido_ar: number | null;
  vlr_investido_fornecedor: number | null;
  obs: string | null;
  status_id: number;
  status_nome: string;
  produtos_detalhe: ProdutoDetalhe[];
  culturas_detalhe: CulturaDetalhe[];
  clientes: ClienteDetalhe[];
}

interface ProdutoDetalhe   { produto_id: number; produto: string; fornecedor_rtv: string | null; planejada: string | null; trabalhado: string | null; }
interface CulturaDetalhe   { cultura_id: number; cultura_nome: string; planejada: string | null; trabalhado: string | null; }
interface ClienteDetalhe   { cliente_id: string; cliente_nome: string | null; }
interface HistoricoItem    { acao_status_id: number; dt_status: string; status_id: number; status_nome: string; usuario: string; detalhe: string | null; justificativa: string | null; }
interface StatusListItem   { status_id: number; nome: string; }

// ── Ações por status (sem Cancelar — só ADM via botão S) ─────────────────────

type BtnVariant = 'success' | 'danger' | 'warning';

type PgdVisao = 'GD' | 'COM' | 'GER' | 'ADM';

interface StatusAction {
  label: string;
  statusId: number;
  variant: BtnVariant;
  requiresJustificativa?: boolean;
  /** Se definido, apenas essas visões podem executar esta ação (ADM sempre bypassa) */
  visaoPermitida?: PgdVisao[];
}

const STATUS_ACTIONS: Record<number, StatusAction[]> = {
  // Status 1 — EM APROVAÇÃO: quem age é o GER
  1:  [
    { label: 'Aprovar',  statusId: 4,  variant: 'success', visaoPermitida: ['GER', 'ADM'] },
    { label: 'Reprovar', statusId: 8,  variant: 'danger',  requiresJustificativa: true, visaoPermitida: ['GER', 'ADM'] },
  ],
  // Status 3 — legado/intermediário (fluxo atual: 1 → 4 direto ao aprovar)
  3:  [
    { label: 'Confirmar Planejamento', statusId: 4,  variant: 'success', visaoPermitida: ['GD', 'COM'] },
    { label: 'Reprovar',               statusId: 15, variant: 'danger',  requiresJustificativa: true, visaoPermitida: ['GD', 'COM'] },
  ],
  // Status 4 — PLANEJADA: GD/COM comprovam
  4:  [{ label: 'Enviar para Comprovação', statusId: 5, variant: 'success', visaoPermitida: ['GD', 'COM'] }],
  // Status 5 — REALIZADA EM ANÁLISE: GER analisa
  5:  [
    { label: 'Analisar',             statusId: 19, variant: 'success', visaoPermitida: ['GER', 'ADM'] },
    { label: 'Reprovar Comprovação', statusId: 18, variant: 'danger',  requiresJustificativa: true, visaoPermitida: ['GER', 'ADM'] },
  ],
  // Status 8/13/15/18 — reprovadas: GD/COM resubmetem
  8:  [{ label: 'Resubmeter para Validação', statusId: 1,  variant: 'warning', visaoPermitida: ['GD', 'COM'] }],
  13: [{ label: 'Reenviar Comprovação',       statusId: 5,  variant: 'warning', visaoPermitida: ['GD', 'COM'] }],
  15: [{ label: 'Reenviar para Aprovação',    statusId: 3,  variant: 'warning', visaoPermitida: ['GD', 'COM'] }],
  18: [{ label: 'Reenviar Comprovação',       statusId: 5,  variant: 'warning', visaoPermitida: ['GD', 'COM'] }],
  // Status 19 — REALIZADA APROVADA (GU): popup Tamara (3 opções) + Reprovar
  19: [
    { label: 'Reprovar Análise', statusId: 13, variant: 'danger', requiresJustificativa: true, visaoPermitida: ['GER', 'ADM'] },
  ],
  // Status 14 — APROVADA COM PAGAMENTO: só ADM (Bruno)
  14: [
    { label: 'Encaminhar para Financeiro', statusId: 20, variant: 'success' },
    { label: 'Devolver',                   statusId: 11, variant: 'warning', requiresJustificativa: true },
  ],
  // Status 20: "INVESTIMENTO APROVADO" (Laura/Financeiro) — só ADM + laura.silva
  20: [{ label: 'Confirmar Pagamento', statusId: 22, variant: 'success' }],
  22: [{ label: 'Finalizar',           statusId: 23, variant: 'success' }],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function tpLabel(tp: string | null) {
  if (tp === 'DT')    return 'Distribuição';
  if (tp === 'R')     return 'Redistribuição';
  if (tp === 'DINAC') return 'DINAC';
  return tp ?? '—';
}
function HistoricoIcon({ statusNome }: { statusNome: string }) {
  const s = cleanStatus(statusNome).toUpperCase();
  if (s.includes('FINALIZADA'))  return <CheckCircle2 size={16} className="text-green-500" />;
  if (s.includes('REPROVADA') || s.includes('RECUSADA') || s.includes('CANCELADA'))
    return <XCircle size={16} className="text-red-500" />;
  if (s.includes('ANÁLISE') || s.includes('ANALISE'))
    return <ScanSearch size={16} className="text-purple-400" />;
  if (s.includes('AGUARDANDO') || s.includes('APROVAÇÃO'))
    return <Loader2 size={16} className="text-yellow-400" />;
  return <Clock size={16} className="text-gray-400" />;
}

// ── Componentes base ──────────────────────────────────────────────────────────

function Field({ label, value, span = 1 }: { label: string; value: React.ReactNode; span?: number }) {
  return (
    <div className={span > 1 ? `col-span-${span}` : ''}>
      <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-white/85">{value || <span className="text-white/25">—</span>}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-0.5 h-4 bg-green-500 rounded-full" />
        <span className="text-xs font-bold text-white/50 uppercase tracking-[0.2em]">{title}</span>
        <div className="flex-1 h-px bg-white/6" />
      </div>
      {children}
    </div>
  );
}

function ActionBtn({ action, onClick, loading }: { action: StatusAction; onClick: () => void; loading?: boolean }) {
  const variants: Record<BtnVariant, string> = {
    success: 'bg-emerald-600/80 hover:bg-emerald-500 text-white',
    danger:  'bg-rose-600/80 hover:bg-rose-500 text-white',
    warning: 'bg-amber-600/80 hover:bg-amber-500 text-white',
  };
  return (
    <button type="button" onClick={onClick} disabled={loading}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50 ${variants[action.variant]}`}>
      {loading && <Loader2 size={14} className="animate-spin" />}
      {action.label}
    </button>
  );
}

// ── Modal de justificativa (fluxo normal) ─────────────────────────────────────

function JustificativaModal({
  action, onConfirm, onCancel, loading, error,
}: {
  action: StatusAction; onConfirm: (j: string) => void;
  onCancel: () => void; loading: boolean; error?: string;
}) {
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState('');

  function handleConfirm() {
    if (!text.trim()) { setLocalError('Justificativa obrigatória'); return; }
    onConfirm(text.trim());
  }

  const shownError = error || localError;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#1a1d27] border border-white/10 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">{action.label}</h3>
          <button onClick={onCancel} className="text-white/30 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <p className="text-sm text-white/50 mb-4">Informe a justificativa para esta ação.</p>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setLocalError(''); }}
          rows={4}
          placeholder="Digite a justificativa..."
          className={[
            'w-full px-3 py-2.5 rounded-xl border bg-white/5 text-sm text-white',
            'placeholder-white/20 outline-none transition-all resize-none',
            shownError ? 'border-rose-500/60 ring-1 ring-rose-500/20' : 'border-white/10 focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20',
          ].join(' ')}
        />
        {shownError && (
          <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1">
            <AlertCircle size={11} />{shownError}
          </p>
        )}
        <div className="flex gap-3 mt-4 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-all">
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-all">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal ADM — forçar status ─────────────────────────────────────────────────

function AdminStatusModal({
  acaoId, historico, statusList, onClose, onSuccess,
}: {
  acaoId: number;
  historico: HistoricoItem[];
  statusList: StatusListItem[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedStatus, setSelectedStatus] = useState('');
  const [detalhe, setDetalhe]               = useState('');
  const [error, setError]                   = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/actions/${acaoId}/status`, {
        status_id: Number(selectedStatus),
        justificativa: detalhe.trim() || undefined,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Erro ao alterar status.');
    },
  });

  function handleSubmit() {
    if (!selectedStatus) { setError('Selecione um status'); return; }
    setError('');
    mutation.mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-[#1a1d27] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <ShieldAlert size={18} className="text-rose-400" />
            <div>
              <h3 className="font-semibold text-white text-sm">Controle de Status — Ação #{acaoId}</h3>
              <p className="text-xs text-white/40">{new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X size={18} /></button>
        </div>

        {/* Histórico */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Histórico de Status</p>
          <div className="rounded-xl border border-white/8 overflow-hidden mb-5">
            <div className="grid grid-cols-4 bg-white/4 border-b border-white/8 px-4 py-2.5">
              {['Dt. Status', 'Status', 'Detalhe', 'Usuário'].map((h) => (
                <span key={h} className="text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {historico.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-white/30">Nenhum histórico.</p>
            )}
            {historico.map((h) => (
              <div key={h.acao_status_id} className="grid grid-cols-4 px-4 py-2.5 border-b border-white/5 hover:bg-white/3">
                <span className="text-xs text-white/50 font-mono">
                  {new Date(h.dt_status).toLocaleString('pt-BR')}
                </span>
                <span className="text-xs text-white/80">{cleanStatus(h.status_nome)}</span>
                <span className="text-xs text-white/50 truncate">{h.detalhe || '—'}</span>
                <span className="text-xs text-green-400">{h.usuario}</span>
              </div>
            ))}
          </div>

          {/* Formulário de status */}
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Atribuir Novo Status</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Status <span className="text-rose-400">*</span></label>
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setError(''); }}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white outline-none focus:border-green-500/60 transition-all"
              >
                <option value="">Selecione</option>
                {statusList.map((s) => (
                  <option key={s.status_id} value={s.status_id}>{s.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1.5 block">Detalhe / Justificativa</label>
              <textarea
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                rows={3}
                placeholder="Opcional — aparecerá no histórico e na reabertura do processo"
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white placeholder-white/20 outline-none focus:border-green-500/60 transition-all resize-none"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-400 mt-3 flex items-center gap-1">
              <AlertCircle size={11} />{error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/8">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-all">
            Sair
          </button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50 transition-all">
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Incluir
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────


// ── Popup de aprovação Tamara (status 19 → 3 destinos possíveis) ──────────────

interface TamaraOpcao {
  id: string;
  label: string;
  descricao: string;
  targetStatusId: number;
  apenasAdmin: boolean;   // "APROVADA COM PAGAMENTO" só ADM pode encaminhar (Bruno)
  colorClass: string;
}

const TAMARA_OPCOES: TamaraOpcao[] = [
  {
    id: 'pagamento_realizar',
    label: 'Pagamento à Realizar',
    descricao: 'Encaminha para aprovação de pagamento (Bruno/Financeiro). Só disponível para ADM.',
    targetStatusId: 14,
    apenasAdmin: true,
    colorClass: 'border-red-500/50 bg-red-900/20 hover:bg-red-900/30',
  },
  {
    id: 'pagamento_realizado',
    label: 'Pagamento Já Realizado',
    descricao: 'O pagamento já foi efetuado. Finaliza como "Está Pago".',
    targetStatusId: 22,
    apenasAdmin: false,
    colorClass: 'border-emerald-500/50 bg-emerald-900/20 hover:bg-emerald-900/30',
  },
  {
    id: 'sem_pagamento',
    label: 'Sem Pagamento',
    descricao: 'Ação sem investimento financeiro. Finaliza como "Sem Investimento".',
    targetStatusId: 23,
    apenasAdmin: false,
    colorClass: 'border-green-500/50 bg-blue-900/20 hover:bg-green-900/30',
  },
];

function TamaraAprovacaoPopup({
  acaoId,
  onClose,
  onSuccess,
}: {
  acaoId: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { user } = useAuthStore();
  const isAdmin = user?.pgd_acao_visao === 'ADM' || user?.priv_admin === 'S';
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (targetStatusId: number) =>
      api.patch(`/actions/${acaoId}/status`, { status_id: targetStatusId }),
    onSuccess,
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Erro ao alterar status.');
    },
  });

  const opcaoSelecionada = TAMARA_OPCOES.find(o => o.id === selected);

  function handleConfirmar() {
    if (!opcaoSelecionada) { setError('Selecione uma opção.'); return; }
    if (opcaoSelecionada.apenasAdmin && !isAdmin) {
      setError('Apenas ADM pode selecionar esta opção.');
      return;
    }
    mutation.mutate(opcaoSelecionada.targetStatusId);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#1a1d27] border border-white/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <p className="font-semibold text-white text-sm">Definir próximo passo</p>
            <p className="text-xs text-white/40 mt-0.5">Ação #{acaoId} — Realizada Aprovada (GU)</p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors text-lg">✕</button>
        </div>

        {/* Opções */}
        <div className="px-6 py-5 space-y-3">
          <p className="text-xs text-white/40 mb-4">
            Selecione como esta ação deve prosseguir:
          </p>
          {TAMARA_OPCOES.map(opcao => {
            const bloqueada = opcao.apenasAdmin && !isAdmin;
            return (
              <button
                key={opcao.id}
                disabled={bloqueada}
                onClick={() => { setSelected(opcao.id); setError(''); }}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all
                  ${bloqueada ? 'opacity-30 cursor-not-allowed border-white/10 bg-white/3' : opcao.colorClass}
                  ${selected === opcao.id ? 'ring-2 ring-white/30' : ''}
                `}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                    ${selected === opcao.id ? 'border-white bg-white' : 'border-white/40'}`}>
                    {selected === opcao.id && <div className="w-1.5 h-1.5 rounded-full bg-gray-900" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {opcao.label}
                      {opcao.apenasAdmin && (
                        <span className="ml-2 text-[10px] font-normal text-red-400 border border-red-500/30 px-1.5 py-0.5 rounded">
                          Só ADM
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-white/45 mt-0.5">{opcao.descricao}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/8 flex items-center justify-between">
          <div>
            {error && (
              <p className="text-xs text-rose-400 flex items-center gap-1">
                <AlertCircle size={11} /> {error}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-all">
              Cancelar
            </button>
            <button onClick={handleConfirmar} disabled={!selected || mutation.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-700 hover:bg-emerald-600 text-white transition-all disabled:opacity-40">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DetalheAcao() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const acaoId = Number(id);
  const isAdmin = user?.pgd_acao_visao === 'ADM' ||
    user?.priv_admin === 'S';

  const [activeTab, setActiveTab] = useState<'detalhes' | 'historico'>(
    searchParams.get('tab') === 'historico' ? 'historico' : 'detalhes',
  );
  const [pendingAction, setPendingAction] = useState<StatusAction | null>(null);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showTamaraPopup, setShowTamaraPopup] = useState(false);
  const [mutationError, setMutationError] = useState('');

  // Identidade do usuário logado para restrições de fluxo
  const isLaura  = user?.login === 'laura.silva';
  const canActStatus14 = isAdmin;              // "APROVADA COM PAGAMENTO" → só ADM (Bruno)
  const canActStatus20 = isAdmin || isLaura;   // "INVESTIMENTO APROVADO"  → ADM + Laura

  const { data: acao, isLoading } = useQuery<AcaoDetalhe>({
    queryKey: ['acao', acaoId],
    queryFn: () => api.get(`/actions/${acaoId}`).then((r) => r.data),
    enabled: !!acaoId,
  });

  const { data: historico = [] } = useQuery<HistoricoItem[]>({
    queryKey: ['acao-history', acaoId],
    queryFn: () => api.get(`/actions/${acaoId}/history`).then((r) => r.data),
    enabled: !!acaoId,
  });

  const { data: statusList = [] } = useQuery<StatusListItem[]>({
    queryKey: ['status-list'],
    queryFn: () => api.get('/actions/status-list').then((r) => r.data),
    staleTime: Infinity,
    enabled: isAdmin,
  });

  const mutation = useMutation({
    mutationFn: ({ statusId, justificativa }: { statusId: number; justificativa?: string }) =>
      api.patch(`/actions/${acaoId}/status`, { status_id: statusId, justificativa }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acao', acaoId] });
      queryClient.invalidateQueries({ queryKey: ['acao-history', acaoId] });
      queryClient.invalidateQueries({ queryKey: ['acoes'] });
      setPendingAction(null);
      setMutationError('');
      navigate('/acoes');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setMutationError(typeof msg === 'string' ? msg : 'Erro ao alterar status.');
    },
  });

  function handleAction(action: StatusAction) {
    setMutationError('');
    if (action.requiresJustificativa) {
      setPendingAction(action);
    } else {
      mutation.mutate({ statusId: action.statusId });
    }
  }

  function handleConfirmJustificativa(justificativa: string) {
    if (!pendingAction) return;
    mutation.mutate({ statusId: pendingAction.statusId, justificativa });
  }

  function handleAdminSuccess() {
    queryClient.invalidateQueries({ queryKey: ['acao', acaoId] });
    queryClient.invalidateQueries({ queryKey: ['acao-history', acaoId] });
    queryClient.invalidateQueries({ queryKey: ['acoes'] });
  }

  // Botões disponíveis = interseção TRANSITIONS[status] ∩ user.permissoes (ou tudo para ADM)
  const visao = user?.pgd_acao_visao as PgdVisao | null | undefined;

  const availableActions: StatusAction[] = acao
    ? (STATUS_ACTIONS[acao.status_id] ?? []).filter((a) => {
        // ADM bypassa permissoes mas ainda segue restrições de fluxo específicas abaixo
        if (!isAdmin && !user?.permissoes.includes(a.statusId)) return false;
        // Filtro por visão: GER não pode ver ações de GD/COM e vice-versa
        if (!isAdmin && a.visaoPermitida && visao && !a.visaoPermitida.includes(visao)) return false;
        // Status 14 (APROVADA COM PAGAMENTO → financeiro): só ADM pode encaminhar
        if (acao.status_id === 14 && !canActStatus14) return false;
        // Status 20 (INVESTIMENTO APROVADO → confirmar): só ADM ou laura.silva
        if (acao.status_id === 20 && !canActStatus20) return false;
        return true;
      })
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-green-400" />
      </div>
    );
  }

  if (!acao) {
    return (
      <div className="p-8 text-center text-white/40">
        <AlertCircle size={40} className="mx-auto mb-3 opacity-40" />
        <p>Ação não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/8 flex-shrink-0">
        <button onClick={() => navigate('/acoes')}
          className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-all">
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          <span className="font-mono text-white/40 text-sm">#{acao.acao_id}</span>
          <span className="text-white/20">·</span>
          <span className="text-sm font-medium text-white/70">{tpLabel(acao.tp_acao)}</span>
          <span className="text-white/20">·</span>
          <span className="text-sm text-white/50">{acao.consultor ?? '—'}</span>
          {acao.dt_acao && (
            <>
              <span className="text-white/20">·</span>
              <span className="flex items-center gap-1 text-xs text-white/35">
                <Calendar size={12} />{fmtDate(acao.dt_acao)}
              </span>
            </>
          )}
        </div>
        <StatusBadge statusId={acao.status_id} statusNome={cleanStatus(acao.status_nome)} />
        {/* Botão S — somente ADM */}
        {isAdmin && (
          <button
            onClick={() => setShowAdminModal(true)}
            title="Controle de Status (ADM)"
            className="ml-2 px-3 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-500 text-white text-sm font-bold transition-all"
          >
            S
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4 border-b border-white/8 flex-shrink-0">
        {(['detalhes', 'historico'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-all',
              activeTab === tab
                ? 'text-green-400 border-b-2 border-green-400 bg-green-400/5'
                : 'text-white/40 hover:text-white/70',
            ].join(' ')}>
            {tab === 'detalhes' ? 'Detalhes' : 'Histórico'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-5">
        {activeTab === 'detalhes' && (
          <div className="max-w-4xl">
            <Section title="Identificação">
              <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                <Field label="Consultor"    value={acao.consultor} />
                <Field label="Unidade"      value={acao.unidade} />
                <Field label="Tripé"        value={acao.tripe} />
                <Field label="Filial"       value={acao.filial} />
                <Field label="Município"    value={acao.municipio} />
                <Field label="DTM"          value={acao.dtm} />
                <Field label="Data Ação"    value={fmtDate(acao.dt_acao)} />
                <Field label="Dt. Cadastro" value={fmtDate(acao.dt_cadastro)} />
              </div>
            </Section>

            <Section title="Gerentes">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <Field label="Gerente Regional" value={acao.gerente_regional} />
                <Field label="Gerente Unidade"  value={acao.gerente_unidade} />
              </div>
            </Section>

            <Section title="Atividade">
              <div className="grid grid-cols-3 gap-x-8 gap-y-4">
                <Field label="Atividade"         value={acao.atividade} />
                <Field label="Público Previsto"  value={acao.publico_previsto?.toString()} />
                <Field label="Público Realizado" value={acao.publico_realizado?.toString()} />
                {acao.atividade_justificativa && (
                  <div className="col-span-3">
                    <Field label="Justificativa da Atividade" value={acao.atividade_justificativa} />
                  </div>
                )}
                {acao.obs && (
                  <div className="col-span-3"><Field label="Observações" value={acao.obs} /></div>
                )}
              </div>
            </Section>

            <Section title="Financeiro">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="p-4 rounded-xl bg-white/3 border border-white/6">
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-3">AdubosReal</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Previsto AR"  value={`R$ ${fmt(acao.vlr_previsto_ar)}`} />
                    <Field label="Investido AR" value={`R$ ${fmt(acao.vlr_investido_ar)}`} />
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white/3 border border-white/6">
                  <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-3">Fornecedor</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Previsto Forn."  value={`R$ ${fmt(acao.vlr_previsto_fornecedor)}`} />
                    <Field label="Investido Forn." value={`R$ ${fmt(acao.vlr_investido_fornecedor)}`} />
                  </div>
                </div>
              </div>
            </Section>

            {acao.produtos_detalhe.length > 0 && (
              <Section title="Produtos">
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="grid grid-cols-3 bg-white/4 border-b border-white/8 px-4 py-2.5">
                    {['Produto', 'Fornecedor RTV', 'Planejada / Trabalhado'].map((h) => (
                      <span key={h} className="text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {acao.produtos_detalhe.map((p) => (
                    <div key={p.produto_id} className="grid grid-cols-3 px-4 py-3 border-b border-white/5 hover:bg-white/3">
                      <span className="text-sm text-white/80">{p.produto}</span>
                      <span className="text-sm text-white/50">{p.fornecedor_rtv || '—'}</span>
                      <span className="text-sm text-white/50">
                        {p.planejada === 'S' ? '✓ Plan.' : '—'} / {p.trabalhado === 'S' ? '✓ Trab.' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {acao.culturas_detalhe.length > 0 && (
              <Section title="Culturas">
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="grid grid-cols-2 bg-white/4 border-b border-white/8 px-4 py-2.5">
                    {['Cultura', 'Planejada / Trabalhado'].map((h) => (
                      <span key={h} className="text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {acao.culturas_detalhe.map((c) => (
                    <div key={c.cultura_id} className="grid grid-cols-2 px-4 py-3 border-b border-white/5 hover:bg-white/3">
                      <span className="text-sm text-white/80">{c.cultura_nome}</span>
                      <span className="text-sm text-white/50">
                        {c.planejada === 'S' ? '✓ Plan.' : '—'} / {c.trabalhado === 'S' ? '✓ Trab.' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {acao.clientes.length > 0 && (
              <Section title="Clientes / Produtores">
                <div className="rounded-xl border border-white/8 overflow-hidden">
                  <div className="grid grid-cols-2 bg-white/4 border-b border-white/8 px-4 py-2.5">
                    {['Código', 'Nome'].map((h) => (
                      <span key={h} className="text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</span>
                    ))}
                  </div>
                  {acao.clientes.map((c) => (
                    <div key={c.cliente_id} className="grid grid-cols-2 px-4 py-3 border-b border-white/5 hover:bg-white/3">
                      <span className="text-sm font-mono text-white/50">{c.cliente_id}</span>
                      <span className="text-sm text-white/80">{c.cliente_nome || '—'}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}

        {activeTab === 'historico' && (
          <div className="max-w-2xl">
            {historico.length === 0 ? (
              <p className="text-center text-white/30 text-sm py-12">Nenhum histórico encontrado.</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-white/8" />
                <div className="space-y-1">
                  {historico.map((h, idx) => (
                    <div key={h.acao_status_id} className="relative flex gap-4 pl-10 pb-5">
                      <div className={[
                        'absolute left-2.5 top-1 w-3 h-3 rounded-full border-2',
                        idx === 0 ? 'bg-green-500 border-green-400' : 'bg-[#1a1d27] border-white/20',
                      ].join(' ')} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <HistoricoIcon statusNome={h.status_nome} />
                          <span className="text-sm font-semibold text-white/85">{cleanStatus(h.status_nome)}</span>
                          <span className="ml-auto text-xs text-white/30 flex-shrink-0">
                            {new Date(h.dt_status).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-white/40 mb-1">por <span className="text-white/60">{h.usuario}</span></p>
                        {h.detalhe && <p className="text-xs text-white/50">{h.detalhe}</p>}
                        {h.justificativa && (
                          <div className="mt-1.5 px-3 py-2 rounded-lg bg-rose-500/8 border border-rose-500/15">
                            <p className="text-xs text-rose-300/80">{h.justificativa}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer de ações */}
      {(availableActions.length > 0 || (acao?.status_id === 19 && isAdmin)) && (
        <div className="flex-shrink-0 border-t border-white/8 bg-[#13151f] px-6 py-4">
          {mutationError && !pendingAction && (
            <p className="text-xs text-rose-400 flex items-center gap-1 mb-3">
              <AlertCircle size={12} />{mutationError}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 mr-2">
              <FileText size={14} className="text-white/25" />
              <span className="text-xs text-white/30">Ações disponíveis:</span>
            </div>

            {/* Botão especial de aprovação para status 19 (Tamara/ADM → popup de 3 opções) */}
            {acao?.status_id === 19 && isAdmin && (
              <button
                onClick={() => setShowTamaraPopup(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold
                           bg-emerald-700 hover:bg-emerald-600 text-white transition-all">
                <Check size={14} /> Aprovar / Definir próximo passo
              </button>
            )}

            {availableActions.map((a) => (
              <ActionBtn key={a.statusId} action={a} onClick={() => handleAction(a)} loading={mutation.isPending} />
            ))}
          </div>
        </div>
      )}

      {/* Popup Tamara — 3 opções de aprovação (status 19) */}
      {showTamaraPopup && acao && (
        <TamaraAprovacaoPopup
          acaoId={acaoId}
          onClose={() => setShowTamaraPopup(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['acao', acaoId] });
            queryClient.invalidateQueries({ queryKey: ['acao-history', acaoId] });
            queryClient.invalidateQueries({ queryKey: ['acoes'] });
            setShowTamaraPopup(false);
          }}
        />
      )}

      {/* Modal de justificativa */}
      {pendingAction && (
        <JustificativaModal
          action={pendingAction}
          onConfirm={handleConfirmJustificativa}
          onCancel={() => { setPendingAction(null); setMutationError(''); }}
          loading={mutation.isPending}
          error={mutationError}
        />
      )}

      {/* Modal ADM */}
      {showAdminModal && (
        <AdminStatusModal
          acaoId={acaoId}
          historico={historico}
          statusList={statusList}
          onClose={() => setShowAdminModal(false)}
          onSuccess={handleAdminSuccess}
        />
      )}
    </div>
  );
}
