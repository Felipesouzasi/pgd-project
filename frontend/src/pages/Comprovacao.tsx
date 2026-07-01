import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Send, Plus, Trash2, Loader2,
  CheckCircle2, AlertCircle, Upload, Check, X,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { SearchableSelect, SelectOption } from '../components/ui/SearchableSelect';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComprovacaoData {
  acao: {
    acao_id: number; tp_acao: string; consultor: string; filial: string;
    dt_acao: string; atividade: string;
    vlr_previsto_ar: number | null; vlr_previsto_fornecedor: number | null;
    vlr_investido_ar: number | null; vlr_investido_fornecedor: number | null;
    sem_vlr_previsto_ar: string; sem_vlr_previsto_fornecedor: string;
    sem_vlr_investido_ar: string; sem_vlr_investido_fornecedor: string;
    publico_previsto: number | null; publico_realizado: number | null;
    obs: string | null; status_id: number; status_nome: string;
  };
  produtos: { produto_id: number; nome: string; fornecedor: string; planejada: string; trabalhado: string }[];
  culturas: { cultura_id: number; nome: string; planejada: string; trabalhado: string }[];
  clientes: { cliente_id: string; nome: string; planejada: string; trabalhado: string }[];
  despesas: { pgd_despesa_id: number; dt_despesa: string; tp_despesa: string; tp_despesa_id: number; vlr_despesa: number; docto_fiscal: string | null; comprovante_pagto: string | null }[];
}

interface ProdutoRow {
  produto_id: number;
  nome: string;
  fornecedor: string;
  isNovo: boolean;       // true = adicionado na comprovação (planejada = N)
  trabalhado: 'S' | 'N';
}
interface CulturaRow {
  cultura_id: number;
  nome: string;
  isNovo: boolean;
  trabalhado: 'S' | 'N';
}
interface ClienteRow {
  cliente_id: string;
  nome: string;
  isNovo: boolean;
  trabalhado: 'S' | 'N';
}

interface TipoDespesa { value: number; label: string }
interface FormOption  { value: number; label: string; fornecedor_rtv?: string }

interface DespesaForm {
  dt_despesa: string; tp_despesa_id: string; vlr_despesa: string;
  docto_fiscal: string; comprovante_pagto: string;
}
const emptyDespesa: DespesaForm = {
  dt_despesa: '', tp_despesa_id: '', vlr_despesa: '', docto_fiscal: '', comprovante_pagto: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}
function fmtDate(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('pt-BR'); } catch { return s; }
}
function fmtCurrency(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseCurrency(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0;
}
function currencyFromNumber(v: number | null): string {
  if (v == null) return '';
  return fmtCurrency(String(Math.round(v * 100)));
}
// planejada/trabalhado são char(1) no banco ('S' | 'N' | ' '); normalizamos aqui.
function isNovoFlag(planejada: string): boolean {
  return String(planejada ?? '').trim().toUpperCase() === 'N';
}
// Trabalhado pré-preenchido como 'S'; só respeita 'N' quando explícito no banco.
function trabalhadoInit(trabalhado: string): 'S' | 'N' {
  return String(trabalhado ?? '').trim().toUpperCase() === 'N' ? 'N' : 'S';
}

// ─── Primitives (padrão Nova Ação) ─────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-white/65 uppercase tracking-wider mb-2">{children}</p>;
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-0.5 h-4 bg-green-500 rounded-full flex-shrink-0" />
          <span className="text-xs font-bold text-white/65 uppercase tracking-[0.2em]">{children}</span>
        </div>
        {action}
      </div>
      <div className="h-px bg-white/8" />
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder, disabled, noSpinner }: {
  value: string | number; onChange?: (v: string) => void; type?: string;
  placeholder?: string; disabled?: boolean; noSpinner?: boolean;
}) {
  return (
    <input type={type} value={value ?? ''} disabled={disabled}
      onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
      className={[
        'w-full px-3 py-2.5 rounded-xl border bg-white/5 text-sm text-white',
        'placeholder-white/20 outline-none transition-all disabled:opacity-30 disabled:cursor-not-allowed',
        noSpinner ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : '',
        'border-white/10 hover:border-white/20 focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20',
      ].join(' ')} />
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
      <input type="text" value={disabled ? '' : value}
        onChange={e => onChange(fmtCurrency(e.target.value))} disabled={disabled} placeholder="0,00"
        className="flex-1 bg-transparent px-2 py-2.5 text-sm text-white placeholder-white/20 outline-none disabled:cursor-not-allowed" />
    </div>
  );
}

function Checkbox({ checked, onChange, label, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 group flex-shrink-0 ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
      <div
        onClick={() => !disabled && onChange(!checked)}
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

// ─── Célula de status ──────────────────────────────────────────────────────────

function PlanejadoTag({ isNovo, tipo }: { isNovo: boolean; tipo: 'produto' | 'cultura' | 'cliente' }) {
  if (isNovo) {
    const l = tipo === 'produto' ? 'Novo produto' : tipo === 'cultura' ? 'Nova cultura' : 'Novo cliente';
    return <span className="text-sm text-emerald-400/90 font-medium">{l}</span>;
  }
  const l = tipo === 'cultura' ? 'Planejada' : 'Planejado';
  return <span className="text-sm text-white/80">{l}</span>;
}

function TrabalhadoCell({ isNovo, value, onChange, canEdit }: {
  isNovo: boolean; value: 'S' | 'N'; onChange: (v: 'S' | 'N') => void; canEdit: boolean;
}) {
  // Itens adicionados na comprovação são sempre "Trabalhado" (readonly)
  if (isNovo) return <span className="text-sm text-white/80">Trabalhado</span>;
  // Itens planejados: select Trabalhado (pré-preenchido) / Não trabalhado
  if (!canEdit) {
    return <span className={`text-sm ${value === 'S' ? 'text-white/80' : 'text-white/35'}`}>
      {value === 'S' ? 'Trabalhado' : 'Não trabalhado'}
    </span>;
  }
  return (
    <select value={value} onChange={e => onChange(e.target.value as 'S' | 'N')}
      className="w-full max-w-[180px] px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-sm text-white outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20 transition-all">
      <option value="S">Trabalhado</option>
      <option value="N">Não trabalhado</option>
    </select>
  );
}

// ─── Tabela de itens ─────────────────────────────────────────────────────────

function ItemsTable({ widths, headers, empty, rows, adding, addRow }: {
  widths: string[]; headers: string[]; empty: string; rows: React.ReactNode;
  adding: boolean; addRow: React.ReactNode;
}) {
  const template = [...widths, '60px'].join(' ');
  const isEmpty = !rows || (Array.isArray(rows) && rows.length === 0);
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <div className="grid bg-white/4 border-b border-white/8 px-4 py-2.5 gap-4"
        style={{ gridTemplateColumns: template }}>
        {headers.map((h, i) => (
          <span key={i} className="text-xs font-semibold text-white/45 uppercase tracking-wider">{h}</span>
        ))}
        <span />
      </div>
      {rows}
      {adding && addRow}
      {isEmpty && !adding && (
        <div className="px-4 py-8 text-center text-sm text-white/20">{empty}</div>
      )}
    </div>
  );
}

function AddBtn({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 px-4 py-2 bg-emerald-600/80 hover:bg-emerald-500/80 disabled:opacity-30 text-white text-sm font-medium rounded-xl transition-all">
      <Plus size={14} /> {label}
    </button>
  );
}

function AddRow({ children, onConfirm, canConfirm, onCancel }: {
  children: React.ReactNode; onConfirm: () => void; canConfirm: boolean; onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3 border-b border-green-500/20 bg-green-500/5 flex items-start gap-3">
      <div className="flex-1">{children}</div>
      <div className="flex items-center gap-1.5 flex-shrink-0 pt-0.5">
        <button type="button" onClick={onConfirm} disabled={!canConfirm}
          className="p-2 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg transition-colors" title="Confirmar">
          <Check size={15} />
        </button>
        <button type="button" onClick={onCancel}
          className="p-2 bg-white/8 hover:bg-white/15 text-white/50 hover:text-white rounded-lg transition-colors" title="Cancelar">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Comprovacao() {
  const { id } = useParams<{ id: string }>();
  const acaoId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [vlrAR, setVlrAR]           = useState('');
  const [semVlrAR, setSemVlrAR]     = useState(false);
  const [vlrForn, setVlrForn]       = useState('');
  const [semVlrForn, setSemVlrForn] = useState(false);
  const [pubReal, setPubReal]       = useState('');
  const [obs, setObs]               = useState('');

  const [produtos, setProdutos]     = useState<ProdutoRow[]>([]);
  const [culturas, setCulturas]     = useState<CulturaRow[]>([]);
  const [clientes, setClientes]     = useState<ClienteRow[]>([]);

  const [addingProduto, setAddingProduto] = useState(false);
  const [addingCultura, setAddingCultura] = useState(false);
  const [addingCliente, setAddingCliente] = useState(false);
  const [newProdutoId, setNewProdutoId]   = useState<number | null>(null);
  const [newProdutoForn, setNewProdutoForn] = useState('');
  const [newCulturaId, setNewCulturaId]   = useState<number | null>(null);
  const [newClienteId, setNewClienteId]   = useState<string | null>(null);
  const [newClienteNome, setNewClienteNome] = useState('');
  const [clienteQuery, setClienteQuery]   = useState('');

  const [despesaForm, setDespesaForm]   = useState<DespesaForm>(emptyDespesa);
  const [addingDespesa, setAddingDespesa] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [initialized, setInitialized]   = useState(false);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles]   = useState<Record<string, string>>({});

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<ComprovacaoData>({
    queryKey: ['comprovacao', acaoId],
    queryFn: () => api.get<ComprovacaoData>(`/actions/${acaoId}/comprovacao`).then(r => r.data),
  });

  const { data: tiposDespesa = [] } = useQuery<TipoDespesa[]>({
    queryKey: ['tipos-despesa'],
    queryFn: () => api.get('/actions/tipos-despesa').then(r => r.data),
    staleTime: Infinity,
  });

  const { data: formOptions } = useQuery<{ produtos: FormOption[]; culturas: FormOption[] }>({
    queryKey: ['form-options'],
    queryFn: () => api.get('/actions/form-options').then(r => r.data),
    staleTime: Infinity,
  });

  const { data: clienteSearchResults } = useQuery({
    queryKey: ['clientes-search', clienteQuery],
    queryFn: () => api.get(`/actions/clientes?search=${encodeURIComponent(clienteQuery)}`).then(r => r.data),
    enabled: clienteQuery.length >= 2,
    staleTime: 30_000,
  });

  // Inicializa form ao carregar dados (uma vez)
  useEffect(() => {
    if (!data || initialized) return;
    setVlrAR(currencyFromNumber(data.acao.vlr_investido_ar));
    setSemVlrAR(data.acao.sem_vlr_investido_ar === 'S');
    setVlrForn(currencyFromNumber(data.acao.vlr_investido_fornecedor));
    setSemVlrForn(data.acao.sem_vlr_investido_fornecedor === 'S');
    setPubReal(data.acao.publico_realizado != null ? String(data.acao.publico_realizado) : '');
    setObs(data.acao.obs ?? '');
    setProdutos(data.produtos.map(p => ({
      produto_id: p.produto_id,
      nome: p.nome,
      fornecedor: p.fornecedor,
      isNovo: isNovoFlag(p.planejada),
      trabalhado: trabalhadoInit(p.trabalhado),
    })));
    setCulturas(data.culturas.map(c => ({
      cultura_id: c.cultura_id,
      nome: c.nome,
      isNovo: isNovoFlag(c.planejada),
      trabalhado: trabalhadoInit(c.trabalhado),
    })));
    setClientes((data.clientes ?? []).map(c => ({
      cliente_id: String(c.cliente_id),
      nome: c.nome,
      isNovo: isNovoFlag(c.planejada),
      trabalhado: trabalhadoInit(c.trabalhado),
    })));
    setInitialized(true);
  }, [data, initialized]);

  // ─── Mutations ────────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const saveMut = useMutation({
    mutationFn: (enviar: boolean) =>
      api.put(`/actions/${acaoId}/comprovacao`, {
        vlr_investido_ar:             semVlrAR   ? null : (vlrAR   ? parseCurrency(vlrAR)   : undefined),
        sem_vlr_investido_ar:         semVlrAR   ? 'S' : 'N',
        vlr_investido_fornecedor:     semVlrForn ? null : (vlrForn ? parseCurrency(vlrForn) : undefined),
        sem_vlr_investido_fornecedor: semVlrForn ? 'S' : 'N',
        publico_realizado:            pubReal    ? Number(pubReal) : undefined,
        obs:                          obs        || undefined,
        produtos: produtos.map(p => ({ produto_id: p.produto_id, trabalhado: p.trabalhado, is_novo: p.isNovo, fornecedor_rtv: p.fornecedor })),
        culturas: culturas.map(c => ({ cultura_id: c.cultura_id, trabalhado: c.trabalhado, is_novo: c.isNovo })),
        clientes: clientes.map(c => ({ cliente_id: c.cliente_id, cliente_nome: c.nome, trabalhado: c.trabalhado, is_novo: c.isNovo })),
        enviar,
      }),
    onSuccess: (_d, enviar) => {
      qc.invalidateQueries({ queryKey: ['comprovacao', acaoId] });
      if (enviar) {
        showToast('Comprovação enviada com sucesso!');
        setTimeout(() => navigate(`/acoes/${acaoId}`), 1500);
      } else {
        showToast('Rascunho salvo.');
      }
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showToast(typeof msg === 'string' ? msg : 'Erro ao salvar.', false);
    },
  });

  const addDespesaMut = useMutation({
    mutationFn: () => api.post(`/actions/${acaoId}/despesas`, {
      dt_despesa:    despesaForm.dt_despesa,
      tp_despesa_id: Number(despesaForm.tp_despesa_id),
      vlr_despesa:   parseCurrency(despesaForm.vlr_despesa),
      docto_fiscal:  despesaForm.docto_fiscal || undefined,
      comprovante_pagto: despesaForm.comprovante_pagto || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comprovacao', acaoId] });
      setDespesaForm(emptyDespesa);
      setAddingDespesa(false);
      showToast('Despesa adicionada.');
    },
    onError: () => showToast('Erro ao adicionar despesa.', false),
  });

  const delDespesaMut = useMutation({
    mutationFn: (despesaId: number) => api.delete(`/actions/${acaoId}/despesas/${despesaId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['comprovacao', acaoId] }); showToast('Despesa removida.'); },
  });

  // ─── Upload ───────────────────────────────────────────────────────────────

  async function handleUpload(campo: string, file: File) {
    setUploadingField(campo);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api.post(`/actions/${acaoId}/upload?campo=${campo}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadedFiles(prev => ({ ...prev, [campo]: r.data.filename }));
      showToast('Arquivo enviado.');
    } catch {
      showToast('Erro ao enviar arquivo.', false);
    } finally {
      setUploadingField(null);
    }
  }

  // ─── Produtos helpers ─────────────────────────────────────────────────────

  function setTrabalhado(produto_id: number, val: 'S' | 'N') {
    setProdutos(prev => prev.map(p => p.produto_id === produto_id ? { ...p, trabalhado: val } : p));
  }
  function deleteProduto(produto_id: number) {
    setProdutos(prev => prev.filter(p => p.produto_id !== produto_id));
  }
  function confirmAddProduto() {
    if (!newProdutoId) return;
    const opt = formOptions?.produtos.find(o => String(o.value) === String(newProdutoId));
    if (!opt) return;
    if (produtos.some(p => p.produto_id === opt.value)) {
      showToast('Produto já está na lista.', false); return;
    }
    if (isDinac && !newProdutoForn.trim()) { showToast('Informe o Fornecedor RTV (obrigatório em DINAC).', false); return; }
    setProdutos(prev => [...prev, {
      produto_id: opt.value,
      nome: opt.label,
      fornecedor: isDinac ? newProdutoForn.trim() : (opt.fornecedor_rtv ?? ''),
      isNovo: true,
      trabalhado: 'S',
    }]);
    setNewProdutoId(null); setNewProdutoForn(''); setAddingProduto(false);
  }

  // ─── Culturas helpers ─────────────────────────────────────────────────────

  function setTrabalhoCultura(cultura_id: number, val: 'S' | 'N') {
    setCulturas(prev => prev.map(c => c.cultura_id === cultura_id ? { ...c, trabalhado: val } : c));
  }
  function deleteCultura(cultura_id: number) {
    setCulturas(prev => prev.filter(c => c.cultura_id !== cultura_id));
  }
  function confirmAddCultura() {
    if (!newCulturaId) return;
    const opt = formOptions?.culturas.find(o => String(o.value) === String(newCulturaId));
    if (!opt) return;
    if (culturas.some(c => c.cultura_id === opt.value)) {
      showToast('Cultura já está na lista.', false); return;
    }
    setCulturas(prev => [...prev, {
      cultura_id: opt.value, nome: opt.label, isNovo: true, trabalhado: 'S',
    }]);
    setNewCulturaId(null); setAddingCultura(false);
  }

  // ─── Clientes helpers ─────────────────────────────────────────────────────

  function setTrabalhoCliente(cliente_id: string, val: 'S' | 'N') {
    setClientes(prev => prev.map(c => c.cliente_id === cliente_id ? { ...c, trabalhado: val } : c));
  }
  function deleteCliente(cliente_id: string) {
    setClientes(prev => prev.filter(c => c.cliente_id !== cliente_id));
  }
  function confirmAddCliente() {
    if (!newClienteNome.trim()) return;
    const cid = newClienteId ?? newClienteNome;
    if (clientes.some(c => c.cliente_id === String(cid))) {
      showToast('Cliente já está na lista.', false); return;
    }
    setClientes(prev => [...prev, {
      cliente_id: String(cid), nome: newClienteNome, isNovo: true, trabalhado: 'S',
    }]);
    setNewClienteId(null); setNewClienteNome(''); setClienteQuery(''); setAddingCliente(false);
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  const isAdmin = user?.pgd_acao_visao === 'ADM' || user?.priv_admin === 'S';
  const visao   = user?.pgd_acao_visao;
  const canEdit = visao === 'GD' || visao === 'COM' || isAdmin;
  const canSend = canEdit && data?.acao.status_id === 4;
  const isDinac = data?.acao.tp_acao === 'DINAC';

  // ─── Options ────────────────────────────────────────────────────────────────

  const produtoOpts: SelectOption[] = (formOptions?.produtos ?? [])
    .filter(o => !produtos.some(p => String(p.produto_id) === String(o.value)))
    .map(o => ({ value: o.value, label: o.label }));
  const culturaOpts: SelectOption[] = (formOptions?.culturas ?? [])
    .filter(o => !culturas.some(c => String(c.cultura_id) === String(o.value)))
    .map(o => ({ value: o.value, label: o.label }));
  const clienteOpts: SelectOption[] = (clienteSearchResults ?? [])
    .map((r: { value: string | number; label: string }) => ({ value: r.value, label: r.label }));
  const tipoDespesaOpts: SelectOption[] = tiposDespesa.map(t => ({ value: t.value, label: t.label }));

  // ─── Validação ───────────────────────────────────────────────────────────

  function validate(): string[] {
    const erros: string[] = [];
    if (!semVlrAR && !vlrAR.trim())
      erros.push('Informe o Valor Investido AR ou marque "Sem valor".');
    if (!semVlrForn && !vlrForn.trim())
      erros.push('Informe o Valor Investido Fornecedor ou marque "Sem valor".');
    if (!pubReal.trim() || Number(pubReal) <= 0)
      erros.push('Informe o Público Realizado (deve ser maior que 0).');
    if (produtos.length > 0 && !produtos.some(p => p.trabalhado === 'S'))
      erros.push('Pelo menos um produto deve estar marcado como "Trabalhado".');
    if (culturas.length > 0 && !culturas.some(c => c.trabalhado === 'S'))
      erros.push('Pelo menos uma cultura deve estar marcada como "Trabalhada".');
    if ((data?.despesas ?? []).length === 0)
      erros.push('Adicione ao menos uma Despesa/Comprovante antes de enviar.');
    return erros;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-white/30">
        <Loader2 size={22} className="animate-spin" />
        <span className="text-sm">Carregando comprovação...</span>
      </div>
    );
  }
  if (!data) return <div className="text-red-400 p-6">Ação não encontrada.</div>;

  const { acao, despesas } = data;
  const totalDespesas = despesas.reduce((sum, d) => sum + Number(d.vlr_despesa), 0);

  const prodWidths = isDinac ? ['2fr', '1fr', '1.4fr', '1.4fr'] : ['2fr', '1fr', '1.4fr'];
  const prodHeaders = isDinac
    ? ['Produto', 'Planejado?', 'Trabalhado?', 'Fornecedor RTV']
    : ['Produto', 'Planejado?', 'Trabalhado?'];
  const prodTemplate = [...prodWidths, '60px'].join(' ');

  return (
    <div className="flex flex-col h-full bg-gray-950">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex-shrink-0 px-8 py-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/acoes/${acaoId}`)}
            className="flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
            <ArrowLeft size={15} /> Voltar
          </button>
          <div className="w-px h-4 bg-white/10" />
          <div>
            <h1 className="text-sm font-semibold text-white">Comprovação da Ação #{acaoId}</h1>
            <p className="text-xs text-white/40">{acao.consultor} · {acao.filial} · {fmtDate(acao.dt_acao)}</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-8 py-10 space-y-12">

          {validationErrors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4">
              <p className="text-sm font-semibold text-rose-400 mb-2 flex items-center gap-2">
                <AlertCircle size={15} /> Corrija os itens abaixo antes de enviar:
              </p>
              <ul className="space-y-1">
                {validationErrors.map((e, i) => (
                  <li key={i} className="text-sm text-rose-300 flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">•</span> {e}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ═══ RESUMO ═══ */}
          <div>
            <SectionTitle>Resumo da Ação</SectionTitle>
            <div className="grid grid-cols-4 gap-5">
              <ReadonlyField label="Atividade"          value={acao.atividade} />
              <ReadonlyField label="Público Previsto"   value={acao.publico_previsto?.toLocaleString('pt-BR') ?? '—'} />
              <ReadonlyField label="Vlr Previsto AR"    value={`R$ ${fmt(acao.vlr_previsto_ar)}`} />
              <ReadonlyField label="Vlr Previsto Forn." value={`R$ ${fmt(acao.vlr_previsto_fornecedor)}`} />
            </div>
          </div>

          {/* ═══ VALORES REALIZADOS ═══ */}
          <div>
            <SectionTitle>Valores Realizados</SectionTitle>
            <div className="grid grid-cols-3 gap-5">
              <div className="space-y-2.5">
                <div>
                  <Label>Valor Investido AR</Label>
                  <CurrencyInput value={vlrAR} onChange={setVlrAR} disabled={semVlrAR || !canEdit} />
                </div>
                <Checkbox checked={semVlrAR} disabled={!canEdit}
                  onChange={v => { setSemVlrAR(v); if (v) setVlrAR(''); }} label="Sem investimento AR" />
              </div>
              <div className="space-y-2.5">
                <div>
                  <Label>Valor Investido Fornecedor</Label>
                  <CurrencyInput value={vlrForn} onChange={setVlrForn} disabled={semVlrForn || !canEdit} />
                </div>
                <Checkbox checked={semVlrForn} disabled={!canEdit}
                  onChange={v => { setSemVlrForn(v); if (v) setVlrForn(''); }} label="Sem investimento fornecedor" />
              </div>
              <div>
                <Label>Público Realizado</Label>
                <Input value={pubReal} onChange={setPubReal} type="number" placeholder="0" noSpinner disabled={!canEdit} />
              </div>
            </div>

            <div className="mt-5">
              <Label>Observações</Label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} disabled={!canEdit} rows={3}
                className="w-full px-3 py-2.5 rounded-xl border border-white/10 bg-white/5 text-sm text-white
                           placeholder-white/20 outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20
                           transition-all disabled:opacity-30 resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-5 mt-5">
              <FileUploadField label="Lista de Presença"
                uploadedFilename={uploadedFiles['lista_presenca']}
                uploading={uploadingField === 'lista_presenca'} disabled={!canEdit}
                onFile={f => handleUpload('lista_presenca', f)} />
              <FileUploadField label="Relatório de Desenvolvimento de Lavoura"
                uploadedFilename={uploadedFiles['rel_desenv_lavoura']}
                uploading={uploadingField === 'rel_desenv_lavoura'} disabled={!canEdit}
                onFile={f => handleUpload('rel_desenv_lavoura', f)} />
            </div>
          </div>

          {/* ═══ PRODUTOS ═══ */}
          <div>
            <SectionTitle action={canEdit && !addingProduto
              ? <AddBtn onClick={() => { setAddingProduto(true); setNewProdutoId(null); setNewProdutoForn(''); }} label="Novo Produto" />
              : undefined}>
              Produtos
            </SectionTitle>
            <ItemsTable
              widths={prodWidths} headers={prodHeaders}
              empty="Nenhum produto adicionado."
              adding={addingProduto}
              addRow={
                <AddRow onConfirm={confirmAddProduto}
                  canConfirm={!!newProdutoId && (!isDinac || !!newProdutoForn.trim())}
                  onCancel={() => { setAddingProduto(false); setNewProdutoId(null); setNewProdutoForn(''); }}>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <SearchableSelect options={produtoOpts} value={newProdutoId}
                        onChange={v => setNewProdutoId(v as number | null)}
                        placeholder="Selecione o produto..." size="sm" inline />
                    </div>
                    {isDinac && (
                      <div className="flex-1">
                        <Input value={newProdutoForn} onChange={setNewProdutoForn}
                          placeholder="Fornecedor RTV (obrigatório)" />
                      </div>
                    )}
                  </div>
                </AddRow>
              }
              rows={produtos.map(p => (
                <div key={p.produto_id}
                  className="grid px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center gap-4"
                  style={{ gridTemplateColumns: prodTemplate }}>
                  <span className="text-sm text-white/80 truncate">{p.nome}</span>
                  <PlanejadoTag isNovo={p.isNovo} tipo="produto" />
                  <TrabalhadoCell isNovo={p.isNovo} value={p.trabalhado} canEdit={canEdit}
                    onChange={v => setTrabalhado(p.produto_id, v)} />
                  {isDinac && <span className="text-sm text-white/45 truncate">{p.fornecedor || '—'}</span>}
                  <div className="flex justify-end">
                    {canEdit && p.isNovo && (
                      <button type="button" onClick={() => deleteProduto(p.produto_id)}
                        className="p-1.5 text-white/20 hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-all" title="Remover">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            />
          </div>

          {/* ═══ CULTURAS ═══ */}
          <div>
            <SectionTitle action={canEdit && !addingCultura
              ? <AddBtn onClick={() => { setAddingCultura(true); setNewCulturaId(null); }} label="Nova Cultura" />
              : undefined}>
              Culturas
            </SectionTitle>
            <ItemsTable
              widths={['2fr', '1fr', '1.4fr']} headers={['Cultura', 'Planejada?', 'Trabalhada?']}
              empty="Nenhuma cultura adicionada."
              adding={addingCultura}
              addRow={
                <AddRow onConfirm={confirmAddCultura} canConfirm={!!newCulturaId}
                  onCancel={() => { setAddingCultura(false); setNewCulturaId(null); }}>
                  <SearchableSelect options={culturaOpts} value={newCulturaId}
                    onChange={v => setNewCulturaId(v as number | null)}
                    placeholder="Selecione a cultura..." size="sm" inline />
                </AddRow>
              }
              rows={culturas.map(c => (
                <div key={c.cultura_id}
                  className="grid px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center gap-4"
                  style={{ gridTemplateColumns: '2fr 1fr 1.4fr 60px' }}>
                  <span className="text-sm text-white/80 truncate">{c.nome}</span>
                  <PlanejadoTag isNovo={c.isNovo} tipo="cultura" />
                  <TrabalhadoCell isNovo={c.isNovo} value={c.trabalhado} canEdit={canEdit}
                    onChange={v => setTrabalhoCultura(c.cultura_id, v)} />
                  <div className="flex justify-end">
                    {canEdit && c.isNovo && (
                      <button type="button" onClick={() => deleteCultura(c.cultura_id)}
                        className="p-1.5 text-white/20 hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-all" title="Remover">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            />
          </div>

          {/* ═══ CLIENTES (somente DINAC) ═══ */}
          {isDinac && (
            <div>
              <SectionTitle action={canEdit && !addingCliente
                ? <AddBtn onClick={() => { setAddingCliente(true); setNewClienteId(null); setNewClienteNome(''); setClienteQuery(''); }} label="Novo Cliente" />
                : undefined}>
                Clientes
              </SectionTitle>
              <ItemsTable
                widths={['2fr', '1fr', '1.4fr']} headers={['Cliente', 'Planejado?', 'Trabalhado?']}
                empty="Nenhum cliente adicionado."
                adding={addingCliente}
                addRow={
                  <AddRow onConfirm={confirmAddCliente} canConfirm={!!newClienteNome.trim()}
                    onCancel={() => { setAddingCliente(false); setNewClienteId(null); setNewClienteNome(''); setClienteQuery(''); }}>
                    <SearchableSelect options={clienteOpts} value={newClienteId}
                      onChange={v => {
                        const opt = clienteOpts.find(o => String(o.value) === String(v));
                        setNewClienteId(v as string | null);
                        setNewClienteNome(opt?.label ?? '');
                      }}
                      placeholder="Digite o nome do cliente..." size="sm" inline
                      onSearchChange={q => { setClienteQuery(q); if (!q) { setNewClienteId(null); setNewClienteNome(''); } }} />
                  </AddRow>
                }
                rows={clientes.map(c => (
                  <div key={c.cliente_id}
                    className="grid px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center gap-4"
                    style={{ gridTemplateColumns: '2fr 1fr 1.4fr 60px' }}>
                    <span className="text-sm text-white/80 truncate">{c.nome}</span>
                    <PlanejadoTag isNovo={c.isNovo} tipo="cliente" />
                    <TrabalhadoCell isNovo={c.isNovo} value={c.trabalhado} canEdit={canEdit}
                      onChange={v => setTrabalhoCliente(c.cliente_id, v)} />
                    <div className="flex justify-end">
                      {canEdit && c.isNovo && (
                        <button type="button" onClick={() => deleteCliente(c.cliente_id)}
                          className="p-1.5 text-white/20 hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-all" title="Remover">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              />
            </div>
          )}

          {/* ═══ DESPESAS ═══ */}
          <div>
            <SectionTitle>Despesas / Comprovantes · Total R$ {fmt(totalDespesas)}</SectionTitle>
            <div className="rounded-xl border border-white/8 overflow-hidden mb-4">
              <div className="grid grid-cols-[120px_1fr_120px_1fr_1fr_50px] bg-white/4 border-b border-white/8 px-4 py-2.5 gap-4">
                {['Data', 'Tipo', 'Valor (R$)', 'Doc. Fiscal', 'Comprov. Pagto', ''].map((h, i) => (
                  <span key={i} className="text-xs font-semibold text-white/45 uppercase tracking-wider">{h}</span>
                ))}
              </div>
              {despesas.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-white/20">Nenhuma despesa cadastrada.</div>
              )}
              {despesas.map(d => (
                <div key={d.pgd_despesa_id} className="grid grid-cols-[120px_1fr_120px_1fr_1fr_50px] px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center gap-4">
                  <span className="text-xs text-white/60 font-mono">{fmtDate(d.dt_despesa)}</span>
                  <span className="text-sm text-white/80 truncate">{d.tp_despesa}</span>
                  <span className="text-sm text-white/80 font-mono">{fmt(d.vlr_despesa)}</span>
                  <span className="text-xs text-white/50 truncate">{d.docto_fiscal || '—'}</span>
                  <span className="text-xs text-white/50 truncate">{d.comprovante_pagto || '—'}</span>
                  <div className="flex justify-end">
                    {canEdit && (
                      <button onClick={() => delDespesaMut.mutate(d.pgd_despesa_id)} disabled={delDespesaMut.isPending}
                        className="p-1.5 text-white/20 hover:text-rose-400 rounded-lg hover:bg-rose-400/10 transition-all">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canEdit && !addingDespesa && (
              <AddBtn onClick={() => setAddingDespesa(true)} label="Adicionar Despesa" />
            )}

            {addingDespesa && (
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-5 mt-2">
                <div className="grid grid-cols-3 gap-5 mb-5">
                  <div>
                    <Label>Data da Despesa *</Label>
                    <Input type="date" value={despesaForm.dt_despesa}
                      onChange={v => setDespesaForm(f => ({ ...f, dt_despesa: v }))} />
                  </div>
                  <div>
                    <Label>Tipo de Despesa *</Label>
                    <SearchableSelect options={tipoDespesaOpts}
                      value={despesaForm.tp_despesa_id ? Number(despesaForm.tp_despesa_id) : null}
                      onChange={v => setDespesaForm(f => ({ ...f, tp_despesa_id: v != null ? String(v) : '' }))}
                      placeholder="Selecione..." />
                  </div>
                  <div>
                    <Label>Valor (R$) *</Label>
                    <CurrencyInput value={despesaForm.vlr_despesa}
                      onChange={v => setDespesaForm(f => ({ ...f, vlr_despesa: v }))} />
                  </div>
                  <div>
                    <Label>Documento Fiscal</Label>
                    <Input value={despesaForm.docto_fiscal} placeholder="Nome / referência"
                      onChange={v => setDespesaForm(f => ({ ...f, docto_fiscal: v }))} />
                  </div>
                  <div>
                    <Label>Comprovante de Pagamento</Label>
                    <Input value={despesaForm.comprovante_pagto} placeholder="Nome / referência"
                      onChange={v => setDespesaForm(f => ({ ...f, comprovante_pagto: v }))} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => addDespesaMut.mutate()}
                    disabled={addDespesaMut.isPending || !despesaForm.dt_despesa || !despesaForm.tp_despesa_id || !despesaForm.vlr_despesa}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-40">
                    {addDespesaMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Confirmar
                  </button>
                  <button onClick={() => { setAddingDespesa(false); setDespesaForm(emptyDespesa); }}
                    className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-all">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 mt-8 px-8 py-5">
          <div className="max-w-5xl mx-auto flex items-center justify-center gap-3">
            {canSend && (
              <button
                onClick={() => {
                  const erros = validate();
                  if (erros.length) { setValidationErrors(erros); return; }
                  setValidationErrors([]);
                  saveMut.mutate(true);
                }}
                disabled={saveMut.isPending}
                className="flex items-center gap-2.5 px-7 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-green-900/30">
                {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Enviar para Comprovação
              </button>
            )}
            {canEdit && (
              <button onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}
                className="flex items-center gap-2.5 px-6 py-2.5 bg-white/8 hover:bg-white/12 disabled:opacity-40 text-white/70 hover:text-white text-sm font-medium rounded-xl transition-all">
                {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Salvar Rascunho
              </button>
            )}
            <div className="w-px h-5 bg-white/10 mx-1" />
            <button onClick={() => navigate(`/acoes/${acaoId}`)} disabled={saveMut.isPending}
              className="flex items-center gap-2.5 px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-400/40 text-rose-400/70 hover:text-rose-300 text-sm font-medium rounded-xl transition-all">
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="w-full px-3 py-2.5 rounded-xl border border-white/5 bg-white/3 text-sm text-white/70 min-h-[42px]">
        {value || '—'}
      </div>
    </div>
  );
}

function FileUploadField({ label, uploadedFilename, uploading, disabled, onFile }: {
  label: string; uploadedFilename?: string; uploading: boolean; disabled: boolean;
  onFile: (f: File) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <label className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all cursor-pointer
          ${disabled ? 'opacity-40 cursor-not-allowed border-white/10 text-white/30'
                     : 'border-white/10 text-white/50 hover:text-white hover:border-white/20 bg-white/5 hover:bg-white/10'}`}>
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {uploading ? 'Enviando...' : 'Selecionar arquivo'}
          <input type="file" className="hidden" disabled={disabled}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
        {uploadedFilename && (
          <span className="text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle2 size={11} /> {uploadedFilename}
          </span>
        )}
      </div>
    </div>
  );
}
