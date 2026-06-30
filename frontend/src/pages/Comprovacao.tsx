import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Save, Send, Plus, Trash2, Loader2,
  CheckCircle2, AlertCircle, Upload, Pencil, X, Check,
} from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

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
  despesas: { pgd_despesa_id: number; dt_despesa: string; tp_despesa: string; tp_despesa_id: number; vlr_despesa: number; docto_fiscal: string | null; comprovante_pagto: string | null }[];
}

interface ProdutoRow {
  produto_id: number;
  nome: string;
  fornecedor: string;
  isNovo: boolean;      // true = adicionado na comprovação (planejada = N)
  trabalhado: 'S' | 'N';
  isEditing: boolean;   // só para itens planejados (isNovo = false)
}

interface CulturaRow {
  cultura_id: number;
  nome: string;
  isNovo: boolean;
  trabalhado: 'S' | 'N';
  isEditing: boolean;
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

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs text-white/50 mb-1 block">{children}</label>;
}
function Input({ value, onChange, type = 'text', placeholder, disabled }: {
  value: string | number; onChange?: (v: string) => void; type?: string;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <input type={type} value={value ?? ''} disabled={disabled}
      onChange={e => onChange?.(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white
                 placeholder-white/20 outline-none focus:border-green-500/60 transition-all
                 disabled:opacity-50 disabled:cursor-not-allowed" />
  );
}

// ─── Text labels ─────────────────────────────────────────────────────────────

function LabelTrabalhou({ value, tipo = 'produto' }: { value: 'S' | 'N'; tipo?: 'produto' | 'cultura' }) {
  return value === 'S'
    ? <span className="text-sm text-white/80">Trabalhei {tipo === 'cultura' ? 'esta cultura' : 'este produto'}</span>
    : <span className="text-sm text-white/35">Não trabalhei</span>;
}
function LabelPlanejada({ isNovo }: { isNovo: boolean }) {
  return isNovo
    ? <span className="text-sm text-white/35">Novo</span>
    : <span className="text-sm text-white/80">Planejada</span>;
}

// ─── Table helpers ───────────────────────────────────────────────────────────

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs font-medium rounded-lg transition-all">
      <Plus size={12} /> {label}
    </button>
  );
}

function AddRow({ select, onConfirm, canConfirm, onCancel }: {
  select: React.ReactNode;
  onConfirm: () => void;
  canConfirm: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3 bg-emerald-500/5 border-b border-emerald-500/20 flex items-center gap-2">
      {select}
      <button onClick={onConfirm} disabled={!canConfirm}
        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
        <Check size={13} /> Confirmar
      </button>
      <button onClick={onCancel}
        className="px-3 py-2 rounded-xl text-sm text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-all whitespace-nowrap">
        Cancelar
      </button>
    </div>
  );
}

function ItemTable({ cols, headers, empty, children, adding, addRow, count }: {
  cols: string[];
  headers: string[];
  empty: string;
  children: React.ReactNode;
  adding: boolean;
  addRow: React.ReactNode;
  count: number;
}) {
  const colsWithAction = [...cols, '80px'].join(' ');
  return (
    <div className="rounded-xl border border-white/8 overflow-hidden">
      <div className="grid bg-white/4 border-b border-white/8 px-4 py-2.5 gap-4"
        style={{ gridTemplateColumns: colsWithAction }}>
        {headers.map((h, i) => (
          <span key={i} className="text-xs font-semibold text-white/45 uppercase tracking-wider">{h}</span>
        ))}
        <span />
      </div>
      {children}
      {adding && addRow}
      {count === 0 && !adding && (
        <div className="px-4 py-8 text-center text-sm text-white/25">{empty}</div>
      )}
    </div>
  );
}

function RowActions({ canEdit, isNovo, isEditing, canDelete, onDelete, onEdit }: {
  canEdit: boolean; isNovo: boolean; isEditing: boolean;
  canDelete: boolean; onDelete: () => void; onEdit: () => void;
}) {
  if (!canEdit) return <span />;
  if (isNovo) return (
    <div className="flex justify-end">
      <button onClick={onDelete} disabled={!canDelete}
        className="p-1.5 rounded text-white/25 hover:text-red-400 hover:bg-red-400/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed" title="Remover">
        <Trash2 size={13} />
      </button>
    </div>
  );
  if (isEditing) return (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={onEdit} className="p-1.5 rounded text-emerald-400 hover:bg-emerald-400/10 transition-all" title="Confirmar">
        <Check size={13} />
      </button>
      <button onClick={onEdit} className="p-1.5 rounded text-white/30 hover:bg-white/8 transition-all" title="Cancelar">
        <X size={13} />
      </button>
    </div>
  );
  return (
    <div className="flex justify-end">
      <button onClick={onEdit} className="p-1.5 rounded text-white/25 hover:text-white hover:bg-white/8 transition-all" title="Editar">
        <Pencil size={13} />
      </button>
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

  const [addingProduto, setAddingProduto] = useState(false);
  const [addingCultura, setAddingCultura] = useState(false);
  const [newProdutoId, setNewProdutoId]   = useState('');
  const [newCulturaId, setNewCulturaId]   = useState('');

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

  // Inicializa form ao carregar dados (uma vez)
  useEffect(() => {
    if (!data || initialized) return;
    setVlrAR(data.acao.vlr_investido_ar != null ? String(data.acao.vlr_investido_ar) : '');
    setSemVlrAR(data.acao.sem_vlr_investido_ar === 'S');
    setVlrForn(data.acao.vlr_investido_fornecedor != null ? String(data.acao.vlr_investido_fornecedor) : '');
    setSemVlrForn(data.acao.sem_vlr_investido_fornecedor === 'S');
    setPubReal(data.acao.publico_realizado != null ? String(data.acao.publico_realizado) : '');
    setObs(data.acao.obs ?? '');
    setProdutos(data.produtos.map(p => ({
      produto_id: p.produto_id,
      nome: p.nome,
      fornecedor: p.fornecedor,
      // robusto: isNovo apenas quando explicitamente 'N'; qualquer outro valor = planejado
      isNovo: String(p.planejada).toUpperCase() === 'N',
      trabalhado: (p.trabalhado as 'S' | 'N') ?? 'S',
      isEditing: false,
    })));
    setCulturas(data.culturas.map(c => ({
      cultura_id: c.cultura_id,
      nome: c.nome,
      isNovo: String(c.planejada).toUpperCase() === 'N',
      trabalhado: (c.trabalhado as 'S' | 'N') ?? 'S',
      isEditing: false,
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
        vlr_investido_ar:             semVlrAR   ? null : (vlrAR   ? Number(vlrAR)   : undefined),
        sem_vlr_investido_ar:         semVlrAR   ? 'S' : 'N',
        vlr_investido_fornecedor:     semVlrForn ? null : (vlrForn ? Number(vlrForn) : undefined),
        sem_vlr_investido_fornecedor: semVlrForn ? 'S' : 'N',
        publico_realizado:            pubReal    ? Number(pubReal) : undefined,
        obs:                          obs        || undefined,
        produtos: produtos.map(p => ({ produto_id: p.produto_id, trabalhado: p.trabalhado, is_novo: p.isNovo })),
        culturas: culturas.map(c => ({ cultura_id: c.cultura_id, trabalhado: c.trabalhado, is_novo: c.isNovo })),
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
      vlr_despesa:   Number(despesaForm.vlr_despesa.replace(',', '.')),
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

  function toggleEditProduto(produto_id: number) {
    setProdutos(prev => prev.map(p =>
      p.produto_id === produto_id ? { ...p, isEditing: !p.isEditing } : p
    ));
  }
  function setTrabalhado(produto_id: number, val: 'S' | 'N') {
    setProdutos(prev => prev.map(p =>
      p.produto_id === produto_id ? { ...p, trabalhado: val } : p
    ));
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
    setProdutos(prev => [...prev, {
      produto_id: opt.value,
      nome: opt.label,
      fornecedor: opt.fornecedor_rtv ?? '',
      isNovo: true,
      trabalhado: 'S',   // novo produto sempre começa como trabalhado
      isEditing: false,
    }]);
    setNewProdutoId('');
    setAddingProduto(false);
  }

  // ─── Culturas helpers ─────────────────────────────────────────────────────

  function toggleEditCultura(cultura_id: number) {
    setCulturas(prev => prev.map(c =>
      c.cultura_id === cultura_id ? { ...c, isEditing: !c.isEditing } : c
    ));
  }
  function setTrabalhoCultura(cultura_id: number, val: 'S' | 'N') {
    setCulturas(prev => prev.map(c =>
      c.cultura_id === cultura_id ? { ...c, trabalhado: val } : c
    ));
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
      cultura_id: opt.value,
      nome: opt.label,
      isNovo: true,
      trabalhado: 'S',
      isEditing: false,
    }]);
    setNewCulturaId('');
    setAddingCultura(false);
  }

  // ─── Guards ───────────────────────────────────────────────────────────────

  const isAdmin = user?.pgd_acao_visao === 'ADM' || user?.priv_admin === 'S';
  const visao   = user?.pgd_acao_visao;
  const canEdit = visao === 'GD' || visao === 'COM' || isAdmin;
  const canSend = canEdit && data?.acao.status_id === 4;

  // ─── Validação ───────────────────────────────────────────────────────────

  function validate(): string[] {
    const erros: string[] = [];
    if (!semVlrAR && !vlrAR.trim())
      erros.push('Informe o Valor Investido AR ou marque "Sem valor".');
    if (!semVlrForn && !vlrForn.trim())
      erros.push('Informe o Valor Investido Fornecedor ou marque "Sem valor".');
    if (!pubReal.trim() || Number(pubReal) <= 0)
      erros.push('Informe o Público Realizado (deve ser maior que 0).');
    // Regra: não pode "Não trabalhar" todos os produtos
    if (produtos.length > 0 && !produtos.some(p => p.trabalhado === 'S'))
      erros.push('Pelo menos um produto deve ser marcado como "Trabalhei este produto".');
    if (culturas.length > 0 && !culturas.some(c => c.trabalhado === 'S'))
      erros.push('Pelo menos uma cultura deve ser marcada como trabalhada.');
    if ((data?.despesas ?? []).length === 0)
      erros.push('Adicione ao menos uma Despesa/Comprovante antes de enviar.');
    return erros;
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 size={24} className="animate-spin mr-2" /> Carregando comprovação...
      </div>
    );
  }
  if (!data) return <div className="text-red-400 p-6">Ação não encontrada.</div>;

  const { acao, despesas } = data;
  const totalDespesas = despesas.reduce((sum, d) => sum + Number(d.vlr_despesa), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium
          ${toast.ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-white/8 flex items-center justify-between bg-[#13151f]">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/acoes/${acaoId}`)}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-all">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">Comprovação da Ação #{acaoId}</h1>
            <p className="text-xs text-white/40">{acao.consultor} · {acao.filial} · {fmtDate(acao.dt_acao)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => saveMut.mutate(false)} disabled={saveMut.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm bg-white/8 hover:bg-white/12 text-white/70 hover:text-white transition-all disabled:opacity-50">
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar rascunho
            </button>
          )}
          {canSend && (
            <button
              onClick={() => {
                const erros = validate();
                if (erros.length) { setValidationErrors(erros); return; }
                setValidationErrors([]);
                saveMut.mutate(true);
              }}
              disabled={saveMut.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-50">
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Enviar para Comprovação
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto px-6 py-6 space-y-6">

        {validationErrors.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4">
            <p className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
              <AlertCircle size={15} /> Corrija os itens abaixo antes de enviar:
            </p>
            <ul className="space-y-1">
              {validationErrors.map((e, i) => (
                <li key={i} className="text-sm text-red-300 flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">•</span> {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Resumo ── */}
        <Section title="Resumo da Ação">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <ReadonlyField label="Atividade"           value={acao.atividade} />
            <ReadonlyField label="Público Previsto"    value={acao.publico_previsto?.toLocaleString('pt-BR') ?? '—'} />
            <ReadonlyField label="Vlr Previsto AR"     value={`R$ ${fmt(acao.vlr_previsto_ar)}`} />
            <ReadonlyField label="Vlr Previsto Forn."  value={`R$ ${fmt(acao.vlr_previsto_fornecedor)}`} />
          </div>
        </Section>

        {/* ── Valores Realizados ── */}
        <Section title="Valores Realizados">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <Label>Valor Investido AR (R$)</Label>
              <div className="flex items-center gap-3">
                <Input value={vlrAR} onChange={setVlrAR} type="number" placeholder="0,00" disabled={semVlrAR || !canEdit} />
                <label className="flex items-center gap-2 text-xs text-white/50 whitespace-nowrap cursor-pointer select-none">
                  <input type="checkbox" checked={semVlrAR} disabled={!canEdit}
                    onChange={e => { setSemVlrAR(e.target.checked); if (e.target.checked) setVlrAR(''); }}
                    className="rounded" />
                  Sem valor
                </label>
              </div>
            </div>
            <div>
              <Label>Valor Investido Fornecedor (R$)</Label>
              <div className="flex items-center gap-3">
                <Input value={vlrForn} onChange={setVlrForn} type="number" placeholder="0,00" disabled={semVlrForn || !canEdit} />
                <label className="flex items-center gap-2 text-xs text-white/50 whitespace-nowrap cursor-pointer select-none">
                  <input type="checkbox" checked={semVlrForn} disabled={!canEdit}
                    onChange={e => { setSemVlrForn(e.target.checked); if (e.target.checked) setVlrForn(''); }}
                    className="rounded" />
                  Sem valor
                </label>
              </div>
            </div>
            <div>
              <Label>Público Realizado</Label>
              <Input value={pubReal} onChange={setPubReal} type="number" placeholder="0" disabled={!canEdit} />
            </div>
            <div>
              <Label>Observações</Label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} disabled={!canEdit} rows={3}
                className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white
                           placeholder-white/20 outline-none focus:border-green-500/60 transition-all
                           disabled:opacity-50 resize-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6 mt-4">
            <FileUploadField label="Lista de Presença"
              uploadedFilename={uploadedFiles['lista_presenca']}
              uploading={uploadingField === 'lista_presenca'} disabled={!canEdit}
              onFile={f => handleUpload('lista_presenca', f)} />
            <FileUploadField label="Relatório de Desenvolvimento de Lavoura"
              uploadedFilename={uploadedFiles['rel_desenv_lavoura']}
              uploading={uploadingField === 'rel_desenv_lavoura'} disabled={!canEdit}
              onFile={f => handleUpload('rel_desenv_lavoura', f)} />
          </div>
        </Section>

        {/* ── Produtos ── */}
        <Section
          title="Produtos"
          action={canEdit && !addingProduto ? (
            <AddBtn onClick={() => setAddingProduto(true)} label="Novo Produto" />
          ) : undefined}
        >
          <ItemTable
            cols={['2fr', '1fr', '1fr', '1fr']}
            headers={['Produto', 'Trabalhado?', 'Planejada?', 'RTV Fornecedor']}
            empty="Nenhum produto. Clique em + Novo Produto."
            count={produtos.length}
            adding={addingProduto}
            addRow={
              <AddRow
                select={
                  <select value={newProdutoId} onChange={e => setNewProdutoId(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-white/10 bg-[#0d0f17] text-sm text-white outline-none focus:border-green-500/60">
                    <option value="">Selecione um produto...</option>
                    {formOptions?.produtos
                      .filter(o => !produtos.some(p => String(p.produto_id) === String(o.value)))
                      .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                }
                onConfirm={confirmAddProduto}
                canConfirm={!!newProdutoId}
                onCancel={() => { setAddingProduto(false); setNewProdutoId(''); }}
              />
            }
          >
            {produtos.map((p) => (
              <div key={p.produto_id}
                className="grid px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center gap-4"
                style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 80px' }}>
                <span className="text-sm text-white/80 truncate">{p.nome}</span>
                {p.isEditing && !p.isNovo ? (
                  <select value={p.trabalhado}
                    onChange={e => setTrabalhado(p.produto_id, e.target.value as 'S' | 'N')}
                    className="px-2 py-1.5 rounded-lg border border-white/20 bg-[#0d0f17] text-xs text-white outline-none focus:border-green-500/60">
                    <option value="S">Trabalhei este produto</option>
                    <option value="N">Não trabalhei</option>
                  </select>
                ) : (
                  <LabelTrabalhou value={p.isNovo ? 'S' : p.trabalhado} />
                )}
                <LabelPlanejada isNovo={p.isNovo} />
                <span className="text-sm text-white/45 truncate">{p.fornecedor || '—'}</span>
                <RowActions
                  canEdit={canEdit} isNovo={p.isNovo} isEditing={p.isEditing}
                  canDelete={p.isNovo && produtos.length > 1}
                  onDelete={() => deleteProduto(p.produto_id)}
                  onEdit={() => toggleEditProduto(p.produto_id)}
                />
              </div>
            ))}
          </ItemTable>
        </Section>

        {/* ── Culturas ── */}
        <Section
          title="Culturas"
          action={canEdit && !addingCultura ? (
            <AddBtn onClick={() => setAddingCultura(true)} label="Nova Cultura" />
          ) : undefined}
        >
          <ItemTable
            cols={['2fr', '1fr', '1fr', '1fr']}
            headers={['Cultura', 'Trabalhada?', 'Planejada?', '']}
            empty="Nenhuma cultura. Clique em + Nova Cultura."
            count={culturas.length}
            adding={addingCultura}
            addRow={
              <AddRow
                select={
                  <select value={newCulturaId} onChange={e => setNewCulturaId(e.target.value)}
                    className="flex-1 px-3 py-2.5 rounded-xl border border-white/10 bg-[#0d0f17] text-sm text-white outline-none focus:border-green-500/60">
                    <option value="">Selecione uma cultura...</option>
                    {formOptions?.culturas
                      .filter(o => !culturas.some(c => String(c.cultura_id) === String(o.value)))
                      .map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                }
                onConfirm={confirmAddCultura}
                canConfirm={!!newCulturaId}
                onCancel={() => { setAddingCultura(false); setNewCulturaId(''); }}
              />
            }
          >
            {culturas.map((c) => (
              <div key={c.cultura_id}
                className="grid px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center gap-4"
                style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 80px' }}>
                <span className="text-sm text-white/80 truncate">{c.nome}</span>
                {c.isEditing && !c.isNovo ? (
                  <select value={c.trabalhado}
                    onChange={e => setTrabalhoCultura(c.cultura_id, e.target.value as 'S' | 'N')}
                    className="px-2 py-1.5 rounded-lg border border-white/20 bg-[#0d0f17] text-xs text-white outline-none focus:border-green-500/60">
                    <option value="S">Trabalhei esta cultura</option>
                    <option value="N">Não trabalhei</option>
                  </select>
                ) : (
                  <LabelTrabalhou value={c.isNovo ? 'S' : c.trabalhado} tipo="cultura" />
                )}
                <LabelPlanejada isNovo={c.isNovo} />
                <span />
                <RowActions
                  canEdit={canEdit} isNovo={c.isNovo} isEditing={c.isEditing}
                  canDelete={c.isNovo && culturas.length > 1}
                  onDelete={() => deleteCultura(c.cultura_id)}
                  onEdit={() => toggleEditCultura(c.cultura_id)}
                />
              </div>
            ))}
          </ItemTable>
        </Section>

        {/* ── Despesas ── */}
        <Section title={`Despesas / Comprovantes (Total: R$ ${fmt(totalDespesas)})`}>
          <div className="rounded-xl border border-white/8 overflow-hidden mb-4">
            <div className="grid grid-cols-[120px_1fr_120px_1fr_1fr_40px] bg-white/4 border-b border-white/8 px-4 py-2">
              {['Data', 'Tipo', 'Valor (R$)', 'Doc. Fiscal', 'Comprov. Pagto', ''].map(h => (
                <span key={h} className="text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            {despesas.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-white/30">Nenhuma despesa cadastrada.</div>
            )}
            {despesas.map(d => (
              <div key={d.pgd_despesa_id} className="grid grid-cols-[120px_1fr_120px_1fr_1fr_40px] px-4 py-3 border-b border-white/5 hover:bg-white/3 items-center">
                <span className="text-xs text-white/60 font-mono">{fmtDate(d.dt_despesa)}</span>
                <span className="text-sm text-white">{d.tp_despesa}</span>
                <span className="text-sm text-white font-mono">{fmt(d.vlr_despesa)}</span>
                <span className="text-xs text-white/50 truncate">{d.docto_fiscal || '—'}</span>
                <span className="text-xs text-white/50 truncate">{d.comprovante_pagto || '—'}</span>
                {canEdit ? (
                  <button onClick={() => delDespesaMut.mutate(d.pgd_despesa_id)} disabled={delDespesaMut.isPending}
                    className="p-1 text-white/30 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                ) : <span />}
              </div>
            ))}
          </div>

          {canEdit && !addingDespesa && (
            <button onClick={() => setAddingDespesa(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/50 hover:text-white bg-white/5 hover:bg-white/10 transition-all">
              <Plus size={14} /> Adicionar Despesa
            </button>
          )}

          {addingDespesa && (
            <div className="rounded-xl border border-white/10 bg-white/3 p-4 mt-2">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <Label>Data da Despesa *</Label>
                  <Input type="date" value={despesaForm.dt_despesa}
                    onChange={v => setDespesaForm(f => ({ ...f, dt_despesa: v }))} />
                </div>
                <div>
                  <Label>Tipo de Despesa *</Label>
                  <select value={despesaForm.tp_despesa_id}
                    onChange={e => setDespesaForm(f => ({ ...f, tp_despesa_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-sm text-white outline-none focus:border-green-500/60">
                    <option value="">Selecione</option>
                    {tiposDespesa.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Valor (R$) *</Label>
                  <Input type="number" value={despesaForm.vlr_despesa} placeholder="0,00"
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
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-all disabled:opacity-40">
                  {addDespesaMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                  Confirmar
                </button>
                <button onClick={() => { setAddingDespesa(false); setDespesaForm(emptyDespesa); }}
                  className="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white bg-white/5 hover:bg-white/10 transition-all">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-[#1a1d27] border border-white/8 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-white/40 mb-0.5">{label}</p>
      <p className="text-sm text-white">{value}</p>
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
        <label className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all cursor-pointer
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
