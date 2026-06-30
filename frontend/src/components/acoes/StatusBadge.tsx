interface StatusMeta {
  bg: string;
  text: string;
  border: string;
}

const STATUS_MAP: Record<number, StatusMeta> = {
  1:  { bg: 'bg-amber-500/15',   text: 'text-amber-400',    border: 'border-amber-500/30' },   // Aguard. Validação GR
  2:  { bg: 'bg-amber-500/15',   text: 'text-amber-300',    border: 'border-amber-500/30' },   // Aguard. Validação GU (inativo)
  3:  { bg: 'bg-orange-500/15',  text: 'text-orange-400',   border: 'border-orange-500/30' },  // Em Aprovação
  4:  { bg: 'bg-blue-500/15',    text: 'text-blue-400',     border: 'border-blue-500/30' },    // Planejada
  5:  { bg: 'bg-purple-500/15',  text: 'text-purple-400',   border: 'border-purple-500/30' },  // Realizada - Em Análise
  7:  { bg: 'bg-rose-500/15',    text: 'text-rose-400',     border: 'border-rose-500/30' },    // Cancelada
  8:  { bg: 'bg-rose-500/15',    text: 'text-rose-400',     border: 'border-rose-500/30' },    // Reprovada (GR)
  9:  { bg: 'bg-rose-500/15',    text: 'text-rose-300',     border: 'border-rose-500/30' },    // Realizada - Recusada GR (inativo)
  10: { bg: 'bg-blue-500/15',    text: 'text-blue-300',     border: 'border-blue-500/30' },    // Planejada - Com Reajuste (inativo)
  11: { bg: 'bg-emerald-500/15', text: 'text-emerald-400',  border: 'border-emerald-500/30' }, // Finalizada - Está Pago
  12: { bg: 'bg-sky-500/15',     text: 'text-sky-400',      border: 'border-sky-500/30' },     // Planejada - Reprogramada
  13: { bg: 'bg-orange-500/15',  text: 'text-orange-400',   border: 'border-orange-500/30' }, // Realizada - Reprovada (MKT)
  14: { bg: 'bg-purple-500/15',  text: 'text-purple-300',   border: 'border-purple-500/30' },  // Realizada - Aprovada
  15: { bg: 'bg-amber-500/15',   text: 'text-amber-400',    border: 'border-amber-500/30' },   // Info Pendentes
  18: { bg: 'bg-orange-500/15',  text: 'text-orange-400',   border: 'border-orange-500/30' }, // Realizada - Reprovada (GR)
  19: { bg: 'bg-sky-500/15',     text: 'text-sky-400',      border: 'border-sky-500/30' },     // Realizada - Aprovada (GR)
  20: { bg: 'bg-teal-500/15',    text: 'text-teal-400',     border: 'border-teal-500/30' },    // Aprovada com Pagamento
  21: { bg: 'bg-emerald-500/15', text: 'text-emerald-400',  border: 'border-emerald-500/30' }, // Finalizada - Sem Investimento
  22: { bg: 'bg-teal-500/15',    text: 'text-teal-400',     border: 'border-teal-500/30' },    // Investimento Aprovado
  23: { bg: 'bg-emerald-500/15', text: 'text-emerald-400',  border: 'border-emerald-500/30' }, // Finalizada Pago
};

const FALLBACK: StatusMeta = {
  bg: 'bg-gray-500/15', text: 'text-gray-400', border: 'border-gray-500/30',
};

interface Props {
  statusId: number;
  statusNome: string;
}

export default function StatusBadge({ statusId, statusNome }: Props) {
  const meta = STATUS_MAP[statusId] ?? FALLBACK;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border whitespace-nowrap
        ${meta.bg} ${meta.text} ${meta.border}`}
    >
      {statusNome}
    </span>
  );
}
