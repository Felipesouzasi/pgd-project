import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Line, Legend, Area, AreaChart,
} from 'recharts';
import {
  TrendingUp, Users, DollarSign, Target, Activity,
  Filter, RefreshCw, Award, MapPin, Package, Leaf,
  AlertTriangle, CalendarClock, ChevronRight,
} from 'lucide-react';
import api from '../lib/api';

// ── Paleta ────────────────────────────────────────────────────────────────────
const GREENS  = ['#22c55e','#16a34a','#15803d','#166534','#14532d','#4ade80','#86efac','#bbf7d0'];
const MULTI   = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];
const SELECT_OPT: React.CSSProperties = { background: '#12141c', color: '#e5e7eb' };
const TOOLTIP_STYLE = {
  contentStyle: { background:'#0f1117', border:'1px solid #1f2937', borderRadius:8, fontSize:12 },
  labelStyle: { color:'#9ca3af' },
  itemStyle:  { color:'#d1fae5' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (v: number) =>
  Number(v ?? 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });

const fmtK = (v: number) => {
  if (v >= 1_000_000) return `R$${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `R$${(v/1_000).toFixed(0)}k`;
  return `R$${v}`;
};

function useQ<T>(key: string[], url: string, params: Record<string,string>) {
  return useQuery<T>({
    queryKey: [...key, params],
    queryFn: () => api.get(url, { params }).then(r => r.data),
    staleTime: 60_000,
  });
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = 'green' }:
  { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  const ring = color === 'green'  ? 'border-green-500/30 bg-green-500/5'
             : color === 'blue'   ? 'border-blue-500/30  bg-blue-500/5'
             : color === 'amber'  ? 'border-amber-500/30 bg-amber-500/5'
             :                     'border-purple-500/30 bg-purple-500/5';
  const ico  = color === 'green'  ? 'text-green-400'
             : color === 'blue'   ? 'text-blue-400'
             : color === 'amber'  ? 'text-amber-400'
             :                     'text-purple-400';
  return (
    <div className={`rounded-xl border p-4 ${ring} flex gap-3 items-start`}>
      <div className={`mt-0.5 ${ico}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-white/40 mb-0.5">{label}</p>
        <p className="text-xl font-bold text-white leading-none">{value}</p>
        {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function Card({ title, subtitle, children, className = '' }:
  { title: React.ReactNode; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0f1117] border border-white/8 rounded-xl p-4 ${className}`}>
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">{title}</h3>
      {subtitle && <p className="text-[11px] text-white/30 normal-case mb-3">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

// Nomes reais dos status na StatusBadge (frontend) — usados só p/ cor consistente
const STATUS_COLORS: Record<string, string> = {
  'Planejada': '#3b82f6', 'Finalizada': '#22c55e', 'Reprovada': '#ef4444',
  'Recusada':  '#f97316', 'Análise':    '#8b5cf6', 'Aguardando':'#f59e0b',
  'Cancelada': '#6b7280', 'Aprovação':  '#f97316', 'Aprovada':  '#06b6d4',
  'Pendentes': '#f59e0b',
};
const statusColor = (s: string) => {
  for (const [k, v] of Object.entries(STATUS_COLORS)) {
    if (s.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#6b7280';
};

const MoneyTip = ({ active, payload, label }: {active?:boolean;payload?:{name:string;value:number}[];label?:string}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0f1117] border border-white/10 rounded-lg p-2.5 text-xs">
      <p className="text-white/50 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="text-white font-semibold">{p.name}: {fmtK(p.value)}</p>
      ))}
    </div>
  );
};

interface Prazos {
  total_aberto: number; vencidas: number; vence_7: number; vence_14: number; vence_30: number;
  vence_depois: number; dias_atraso_max: number;
}

function todayPlus(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function todayMinus(days: number) {
  const d = new Date(); d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

interface PorFilialItem { filial: string; total: number; vlr_ar: number }
interface PorFilialResponse { filiais: PorFilialItem[]; sem_filial: PorFilialItem }

function filialsSortedByValue(items: PorFilialItem[]) {
  return [...items].sort((a, b) => Number(b.vlr_ar) - Number(a.vlr_ar));
}

// ── Seletor de filiais (checkbox dinâmico) ────────────────────────────────────
function FilialPicker({ options, selected, onChange }:
  { options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/60 hover:text-white transition-colors">
        <Filter size={11} /> Filiais ({selected.length}/{options.length})
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 z-20 w-64 max-h-80 overflow-y-auto bg-[#12141c] border border-white/10 rounded-xl shadow-2xl p-2">
            <div className="flex gap-2 mb-2 px-1">
              <button onClick={() => onChange(options)}
                className="text-[11px] text-green-400 hover:text-green-300">Selecionar todas</button>
              <span className="text-white/20">·</span>
              <button onClick={() => onChange([])}
                className="text-[11px] text-white/40 hover:text-white/70">Limpar</button>
            </div>
            {options.map(f => (
              <label key={f} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white/5 cursor-pointer text-xs text-white/70">
                <input type="checkbox" checked={selected.includes(f)}
                  onChange={() => onChange(selected.includes(f) ? selected.filter(x => x !== f) : [...selected, f])}
                  className="accent-green-500" />
                <span className="truncate" title={f}>{f}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const [filial,  setFilial]  = useState('');
  const [ano,     setAno]     = useState('');
  const [tpAcao,  setTpAcao]  = useState('');
  const [tab,     setTab]     = useState<'visao'|'financeiro'|'equipe'|'portfolio'>('visao');

  const p = Object.fromEntries(
    Object.entries({ filial, ano, tp_acao: tpAcao }).filter(([,v]) => v !== '')
  ) as Record<string,string>;

  const { data: kpis,       isLoading: kL } = useQ<Record<string,number>>(['kpis'],      '/dashboard/kpis',      p);
  const { data: porStatus,  refetch: rSt  } = useQ<{status_id:number;status:string;total:number}[]>(['por-status'], '/dashboard/por-status', p);

  const [mesInicio, setMesInicio] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [mesFim, setMesFim] = useState(() => new Date().toISOString().slice(0, 10));
  const pMes = { ...p, dt_inicio: mesInicio, dt_fim: mesFim };
  const { data: porMes                     } = useQ<{mes:string;total:number;vlr_ar:number;vlr_forn:number}[]>(['por-mes'], '/dashboard/por-mes', pMes);
  const { data: porTipo                    } = useQ<{tipo:string;total:number;vlr_ar:number}[]>(['por-tipo'],    '/dashboard/por-tipo',   p);
  const { data: porFilial                  } = useQ<PorFilialResponse>(['por-filial'],'/dashboard/por-filial', p);
  const [selectedFiliais, setSelectedFiliais] = useState<string[] | null>(null); // null = default (top 10)
  const { data: consultores                } = useQ<{consultor:string;total:number;vlr_ar:number;finalizadas:number}[]>(['consultores'],'/dashboard/consultores', p);
  const { data: produtos                   } = useQ<{produto:string;total:number}[]>(['produtos'],   '/dashboard/produtos',   p);
  const { data: culturas                   } = useQ<{cultura:string;total:number}[]>(['culturas'],   '/dashboard/culturas',   p);
  const { data: regional                   } = useQ<{regional:string;total:number;vlr_ar:number}[]>(['regional'], '/dashboard/regional',  p);
  const { data: prazos                     } = useQ<Prazos>(['prazos'], '/dashboard/prazos', p);
  const { data: filiais                    } = useQ<{filial:string}[]>(['filiais'],      '/dashboard/filiais',    {});
  const { data: anos                       } = useQ<{ano:number}[]>(['anos'],            '/dashboard/anos',       {});

  const refetchAll = () => { rSt(); };

  const pctFinaliz = kpis ? Math.round((Number(kpis.finalizadas ?? 0) / Math.max(Number(kpis.total_acoes),1)) * 100) : 0;
  const pctPublicoFinaliz = kpis
    ? Math.round((Number(kpis.publico_realizado_finalizadas ?? 0) / Math.max(Number(kpis.publico_previsto_finalizadas),1)) * 100)
    : 0;
  const ticketMedio = kpis && Number(kpis.finalizadas) > 0
    ? Number(kpis.total_investido_ar) / Number(kpis.finalizadas)
    : 0;

  const filialOptions = (porFilial?.filiais ?? []).map(f => f.filial);
  const filiaisAtivas = selectedFiliais ?? filialOptions.slice(0, 10);
  const filiaisChart = (porFilial?.filiais ?? []).filter(f => filiaisAtivas.includes(f.filial));

  const goToAcoes = (params: Record<string,string>) => {
    const qs = new URLSearchParams(params).toString();
    navigate(`/acoes?${qs}`);
  };

  const TABS = [
    { id: 'visao',      label: 'Visão Geral' },
    { id: 'financeiro', label: 'Financeiro'  },
    { id: 'equipe',     label: 'Equipe'      },
    { id: 'portfolio',  label: 'Portfólio'   },
  ] as const;

  return (
    <div className="h-full overflow-y-auto bg-[#080b10] text-white p-6">

      {/* ── Topo ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard PGD</h1>
          <p className="text-white/40 text-sm mt-0.5">Análise de ações de geração de demanda</p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-white/30" />
          <select value={ano} onChange={e => setAno(e.target.value)}
            className="bg-[#12141c] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none focus:border-green-500/50">
            <option style={SELECT_OPT} value="">Todos os anos</option>
            {(anos ?? []).map(a => <option style={SELECT_OPT} key={a.ano} value={String(a.ano)}>{a.ano}</option>)}
          </select>

          <select value={filial} onChange={e => setFilial(e.target.value)}
            className="bg-[#12141c] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none focus:border-green-500/50">
            <option style={SELECT_OPT} value="">Todas as filiais</option>
            {(filiais ?? []).map(f => <option style={SELECT_OPT} key={f.filial} value={f.filial}>{f.filial}</option>)}
          </select>

          <select value={tpAcao} onChange={e => setTpAcao(e.target.value)}
            className="bg-[#12141c] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white/80 outline-none focus:border-green-500/50">
            <option style={SELECT_OPT} value="">Todos os tipos</option>
            <option style={SELECT_OPT} value="DT">Distribuição (DT)</option>
            <option style={SELECT_OPT} value="R">Redistribuição (R)</option>
            <option style={SELECT_OPT} value="DINAC">DINAC</option>
          </select>

          <button onClick={refetchAll}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white transition-all">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      {kL ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 animate-pulse">
          {Array.from({length:8}).map((_,i) => <div key={i} className="h-20 bg-white/5 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {/* 1 */}
          <KpiCard icon={<Activity size={20}/>}   label="Total de Ações"
            value={Number(kpis?.total_acoes ?? 0).toLocaleString('pt-BR')}
            sub={`${pctFinaliz}% finalizadas`} color="green" />
          {/* 2 */}
          <KpiCard icon={<Activity size={20}/>}   label="Em Andamento"
            value={Number(kpis?.em_andamento ?? 0).toLocaleString('pt-BR')} color="blue" />
          {/* 3 */}
          <KpiCard icon={<Users size={20}/>}      label="Conversão de Público"
            value={`${pctPublicoFinaliz}%`}
            sub="Realizado / previsto (apenas finalizadas)" color="purple" />
          {/* 4 */}
          <KpiCard icon={<DollarSign size={20}/>} label="Investido AR"
            value={fmtK(Number(kpis?.total_investido_ar ?? 0))}
            sub={`Previsto: ${fmtK(Number(kpis?.total_previsto_ar??0))}`} color="blue" />
          {/* 5 */}
          <KpiCard icon={<TrendingUp size={20}/>} label="Finalizadas"
            value={Number(kpis?.finalizadas ?? 0).toLocaleString('pt-BR')} color="green" />
          {/* 6 */}
          <KpiCard icon={<AlertTriangle size={20}/>} label="Reprovadas / Canceladas"
            value={Number(kpis?.reprovadas ?? 0).toLocaleString('pt-BR')} color="purple" />
          {/* 7 */}
          <KpiCard icon={<Target size={20}/>}     label="Ticket Médio Investido"
            value={fmtK(ticketMedio)}
            sub="Vlr AR investido / ação finalizada" color="amber" />
          {/* 8 */}
          <KpiCard icon={<DollarSign size={20}/>} label="Investido Fornecedor"
            value={fmtK(Number(kpis?.total_investido_forn ?? 0))}
            sub={`Previsto: ${fmtK(Number(kpis?.total_previsto_forn??0))}`} color="amber" />
        </div>
      )}

      {/* ── Prazos de Execução ── */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <CalendarClock size={14} className="text-white/40" />
          <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Prazos de Execução</h3>
          <span className="text-[11px] text-white/25 normal-case">ações ainda em aberto, por proximidade da data</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Vencidas',            value: prazos?.vencidas ?? 0, color: '#ef4444', bg: 'bg-red-500/10',    border: 'border-red-500/20',    click: () => goToAcoes({ dt_fim: todayMinus(1) }),
              extra: Number(prazos?.dias_atraso_max ?? 0) > 0 ? `até ${prazos?.dias_atraso_max} dias de atraso` : undefined },
            { label: 'Vence em até 7 dias', value: prazos?.vence_7  ?? 0, color: '#f59e0b', bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  click: () => goToAcoes({ dt_inicio: todayPlus(0),  dt_fim: todayPlus(7)  }) },
            { label: 'Vence em 8 a 14 dias',value: prazos?.vence_14 ?? 0, color: '#eab308', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', click: () => goToAcoes({ dt_inicio: todayPlus(8),  dt_fim: todayPlus(14) }) },
            { label: 'Vence em 15 a 30 dias',value: prazos?.vence_30 ?? 0, color: '#22c55e', bg: 'bg-green-500/10', border: 'border-green-500/20',  click: () => goToAcoes({ dt_inicio: todayPlus(15), dt_fim: todayPlus(30) }) },
            { label: 'Vence depois de 30 dias', value: prazos?.vence_depois ?? 0, color: '#3b82f6', bg: 'bg-blue-500/10', border: 'border-blue-500/20', click: () => goToAcoes({ dt_inicio: todayPlus(31) }) },
          ].map(item => (
            <button key={item.label} onClick={item.click}
              className={`text-left rounded-xl border ${item.border} ${item.bg} hover:brightness-125 p-4 transition-all group flex items-center gap-3`}>
              <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background: item.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: item.color }}>{item.label}</span>
                  <ChevronRight size={13} className="opacity-40 group-hover:translate-x-0.5 group-hover:opacity-80 transition-all" style={{ color: item.color }} />
                </div>
                <p className="text-2xl font-bold text-white mt-1 leading-none">{item.value}</p>
                {item.extra && <p className="text-[11px] mt-1 opacity-60" style={{ color: item.color }}>{item.extra}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6 bg-white/5 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === t.id
                ? 'bg-green-500 text-white shadow'
                : 'text-white/50 hover:text-white'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Visão Geral ── */}
      {tab === 'visao' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pb-8">

          {/* Status — Donut + lista clicável, span completo pra caber tudo */}
          <Card title="Ações por Status (clique para filtrar na grid)" className="lg:col-span-2">
            <div className="flex gap-6">
              <ResponsiveContainer width={220} height={260}>
                <PieChart>
                  <Pie data={porStatus ?? []} dataKey="total" nameKey="status"
                    cx="50%" cy="50%" innerRadius={62} outerRadius={95} paddingAngle={2}
                    onClick={(d: unknown) => {
                      const sid = (d as { status_id?: number })?.status_id;
                      if (sid != null) goToAcoes({ status_id: String(sid) });
                    }}
                    style={{ cursor: 'pointer' }}>
                    {(porStatus ?? []).map((s) => (
                      <Cell key={s.status_id} fill={statusColor(s.status)} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 flex flex-col gap-1 overflow-y-auto max-h-[260px] pr-1">
                {(porStatus ?? []).map(s => (
                  <button key={s.status_id}
                    onClick={() => goToAcoes({ status_id: String(s.status_id) })}
                    className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background: statusColor(s.status)}}/>
                      <span className="text-white/70 truncate group-hover:text-white transition-colors">{s.status}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="font-bold text-white">{s.total}</span>
                      <ChevronRight size={12} className="text-white/20 group-hover:text-white/50 transition-colors" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Tipo — Pie */}
          <Card title="Tipo de Ação">
            {!porTipo || porTipo.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-white/30 text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={porTipo} dataKey="total" nameKey="tipo"
                    cx="50%" cy="50%" outerRadius={90}
                    label={(props: unknown) => {
                      const { tipo, total } = props as { tipo: string; total: number };
                      return `${tipo} (${total})`;
                    }}
                    labelLine={{ stroke: '#4b5563' }}>
                    {porTipo.map((_,i) => <Cell key={i} fill={GREENS[i % GREENS.length]} />)}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Regional — full width, lista ordenada com barra proporcional */}
          <Card title="Ações por Gerente Regional" className="lg:col-span-3">
            {(regional ?? []).length === 0 ? (
              <div className="h-24 flex items-center justify-center text-white/30 text-sm">Sem dados</div>
            ) : (
              <div className="space-y-2.5">
                {(() => {
                  const max = Math.max(...(regional ?? []).map(r => Number(r.total)), 1);
                  return (regional ?? []).map((r, i) => (
                    <div key={r.regional} className="flex items-center gap-3">
                      <span className="w-44 flex-shrink-0 text-xs text-white/60 truncate" title={r.regional}>{r.regional}</span>
                      <div className="flex-1 h-6 bg-white/5 rounded-md overflow-hidden relative">
                        <div className="h-full rounded-md flex items-center justify-end px-2 transition-all"
                          style={{ width: `${Math.max((Number(r.total)/max)*100, 6)}%`, background: GREENS[i % GREENS.length] }}>
                          <span className="text-xs font-bold text-black/70">{r.total}</span>
                        </div>
                      </div>
                      <span className="w-20 flex-shrink-0 text-right text-xs text-white/40">{fmtK(Number(r.vlr_ar))}</span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </Card>

          {/* Evolução mensal — ocupa largura toda */}
          <Card title={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <span>Evolução Mensal de Ações</span>
              <div className="flex items-center gap-1.5 normal-case">
                <input type="date" value={mesInicio} onChange={e => setMesInicio(e.target.value)}
                  className="bg-[#12141c] border border-white/10 rounded-md px-2 py-1 text-[11px] text-white/70 outline-none focus:border-green-500/50" />
                <span className="text-white/30 text-xs">até</span>
                <input type="date" value={mesFim} onChange={e => setMesFim(e.target.value)}
                  className="bg-[#12141c] border border-white/10 rounded-md px-2 py-1 text-[11px] text-white/70 outline-none focus:border-green-500/50" />
              </div>
            </div>
          }
            subtitle="Quantidade de ações abertas por mês (área verde) comparada ao valor investido AR no mesmo mês (linha azul): ajuda a ver se o volume de ações acompanha o investimento"
            className="lg:col-span-3">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={porMes ?? []}>
                <defs>
                  <linearGradient id="gAr" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="mes" tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis yAxisId="cnt" tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis yAxisId="vlr" orientation="right" tickFormatter={fmtK} tick={{fill:'#6b7280',fontSize:10}} />
                <Tooltip content={<MoneyTip />} />
                <Legend wrapperStyle={{fontSize:11, color:'#9ca3af'}} />
                <Area yAxisId="cnt" type="monotone" dataKey="total" name="Ações"
                  stroke="#22c55e" fill="url(#gAr)" strokeWidth={2} dot={false} />
                <Line yAxisId="vlr" type="monotone" dataKey="vlr_ar" name="Vlr AR"
                  stroke="#3b82f6" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ── Financeiro ── */}
      {tab === 'financeiro' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-8">

          <Card title="Previsto vs Investido por Mês" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porMes ?? []} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="mes" tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis tickFormatter={fmtK} tick={{fill:'#6b7280',fontSize:10}} />
                <Tooltip content={<MoneyTip />} />
                <Legend wrapperStyle={{fontSize:11, color:'#9ca3af'}} />
                <Bar dataKey="vlr_ar"   name="Investido AR"   fill="#22c55e" radius={[3,3,0,0]} />
                <Bar dataKey="vlr_forn" name="Investido Forn" fill="#3b82f6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={
            <div className="flex items-center justify-between w-full">
              <span>Investido AR por Filial</span>
              <FilialPicker options={filialOptions} selected={filiaisAtivas} onChange={setSelectedFiliais} />
            </div>
          }>
            {porFilial?.sem_filial && Number(porFilial.sem_filial.total) > 0 && (
              <p className="text-[11px] text-amber-400/70 mb-2">
                {porFilial.sem_filial.total} ações sem filial cadastrada (não exibidas no gráfico)
              </p>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={filialsSortedByValue(filiaisChart)} layout="vertical">
                <XAxis type="number" tickFormatter={fmtK} tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis type="category" dataKey="filial" width={150}
                  tick={{fill:'#9ca3af',fontSize:9}}
                  tickFormatter={v => v.length>22 ? v.slice(0,20)+'…' : v} />
                <Tooltip content={<MoneyTip />} />
                <Bar dataKey="vlr_ar" name="Investido AR" fill="#22c55e" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Investido AR por Tipo">
            {!porTipo || porTipo.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-white/30 text-sm">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={porTipo}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="tipo" tick={{fill:'#6b7280',fontSize:10}} />
                  <YAxis tickFormatter={fmtK} tick={{fill:'#6b7280',fontSize:10}} />
                  <Tooltip content={<MoneyTip />} />
                  <Bar dataKey="vlr_ar" name="Investido AR" radius={[4,4,0,0]}>
                    {porTipo.map((_,i) => <Cell key={i} fill={GREENS[i%GREENS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      )}

      {/* ── Equipe ── */}
      {tab === 'equipe' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-8">

          <Card title="Top 10 Consultores por Ações" className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={consultores ?? []} layout="vertical" barCategoryGap="18%">
                <XAxis type="number" tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis type="category" dataKey="consultor" width={180}
                  tick={{fill:'#9ca3af',fontSize:9}}
                  tickFormatter={v => v.length>26 ? v.slice(0,24)+'…' : v} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{fontSize:11, color:'#9ca3af'}} />
                <Bar dataKey="total"      name="Total"      fill="#22c55e" radius={[0,3,3,0]} />
                <Bar dataKey="finalizadas" name="Finalizadas" fill="#3b82f6" radius={[0,3,3,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Tabela ranking */}
          <Card title="Ranking Completo" className="lg:col-span-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-3 text-white/40 text-xs font-medium">#</th>
                    <th className="text-left py-2 px-3 text-white/40 text-xs font-medium">Consultor</th>
                    <th className="text-right py-2 px-3 text-white/40 text-xs font-medium">Ações</th>
                    <th className="text-right py-2 px-3 text-white/40 text-xs font-medium">Finalizadas</th>
                    <th className="text-right py-2 px-3 text-white/40 text-xs font-medium">% Conc.</th>
                    <th className="text-right py-2 px-3 text-white/40 text-xs font-medium">Vlr AR</th>
                  </tr>
                </thead>
                <tbody>
                  {(consultores ?? []).map((c, i) => {
                    const pct = Math.round((Number(c.finalizadas)/Math.max(Number(c.total),1))*100);
                    return (
                      <tr key={c.consultor} className={`border-b border-white/5 ${i%2===0?'bg-white/2':''}`}>
                        <td className="py-2 px-3 text-white/30 text-xs font-mono">{i+1}</td>
                        <td className="py-2 px-3 text-white/80 font-medium text-xs">{c.consultor}</td>
                        <td className="py-2 px-3 text-right text-white font-bold">{c.total}</td>
                        <td className="py-2 px-3 text-right text-green-400">{c.finalizadas}</td>
                        <td className="py-2 px-3 text-right">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${pct>=80?'bg-green-500/20 text-green-400':pct>=50?'bg-amber-500/20 text-amber-400':'bg-red-500/20 text-red-400'}`}>
                            {pct}%
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right text-white/60 text-xs">{fmtK(Number(c.vlr_ar))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ── Portfólio ── */}
      {tab === 'portfolio' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-8">

          <Card title={<><Package size={13}/>Top Produtos</>}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={produtos ?? []} layout="vertical" barCategoryGap="20%">
                <XAxis type="number" tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis type="category" dataKey="produto" width={130}
                  tick={{fill:'#9ca3af',fontSize:9}}
                  tickFormatter={v => v.length>18 ? v.slice(0,16)+'…' : v} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="total" name="Ações" radius={[0,4,4,0]}>
                  {(produtos??[]).map((_,i) => <Cell key={i} fill={MULTI[i%MULTI.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={<><Leaf size={13}/>Top Culturas</>}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={culturas ?? []} layout="vertical" barCategoryGap="20%">
                <XAxis type="number" tick={{fill:'#6b7280',fontSize:10}} />
                <YAxis type="category" dataKey="cultura" width={110}
                  tick={{fill:'#9ca3af',fontSize:9}}
                  tickFormatter={v => v.length>16 ? v.slice(0,14)+'…' : v} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="total" name="Ações" radius={[0,4,4,0]}>
                  {(culturas??[]).map((_,i) => <Cell key={i} fill={GREENS[i%GREENS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={
            <div className="flex items-center justify-between w-full">
              <span className="flex items-center gap-1.5"><MapPin size={13}/>Ações por Filial</span>
              <FilialPicker options={filialOptions} selected={filiaisAtivas} onChange={setSelectedFiliais} />
            </div>
          } className="lg:col-span-2">
            {porFilial?.sem_filial && Number(porFilial.sem_filial.total) > 0 && (
              <p className="text-[11px] text-amber-400/70 mb-2">
                {porFilial.sem_filial.total} ações sem filial cadastrada (dado ausente, não exibidas no gráfico)
              </p>
            )}
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={filiaisChart} barGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="filial" tick={{fill:'#6b7280',fontSize:9}}
                  tickFormatter={v => v.replace('ADUBOS REAL S.A. - ','').slice(0,18)} />
                <YAxis tick={{fill:'#6b7280',fontSize:10}} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{fontSize:11, color:'#9ca3af'}} />
                <Bar dataKey="total" name="Ações" fill="#22c55e" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title={<><Award size={13}/>Ações por Tipo</>}>
            {!porTipo || porTipo.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-white/30 text-sm">Sem dados</div>
            ) : (
              <div className="space-y-3 pt-2">
                {porTipo.map((t, i) => {
                  const max = Math.max(...porTipo.map(x=>Number(x.total)));
                  const pct = Math.round((Number(t.total)/max)*100);
                  return (
                    <div key={t.tipo}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/70">{t.tipo}</span>
                        <span className="font-bold text-white">{t.total}</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{width:`${pct}%`, background: GREENS[i%GREENS.length]}} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card title="Distribuição Previsto vs Realizado">
            <div className="space-y-4 pt-2">
              {[
                { label:'Valor AR',       prev: Number(kpis?.total_previsto_ar??0),   real: Number(kpis?.total_investido_ar??0),  fmt: fmtMoney },
                { label:'Valor Forn.',    prev: Number(kpis?.total_previsto_forn??0), real: Number(kpis?.total_investido_forn??0),fmt: fmtMoney },
                { label:'Público (finalizadas)', prev: Number(kpis?.publico_previsto_finalizadas??0), real: Number(kpis?.publico_realizado_finalizadas??0), fmt:(v:number)=>v.toLocaleString('pt-BR') },
              ].map(row => {
                const pct = Math.min(Math.round((row.real/Math.max(row.prev,1))*100),100);
                return (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-white/50">{row.label}</span>
                      <span className="text-white/70">{row.fmt(row.real)} <span className="text-white/30">/ {row.fmt(row.prev)}</span></span>
                    </div>
                    <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{width:`${pct}%`, background: pct>=90?'#22c55e':pct>=70?'#f59e0b':'#ef4444'}} />
                    </div>
                    <p className="text-right text-xs text-white/30 mt-0.5">{pct}% realizado</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
