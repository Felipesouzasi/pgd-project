import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, Check, X, Send, Loader2, AlertCircle,
} from 'lucide-react';
import api from '../lib/api';
import { SearchableSelect, SelectOption } from '../components/ui/SearchableSelect';

type TpAcao = 'DT' | 'R' | 'DINAC';

interface ConsultorInfo {
  unidade: string;
  gerente_gd_id: number | null;
  gerente_gd: string | null;
  gerente_regional_id: number | null;
  gerente_regional: string | null;
  unidade_gerente_id: number | null;
  unidade_gerente: string | null;
}

interface ProdutoRow  { _id: string; produto_id: number; produto_label: string; fornecedor_rtv: string; }
interface CulturaRow  { _id: string; cultura_id: number; cultura_label: string; }
interface ClienteRow  { _id: string; cliente_id: string; cliente_nome: string; }

function uid() { return Math.random().toString(36).slice(2); }

function fmtCurrency(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseCurrency(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
}

const TP_LABELS: Record<TpAcao, { consultor: string; gr: string; gu: string }> = {
  DT:    { consultor: 'Consultor',          gr: 'Gerente Regional', gu: 'Gerente Unidade'   },
  R:     { consultor: 'Supervisor',         gr: 'Gerente',          gu: 'Gerente Executivo' },
  DINAC: { consultor: 'Gerador de Demanda', gr: 'Gerente Regional', gu: 'Gerente Unidade'   },
};

// ── Primitives ────────────────────────────────────────────────────────────────

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p className="text-xs font-semibold text-white/65 uppercase tracking-wider mb-2">
      {children}{required && <span className="text-rose-400 ml-1">*</span>}
    </p>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-rose-400 mt-1.5 flex items-center gap-1"><AlertCircle size={11} />{msg}</p>;
}

function ReadonlyInput({ value }: { value: string }) {
  return (
    <div className="w-full px-3 py-2.5 rounded-xl border border-white/5 bg-white/3 text-sm text-white/30 min-h-[42px]">
      {value || '—'}
    </div>
  );
}

function Input({
  value, onChange, placeholder, error, type = 'text', disabled, noSpinner, size = 'md',
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  error?: boolean; type?: string; disabled?: boolean; noSpinner?: boolean; size?: 'sm' | 'md';
}) {
  const py = size === 'sm' ? 'py-1.5' : 'py-2.5';
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={[
        `w-full px-3 ${py} rounded-xl border bg-white/5 text-sm text-white`,
        'placeholder-white/20 outline-none transition-all disabled:opacity-30 disabled:cursor-not-allowed',
        noSpinner ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : '',
        error
          ? 'border-rose-500/60 ring-1 ring-rose-500/20'
          : 'border-white/10 hover:border-white/20 focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20',
      ].join(' ')}
    />
  );
}

function Textarea({ value, onChange, placeholder, rows = 3, error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; error?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={[
        'w-full px-3 py-2.5 rounded-xl border bg-white/5 text-sm text-white',
        'placeholder-white/20 outline-none transition-all resize-none',
        error
          ? 'border-rose-500/60 ring-1 ring-rose-500/20'
          : 'border-white/10 hover:border-white/20 focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20',
      ].join(' ')}
    />
  );
}

function CurrencyInput({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className={[
      'relative flex items-center rounded-xl border bg-white/5 transition-all',
      disabled ? 'opacity-30' : 'border-white/10 hover:border-white/20 focus-within:border-green-500/60 focus-within:ring-1 focus-within:ring-green-500/20',
    ].join(' ')}>
      <span className="pl-3 text-sm text-white/30 select-none">R$</span>
      <input
        type="text"
        value={disabled ? '' : value}
        onChange={(e) => onChange(fmtCurrency(e.target.value))}
        disabled={disabled}
        placeholder="0,00"
        className="flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder-white/20 outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-0.5 h-4 bg-green-500 rounded-full flex-shrink-0" />
        <span className="text-xs font-bold text-white/65 uppercase tracking-[0.2em]">
          {children}
        </span>
      </div>
      <div className="h-px bg-white/8" />
    </div>
  );
}

function Checkbox({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer group flex-shrink-0">
      <div
        onClick={() => onChange(!checked)}
        className={[
          'w-4 h-4 rounded border-2 flex items-center justify-center transition-all flex-shrink-0',
          checked ? 'bg-green-500 border-green-500' : 'border-white/20 bg-white/5 group-hover:border-white/40',
        ].join(' ')}
      >
        {checked && <Check size={10} className="text-white" />}
      </div>
      <span className="text-xs text-white/55 group-hover:text-white/75 transition-colors whitespace-nowrap">{label}</span>
    </label>
  );
}

// ── Master-detail ─────────────────────────────────────────────────────────────

function MasterDetailTable<T extends { _id: string }>({
  title, rows, addLabel, editing, onAdd, onConfirm, onCancel, onRemove, columns, editForm, emptyText, error,
}: {
  title: string; rows: T[]; addLabel: string; editing: boolean;
  onAdd: () => void; onConfirm: () => void; onCancel: () => void; onRemove: (id: string) => void;
  columns: { key: keyof T; label: string; width?: string }[];
  editForm: React.ReactNode; emptyText: string; error?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          {title && <p className="text-sm font-semibold text-white/80">{title}</p>}
          {error && <p className="text-xs text-rose-400 mt-0.5 flex items-center gap-1"><AlertCircle size={11}/>{error}</p>}
        </div>
        <button type="button" onClick={onAdd} disabled={editing}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 disabled:opacity-30 text-white text-sm font-medium rounded-xl transition-all">
          <Plus size={14} /> {addLabel}
        </button>
      </div>

      <div className="rounded-xl border border-white/8 overflow-hidden">
        <div className="grid bg-white/4 border-b border-white/8 px-4 py-2.5"
          style={{ gridTemplateColumns: `${columns.map(c => c.width || '1fr').join(' ')} 60px` }}>
          {columns.map(c => (
            <span key={String(c.key)} className="text-xs font-semibold text-white/45 uppercase tracking-wider">{c.label}</span>
          ))}
          <span />
        </div>

        {rows.map((row) => (
          <div key={row._id} className="grid items-center px-4 py-3 border-b border-white/5 hover:bg-white/3 transition-colors"
            style={{ gridTemplateColumns: `${columns.map(c => c.width || '1fr').join(' ')} 60px` }}>
            {columns.map(c => (
              <span key={String(c.key)} className="text-sm text-white/70 truncate pr-4">{String(row[c.key] || '—')}</span>
            ))}
            <div className="flex justify-end">
              <button type="button" onClick={() => onRemove(row._id)}
                className="p-1.5 text-white/20 hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-all">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {editing && (
          <div className="px-4 py-3 border-b border-green-500/20 bg-green-500/5">
            <div className="flex items-start gap-3">
              <div className="flex-1">{editForm}</div>
              <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
                <button type="button" onClick={onConfirm}
                  className="p-2 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-lg transition-colors" title="Confirmar">
                  <Check size={15} />
                </button>
                <button type="button" onClick={onCancel}
                  className="p-2 bg-white/8 hover:bg-white/15 text-white/50 hover:text-white rounded-lg transition-colors" title="Cancelar">
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {rows.length === 0 && !editing && (
          <div className="px-4 py-8 text-center text-sm text-white/20">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NovaAcao() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [tpAcao, setTpAcao] = useState<TpAcao>('DT');
  const prevTpAcaoRef = useRef<TpAcao>('DT');
  const [consultorId, setConsultorId] = useState<number | null>(null);
  const [consultorInfo, setConsultorInfo] = useState<ConsultorInfo | null>(null);
  const [municipioId, setMunicipioId] = useState<number | null>(null);
  const [filialId, setFilialId] = useState<string | null>(null);
  const [dtmId, setDtmId] = useState<number | null>(null);
  const [tripeId, setTripeId] = useState<number | null>(null);
  const [dtAcao, setDtAcao] = useState('');
  const [atividadeId, setAtividadeId] = useState<number | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [publico, setPublico] = useState('');
  const [vlrAr, setVlrAr] = useState('');
  const [semVlrAr, setSemVlrAr] = useState(false);
  const [vlrForn, setVlrForn] = useState('');
  const [semVlrForn, setSemVlrForn] = useState(false);

  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [editingProduto, setEditingProduto] = useState(false);
  const [newProdutoId, setNewProdutoId] = useState<number | null>(null);
  const [newProdutoLabel, setNewProdutoLabel] = useState('');
  const [newProdutoForn, setNewProdutoForn] = useState('');
  const [newProdutoFornError, setNewProdutoFornError] = useState(false);

  const [culturas, setCulturas] = useState<CulturaRow[]>([]);
  const [editingCultura, setEditingCultura] = useState(false);
  const [newCulturaId, setNewCulturaId] = useState<number | null>(null);
  const [newCulturaLabel, setNewCulturaLabel] = useState('');

  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [editingCliente, setEditingCliente] = useState(false);
  const [newClienteId, setNewClienteId] = useState<string | null>(null);
  const [newClienteNome, setNewClienteNome] = useState('');
  const [clienteQuery, setClienteQuery] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  const labels    = TP_LABELS[tpAcao];
  const showFilial   = tpAcao === 'DT' || tpAcao === 'R';
  const showDtm      = tpAcao === 'DT';
  const showTripe    = tpAcao === 'R' || tpAcao === 'DINAC';
  const showClientes = tpAcao === 'DINAC';


  const { data: opts, isLoading: optsLoading } = useQuery({
    queryKey: ['form-options'],
    queryFn: () => api.get('/actions/form-options').then(r => r.data),
    staleTime: 5 * 60_000,
  });

  const { data: atividadesData } = useQuery({
    queryKey: ['atividades', tpAcao],
    queryFn: () => api.get(`/actions/atividades?tp_acao=${tpAcao}`).then(r => r.data),
    enabled: !!tpAcao,
  });

  const { data: clienteSearchResults } = useQuery({
    queryKey: ['clientes-search', clienteQuery],
    queryFn: () => api.get(`/actions/clientes?search=${encodeURIComponent(clienteQuery)}`).then(r => r.data),
    enabled: clienteQuery.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!consultorId) { setConsultorInfo(null); return; }
    api.get(`/actions/consultor-info/${consultorId}`)
      .then(r => setConsultorInfo(r.data))
      .catch(() => setConsultorInfo(null));
  }, [consultorId]);

  useEffect(() => {
    const prev = prevTpAcaoRef.current;
    prevTpAcaoRef.current = tpAcao;

    setAtividadeId(null);
    if (tpAcao !== 'DT')    setDtmId(null);
    if (tpAcao === 'DINAC') { setFilialId(null); }
    if (tpAcao !== 'R' && tpAcao !== 'DINAC') setTripeId(null);
    if (tpAcao !== 'DINAC') setClientes([]);

    if (tpAcao === 'DINAC' && prev !== 'DINAC') {
      setProdutos(p => p.filter(prod => prod.fornecedor_rtv.trim() !== ''));
    }
  }, [tpAcao]);

  const mutation = useMutation({
    mutationFn: (enviar: boolean) =>
      api.post('/actions', {
        tp_acao: tpAcao,
        consultor_id: consultorId,
        unidade: consultorInfo?.unidade ?? '',
        gerente_gd_id: consultorInfo?.gerente_gd_id,
        gerente_regional_id: consultorInfo?.gerente_regional_id,
        gerente_unidade_id: consultorInfo?.unidade_gerente_id ?? undefined,
        municipio_acao: municipioId,
        filial_id: filialId,
        dtm_id: dtmId,
        tripe_item_id: tripeId,
        dt_acao: dtAcao,
        atividade_id: atividadeId,
        atividade_justificativa: justificativa,
        vlr_previsto_ar: semVlrAr ? 0 : parseCurrency(vlrAr),
        sem_vlr_previsto_ar: semVlrAr,
        vlr_previsto_fornecedor: semVlrForn ? 0 : parseCurrency(vlrForn),
        sem_vlr_previsto_fornecedor: semVlrForn,
        publico_previsto: parseInt(publico, 10) || 0,
        produtos: produtos.map(p => ({ produto_id: p.produto_id, fornecedor_rtv: p.fornecedor_rtv || null })),
        culturas: culturas.map(c => ({ cultura_id: c.cultura_id })),
        clientes: clientes.map(c => ({ cliente_id: c.cliente_id, cliente_nome: c.cliente_nome })),
        enviar_analise: enviar,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions'] });
      navigate('/acoes');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSubmitError(typeof msg === 'string' ? msg : 'Erro ao salvar ação.');
    },
  });

  function validate(enviar: boolean) {
    const e: Record<string, string> = {};
    if (!consultorId)          e.consultor     = 'Selecione o consultor';
    if (!municipioId)          e.municipio     = 'Selecione o município';
    if (!dtAcao)               e.dtAcao        = 'Informe a data';
    if (!atividadeId)          e.atividade     = 'Selecione o tipo da ação';
    if (!justificativa.trim()) e.justificativa  = 'Campo obrigatório';
    if (enviar && produtos.length === 0) e.produtos  = 'Adicione ao menos 1 produto';
    if (enviar && culturas.length === 0) e.culturas  = 'Adicione ao menos 1 cultura';
    if (enviar && showClientes && clientes.length === 0) e.clientes = 'Adicione ao menos 1 cliente';
    return e;
  }

  function submit(enviar: boolean) {
    setSubmitError('');
    const e = validate(enviar);
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    mutation.mutate(enviar);
  }

  function toOpts<T extends Record<string, unknown>>(arr: T[], vk: string, lk: string): SelectOption[] {
    return (arr ?? []).map(r => ({ value: r[vk] as string | number, label: r[lk] as string }));
  }

  const consultorOpts = toOpts(opts?.consultores ?? [], 'consultor_id', 'label');
  const municipioOpts = toOpts(opts?.municipios  ?? [], 'value', 'label');
  const filialOpts    = toOpts(opts?.filiais     ?? [], 'value', 'label');
  const dtmOpts       = toOpts(opts?.dtms        ?? [], 'value', 'label');
  const tripeOpts     = toOpts(opts?.tripes       ?? [], 'value', 'label');
  const produtoOpts   = toOpts(opts?.produtos    ?? [], 'value', 'label');
  const culturaOpts   = toOpts(opts?.culturas    ?? [], 'value', 'label');
  const atividadeOpts = toOpts(atividadesData    ?? [], 'value', 'label');

  const clienteOpts: SelectOption[] = toOpts(clienteSearchResults ?? [], 'value', 'label');

  const saving = mutation.isPending;

  if (optsLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-white/30">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-sm">Carregando formulário...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Topbar */}
      <div className="flex-shrink-0 flex items-center justify-between px-8 py-4 border-b border-white/5">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/acoes')}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={15} /> Voltar
          </button>
          <div className="w-px h-4 bg-white/10" />
          <h1 className="text-sm font-semibold text-white">Nova Ação</h1>
        </div>
        <span className="text-xs text-white/25">
          {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      </div>

      {/* Body — footer fica dentro do scroll, no final do conteúdo */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-10 space-y-12">

          {submitError && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-sm text-rose-300">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" /> {submitError}
            </div>
          )}

          {/* ═══ IDENTIFICAÇÃO ════════════════════════════════════════════════ */}
          <div>
            <SectionTitle>Identificação</SectionTitle>
            <div className="space-y-8">
              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-6">
                  <Label required>Tipo</Label>
                  <div className="flex rounded-xl border border-white/10 bg-white/3 p-0.5 gap-0.5">
                    {(['DT', 'R', 'DINAC'] as TpAcao[]).map((v) => {
                      const l = v === 'DT' ? 'Distribuição' : v === 'R' ? 'Redistribuição' : 'DINAC';
                      return (
                        <button key={v} type="button" onClick={() => setTpAcao(v)}
                          className={[
                            'flex-1 py-2.5 text-sm font-medium rounded-lg transition-all',
                            tpAcao === v ? 'bg-green-600 text-white shadow-sm' : 'text-white/40 hover:text-white/70 hover:bg-white/5',
                          ].join(' ')}>
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-5">
                <div className="col-span-6">
                  <Label required>{labels.consultor}</Label>
                  <SearchableSelect
                    options={consultorOpts} value={consultorId}
                    onChange={v => setConsultorId(v as number | null)}
                    placeholder={`Selecione o ${labels.consultor.toLowerCase()}...`}
                    error={!!errors.consultor}
                  />
                  <FieldError msg={errors.consultor} />
                </div>
                <div className="col-span-3">
                  <Label>Unidade</Label>
                  <ReadonlyInput value={consultorInfo?.unidade ?? ''} />
                </div>
                {showTripe && (
                  <div className="col-span-3">
                    <Label>Tripé</Label>
                    <SearchableSelect options={tripeOpts} value={tripeId}
                      onChange={v => setTripeId(v as number | null)} placeholder="Selecione..." />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ GERENTES ═════════════════════════════════════════════════════ */}
          <div>
            <SectionTitle>Gerentes</SectionTitle>
            <div className="grid grid-cols-3 gap-5">
              <div>
                <Label>{labels.gr}</Label>
                <ReadonlyInput value={consultorInfo?.gerente_regional ?? ''} />
              </div>
              <div>
                <Label>{labels.gu}</Label>
                <ReadonlyInput value={consultorInfo?.unidade_gerente ?? ''} />
              </div>
            </div>
          </div>

          {/* ═══ INFORMAÇÕES DA AÇÃO ══════════════════════════════════════════ */}
          <div>
            <SectionTitle>Informações da Ação</SectionTitle>
            <div className="space-y-5">

              {showDtm ? (
                <>
                  {/* DT: linha 1 Município + Filial, linha 2 DTM + Data + Tipo */}
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <Label required>Município</Label>
                      <SearchableSelect options={municipioOpts} value={municipioId}
                        onChange={v => setMunicipioId(v as number | null)}
                        placeholder="Busque o município..." error={!!errors.municipio} />
                      <FieldError msg={errors.municipio} />
                    </div>
                    <div>
                      <Label>Filial</Label>
                      <SearchableSelect options={filialOpts} value={filialId}
                        onChange={v => setFilialId(v as string | null)} placeholder="Selecione a filial..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <Label>DTM</Label>
                      <SearchableSelect
                        options={[{ value: 0, label: '( SEM DTM NA REGIÃO )' }, ...dtmOpts]}
                        value={dtmId ?? 0}
                        onChange={v => setDtmId(v === 0 ? null : v as number)}
                        placeholder="Selecione..." />
                    </div>
                    <div>
                      <Label required>Data da Ação</Label>
                      <Input type="date" value={dtAcao} onChange={setDtAcao} error={!!errors.dtAcao} />
                      <FieldError msg={errors.dtAcao} />
                    </div>
                    <div>
                      <Label required>Tipo da Ação</Label>
                      <SearchableSelect options={atividadeOpts} value={atividadeId}
                        onChange={v => setAtividadeId(v as number | null)}
                        placeholder="Selecione a atividade..." error={!!errors.atividade} />
                      <FieldError msg={errors.atividade} />
                    </div>
                  </div>
                </>
              ) : showFilial ? (
                <>
                  {/* R: Município + Filial, depois Data + Tipo */}
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <Label required>Município</Label>
                      <SearchableSelect options={municipioOpts} value={municipioId}
                        onChange={v => setMunicipioId(v as number | null)}
                        placeholder="Busque o município..." error={!!errors.municipio} />
                      <FieldError msg={errors.municipio} />
                    </div>
                    <div>
                      <Label>Filial</Label>
                      <SearchableSelect options={filialOpts} value={filialId}
                        onChange={v => setFilialId(v as string | null)} placeholder="Selecione a filial..." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-5">
                    <div>
                      <Label required>Data da Ação</Label>
                      <Input type="date" value={dtAcao} onChange={setDtAcao} error={!!errors.dtAcao} />
                      <FieldError msg={errors.dtAcao} />
                    </div>
                    <div>
                      <Label required>Tipo da Ação</Label>
                      <SearchableSelect options={atividadeOpts} value={atividadeId}
                        onChange={v => setAtividadeId(v as number | null)}
                        placeholder="Selecione a atividade..." error={!!errors.atividade} />
                      <FieldError msg={errors.atividade} />
                    </div>
                  </div>
                </>
              ) : (
                /* DINAC: sem filial — tudo numa linha: 50% município / 20% data / 30% tipo */
                <div className="grid gap-5" style={{ gridTemplateColumns: '5fr 2fr 3fr' }}>
                  <div>
                    <Label required>Município</Label>
                    <SearchableSelect options={municipioOpts} value={municipioId}
                      onChange={v => setMunicipioId(v as number | null)}
                      placeholder="Busque o município..." error={!!errors.municipio} />
                    <FieldError msg={errors.municipio} />
                  </div>
                  <div>
                    <Label required>Data da Ação</Label>
                    <Input type="date" value={dtAcao} onChange={setDtAcao} error={!!errors.dtAcao} />
                    <FieldError msg={errors.dtAcao} />
                  </div>
                  <div>
                    <Label required>Tipo da Ação</Label>
                    <SearchableSelect options={atividadeOpts} value={atividadeId}
                      onChange={v => setAtividadeId(v as number | null)}
                      placeholder="Selecione a atividade..." error={!!errors.atividade} />
                    <FieldError msg={errors.atividade} />
                  </div>
                </div>
              )}

              <div>
                <Label required>Justificativa</Label>
                <Textarea
                  value={justificativa}
                  onChange={v => { setJustificativa(v); if (v.trim()) setErrors(e => { const n = {...e}; delete n.justificativa; return n; }); }}
                  placeholder="Descreva a justificativa da ação..."
                  rows={3}
                  error={!!errors.justificativa}
                />
                <FieldError msg={errors.justificativa} />
              </div>
            </div>
          </div>

          {/* ═══ INVESTIMENTO ═════════════════════════════════════════════════
               3 colunas full-width. Checkbox na mesma linha do campo de valor.
          ══════════════════════════════════════════════════════════════════════ */}
          <div>
            <SectionTitle>Investimento Previsto</SectionTitle>
            <div className="grid grid-cols-3 gap-5">
              {/* Valor AR — checkbox abaixo */}
              <div className="space-y-2.5">
                <div>
                  <Label>Valor AR</Label>
                  <CurrencyInput value={vlrAr} onChange={setVlrAr} disabled={semVlrAr} />
                </div>
                <Checkbox
                  checked={semVlrAr}
                  onChange={v => { setSemVlrAr(v); if (v) setVlrAr(''); }}
                  label="Sem investimento AR"
                />
              </div>

              {/* Valor Fornecedor — checkbox abaixo */}
              <div className="space-y-2.5">
                <div>
                  <Label>Valor Fornecedor</Label>
                  <CurrencyInput value={vlrForn} onChange={setVlrForn} disabled={semVlrForn} />
                </div>
                <Checkbox
                  checked={semVlrForn}
                  onChange={v => { setSemVlrForn(v); if (v) setVlrForn(''); }}
                  label="Sem investimento fornecedores"
                />
              </div>

              {/* Público Previsto */}
              <div>
                <Label required>Público Previsto</Label>
                <Input type="number" value={publico} onChange={setPublico} placeholder="0" noSpinner />
              </div>
            </div>
          </div>

          {/* ═══ PRODUTOS ═════════════════════════════════════════════════════ */}
          <div>
            <SectionTitle>Produtos</SectionTitle>
            <MasterDetailTable<ProdutoRow>
              title="Produtos a serem trabalhados"
              rows={produtos} addLabel="Adicionar produto" editing={editingProduto}
              onAdd={() => {
                setEditingProduto(true);
                setNewProdutoId(null); setNewProdutoLabel(''); setNewProdutoForn(''); setNewProdutoFornError(false);
              }}
              onConfirm={() => {
                if (!newProdutoId) return;
                if (tpAcao === 'DINAC' && !newProdutoForn.trim()) { setNewProdutoFornError(true); return; }
                setProdutos(p => [...p, { _id: uid(), produto_id: newProdutoId, produto_label: newProdutoLabel, fornecedor_rtv: newProdutoForn }]);
                setEditingProduto(false); setNewProdutoFornError(false);
                setErrors(e => { const n = {...e}; delete n.produtos; return n; });
              }}
              onCancel={() => { setEditingProduto(false); setNewProdutoFornError(false); }}
              onRemove={id => setProdutos(p => p.filter(r => r._id !== id))}
              columns={[
                { key: 'produto_label', label: 'Produto', width: tpAcao === 'DINAC' ? '2fr' : '1fr' },
                ...(tpAcao === 'DINAC' ? [{ key: 'fornecedor_rtv' as keyof ProdutoRow, label: 'Fornecedor RTV', width: '1fr' }] : []),
              ]}
              editForm={
                /* Ambos os campos com flex-1 para terem exatamente o mesmo tamanho */
                <div className="flex gap-3">
                  <div className="flex-1">
                    <SearchableSelect options={produtoOpts} value={newProdutoId}
                      onChange={v => {
                        const opt = produtoOpts.find(o => o.value === v);
                        setNewProdutoId(v as number | null);
                        setNewProdutoLabel(opt?.label ?? '');
                      }}
                      placeholder="Selecione o produto..." size="sm" inline />
                  </div>
                  {tpAcao === 'DINAC' && (
                    <div className="flex-1">
                      <Input
                        value={newProdutoForn}
                        onChange={v => { setNewProdutoForn(v); if (v.trim()) setNewProdutoFornError(false); }}
                        placeholder="Fornecedor RTV (obrigatório)"
                        error={newProdutoFornError}
                        size="sm"
                      />
                      {newProdutoFornError && <p className="text-xs text-rose-400 mt-1">Obrigatório para DINAC</p>}
                    </div>
                  )}
                </div>
              }
              emptyText="Nenhum produto adicionado. Clique em + Adicionar produto."
              error={errors.produtos}
            />
          </div>

          {/* ═══ CULTURAS ═════════════════════════════════════════════════════ */}
          <div>
            <SectionTitle>Culturas</SectionTitle>
            <MasterDetailTable<CulturaRow>
              title="Culturas a serem trabalhadas"
              rows={culturas} addLabel="Adicionar cultura" editing={editingCultura}
              onAdd={() => { setEditingCultura(true); setNewCulturaId(null); setNewCulturaLabel(''); }}
              onConfirm={() => {
                if (!newCulturaId) return;
                setCulturas(c => [...c, { _id: uid(), cultura_id: newCulturaId, cultura_label: newCulturaLabel }]);
                setEditingCultura(false);
                setErrors(e => { const n = {...e}; delete n.culturas; return n; });
              }}
              onCancel={() => setEditingCultura(false)}
              onRemove={id => setCulturas(c => c.filter(r => r._id !== id))}
              columns={[{ key: 'cultura_label', label: 'Cultura' }]}
              editForm={
                <SearchableSelect options={culturaOpts} value={newCulturaId}
                  onChange={v => {
                    const opt = culturaOpts.find(o => o.value === v);
                    setNewCulturaId(v as number | null);
                    setNewCulturaLabel(opt?.label ?? '');
                  }}
                  placeholder="Selecione a cultura..." size="sm" inline />
              }
              emptyText="Nenhuma cultura adicionada. Clique em + Adicionar cultura."
              error={errors.culturas}
            />
          </div>

          {/* ═══ CLIENTES (DINAC) ═════════════════════════════════════════════ */}
          {showClientes && (
            <div>
              <SectionTitle>Clientes</SectionTitle>
              <MasterDetailTable<ClienteRow>
                title="Clientes redistribuição"
                rows={clientes} addLabel="Adicionar cliente" editing={editingCliente}
                onAdd={() => { setEditingCliente(true); setNewClienteId(null); setNewClienteNome(''); setClienteQuery(''); }}
                onConfirm={() => {
                  if (!newClienteNome.trim()) return;
                  setClientes(c => [...c, { _id: uid(), cliente_id: newClienteId ?? newClienteNome, cliente_nome: newClienteNome }]);
                  setEditingCliente(false); setClienteQuery('');
                  setErrors(e => { const n = {...e}; delete n.clientes; return n; });
                }}
                onCancel={() => { setEditingCliente(false); setClienteQuery(''); }}
                onRemove={id => setClientes(c => c.filter(r => r._id !== id))}
                columns={[{ key: 'cliente_nome', label: 'Cliente' }]}
                editForm={
                  <SearchableSelect
                    options={clienteOpts} value={newClienteId}
                    onChange={v => {
                      const opt = clienteOpts.find(o => String(o.value) === String(v));
                      setNewClienteId(v as string | null);
                      setNewClienteNome(opt?.label ?? '');
                    }}
                    placeholder="Digite o nome do cliente..."
                    size="sm"
                    inline
                    onSearchChange={q => { setClienteQuery(q); if (!q) { setNewClienteId(null); setNewClienteNome(''); } }}
                  />
                }
                emptyText="Nenhum cliente adicionado."
                error={errors.clientes}
              />
            </div>
          )}

        </div>

        {/* ── Footer dentro do scroll — aparece ao final do formulário ───────── */}
        <div className="border-t border-white/5 mt-8 px-8 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-center gap-3">
            <button type="button" onClick={() => submit(true)} disabled={saving}
              className="flex items-center gap-2.5 px-7 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-green-900/30">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Enviar para Análise
            </button>
            <button type="button" onClick={() => submit(false)} disabled={saving}
              className="flex items-center gap-2.5 px-6 py-2.5 bg-white/8 hover:bg-white/12 disabled:opacity-40 text-white/70 hover:text-white text-sm font-medium rounded-xl transition-all">
              Salvar Rascunho
            </button>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button type="button" onClick={() => navigate('/acoes')} disabled={saving}
              className="flex items-center gap-2.5 px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-400/40 text-rose-400/70 hover:text-rose-300 text-sm font-medium rounded-xl transition-all">
              <X size={14} />
              Cancelar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
