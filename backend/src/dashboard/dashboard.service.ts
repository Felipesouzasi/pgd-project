import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';

// ── Categorização oficial de status (pgd_status) ────────────────────────────────
// Baseado no mapeamento usado em StatusBadge.tsx (frontend), única fonte de verdade.
const STATUS_FINALIZADA   = [11, 21, 23];              // Finalizada - Está Pago / Sem Investimento / Pago
const STATUS_PLANEJADA    = [4, 10, 12];                // Planejada / Com Reajuste / Reprogramada
const STATUS_REPROVADA    = [7, 8, 9, 13, 18];          // Cancelada / Reprovada (GR/MKT) / Recusada
const STATUS_EM_ANDAMENTO = [1, 2, 3, 5, 14, 15, 19, 20, 22]; // Aguardando / Em Aprovação / Em Análise / Realizada - Aprovada / etc.
const STATUS_ABERTA = [...STATUS_PLANEJADA, ...STATUS_EM_ANDAMENTO]; // ainda não finalizada/cancelada = "em aberto"

const safe = async (pool: Pool, sql: string, params: unknown[] = []) => {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    console.error('[Dashboard] query error:', (err as Error).message);
    return [];
  }
};

/** Converte campos numéricos vindos do pg (bigint/numeric chegam como string) */
function toNum<T extends Record<string, unknown>>(rows: T[], keys: string[]): T[] {
  return rows.map((r) => {
    const copy = { ...r } as Record<string, unknown>;
    for (const k of keys) copy[k] = Number(copy[k] ?? 0);
    return copy as T;
  });
}

interface Filters { filial?: string; ano?: string; tp_acao?: string; dt_inicio?: string; dt_fim?: string; }

@Injectable()
export class DashboardService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getKpis(filters: Filters) {
    const where = this.buildWhere(filters);
    const [row] = await safe(this.pool, `
      SELECT
        COUNT(*)                                            AS total_acoes,
        COALESCE(SUM(vlr_previsto_ar),0)                    AS total_previsto_ar,
        COALESCE(SUM(vlr_investido_ar),0)                   AS total_investido_ar,
        COALESCE(SUM(vlr_previsto_fornecedor),0)            AS total_previsto_forn,
        COALESCE(SUM(vlr_investido_fornecedor),0)           AS total_investido_forn,
        COALESCE(SUM(publico_previsto),0)                    AS total_publico_previsto,
        COALESCE(SUM(publico_realizado),0)                   AS total_publico_realizado,
        COUNT(*) FILTER (WHERE status_id = ANY($${where.params.length+1}))  AS finalizadas,
        COUNT(*) FILTER (WHERE status_id = ANY($${where.params.length+2}))  AS planejadas,
        -- "em andamento" aqui = tudo que ainda está em aberto (planejada + em análise/aprovação/etc),
        -- ou seja, tudo que não foi finalizado nem reprovado/cancelado
        COUNT(*) FILTER (WHERE status_id = ANY($${where.params.length+3}))  AS em_andamento,
        COUNT(*) FILTER (WHERE status_id = ANY($${where.params.length+4}))  AS reprovadas,
        -- conversão de público justa: só sobre ações já finalizadas (que de fato aconteceram)
        COALESCE(SUM(publico_previsto)  FILTER (WHERE status_id = ANY($${where.params.length+1})),0) AS publico_previsto_finalizadas,
        COALESCE(SUM(publico_realizado) FILTER (WHERE status_id = ANY($${where.params.length+1})),0) AS publico_realizado_finalizadas
      FROM vw_pgd_acao
      ${where.clause}
    `, [...where.params, STATUS_FINALIZADA, STATUS_PLANEJADA, STATUS_ABERTA, STATUS_REPROVADA]);

    return toNum([row ?? {}], [
      'total_acoes','total_previsto_ar','total_investido_ar','total_previsto_forn','total_investido_forn',
      'total_publico_previsto','total_publico_realizado','finalizadas','planejadas','em_andamento','reprovadas',
      'publico_previsto_finalizadas','publico_realizado_finalizadas',
    ])[0];
  }

  async getPorStatus(filters: Filters) {
    const where = this.buildWhere(filters);
    const rows = await safe(this.pool, `
      SELECT
        status_id,
        REGEXP_REPLACE(status_nome, '^\\d+-', '') AS status,
        COUNT(*) AS total
      FROM vw_pgd_acao
      ${where.clause}
      GROUP BY status_id, status_nome
      ORDER BY total DESC
    `, where.params);
    return toNum(rows, ['status_id', 'total']);
  }

  async getPorMes(filters: Filters) {
    const where = this.buildWhere(filters, 'dt_acao IS NOT NULL');
    // Se o front não mandou um intervalo de datas explícito, cai no fallback:
    // pega os 18 meses mais recentes (DESC) e reordena ASC — evita que ações com
    // data cadastrada errada (ex: ano 2000) poluam o eixo do tempo.
    const hasExplicitRange = Boolean(filters.dt_inicio || filters.dt_fim);
    const rows = await safe(this.pool, hasExplicitRange ? `
      SELECT
        TO_CHAR(DATE_TRUNC('month', dt_acao), 'Mon/YY') AS mes,
        DATE_TRUNC('month', dt_acao) AS mes_ordem,
        COUNT(*)                                  AS total,
        COALESCE(SUM(vlr_investido_ar),0)         AS vlr_ar,
        COALESCE(SUM(vlr_investido_fornecedor),0) AS vlr_forn
      FROM vw_pgd_acao
      ${where.clause}
      GROUP BY 1,2
      ORDER BY 2 ASC
    ` : `
      SELECT * FROM (
        SELECT
          TO_CHAR(DATE_TRUNC('month', dt_acao), 'Mon/YY') AS mes,
          DATE_TRUNC('month', dt_acao) AS mes_ordem,
          COUNT(*)                                  AS total,
          COALESCE(SUM(vlr_investido_ar),0)         AS vlr_ar,
          COALESCE(SUM(vlr_investido_fornecedor),0) AS vlr_forn
        FROM vw_pgd_acao
        ${where.clause}
        GROUP BY 1,2
        ORDER BY 2 DESC
        LIMIT 18
      ) sub
      ORDER BY mes_ordem ASC
    `, where.params);
    return toNum(rows, ['total', 'vlr_ar', 'vlr_forn']);
  }

  async getPorTipo(filters: Filters) {
    const where = this.buildWhere(filters);
    const rows = await safe(this.pool, `
      SELECT
        CASE
          WHEN tp_acao = 'DT'    THEN 'Distribuição'
          WHEN tp_acao = 'R'     THEN 'Redistribuição'
          WHEN tp_acao = 'DINAC' THEN 'DINAC'
          ELSE COALESCE(tp_acao, 'Não informado')
        END AS tipo,
        COUNT(*)                          AS total,
        COALESCE(SUM(vlr_investido_ar),0) AS vlr_ar
      FROM vw_pgd_acao
      ${where.clause}
      GROUP BY 1
      ORDER BY total DESC
    `, where.params);
    return toNum(rows, ['total', 'vlr_ar']);
  }

  async getPorFilial(filters: Filters) {
    const where = this.buildWhere(filters);
    const rows = await safe(this.pool, `
      SELECT
        COALESCE(filial,'Sem filial') AS filial,
        COUNT(*)                          AS total,
        COALESCE(SUM(vlr_investido_ar),0) AS vlr_ar
      FROM vw_pgd_acao
      ${where.clause}
      GROUP BY 1
      ORDER BY total DESC
    `, where.params);
    // "Sem filial" é dado ausente, não uma filial real — não faz sentido competir
    // visualmente com as filiais de verdade num gráfico de barras.
    const semFilial = rows.find((r) => r.filial === 'Sem filial');
    const comFilial = rows.filter((r) => r.filial !== 'Sem filial');
    return {
      filiais: toNum(comFilial, ['total', 'vlr_ar']),
      sem_filial: toNum([semFilial ?? { total: 0, vlr_ar: 0 }], ['total', 'vlr_ar'])[0],
    };
  }

  async getTopConsultores(filters: Filters) {
    const where = this.buildWhere(filters);
    const rows = await safe(this.pool, `
      SELECT
        COALESCE(consultor,'Não informado') AS consultor,
        COUNT(*)                                                       AS total,
        COALESCE(SUM(vlr_investido_ar),0)                              AS vlr_ar,
        COUNT(*) FILTER (WHERE status_id = ANY($${where.params.length+1})) AS finalizadas
      FROM vw_pgd_acao
      ${where.clause}
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 10
    `, [...where.params, STATUS_FINALIZADA]);
    return toNum(rows, ['total', 'vlr_ar', 'finalizadas']);
  }

  async getTopProdutos(filters: Filters) {
    const yearFilter   = filters.ano     ? `AND EXTRACT(YEAR FROM a.dt_acao) = ${Number(filters.ano)}` : '';
    const filialFilter = filters.filial  ? `AND f.filial ILIKE '%${filters.filial.replace(/'/g,'')}%'` : '';
    const tpFilter     = filters.tp_acao ? `AND a.tp_acao = '${filters.tp_acao.replace(/'/g,'')}'`     : '';
    const rows = await safe(this.pool, `
      SELECT p.produto AS produto, COUNT(*) AS total
      FROM pgd_acao_produto ap
      JOIN pgd_produto p ON p.produto_id = ap.produto_id
      JOIN pgd_acao a ON a.acao_id = ap.acao_id
      LEFT JOIN sap_view.vw_filial f ON a.filial_id = f.cod_filial
      WHERE 1=1 ${yearFilter} ${filialFilter} ${tpFilter}
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 10
    `);
    return toNum(rows, ['total']);
  }

  async getTopCulturas(filters: Filters) {
    const yearFilter = filters.ano ? `AND EXTRACT(YEAR FROM a.dt_acao) = ${Number(filters.ano)}` : '';
    const rows = await safe(this.pool, `
      SELECT c.cultura_nome AS cultura, COUNT(*) AS total
      FROM pgd_acao_cultura ac
      JOIN pgd_cultura c ON c.cultura_id = ac.cultura_id
      JOIN pgd_acao a ON a.acao_id = ac.acao_id
      WHERE 1=1 ${yearFilter}
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 8
    `);
    return toNum(rows, ['total']);
  }

  async getPorRegional(filters: Filters) {
    const where = this.buildWhere(filters);
    const rows = await safe(this.pool, `
      SELECT
        COALESCE(gerente_regional, 'Sem regional') AS regional,
        COUNT(*)                          AS total,
        COALESCE(SUM(vlr_investido_ar),0) AS vlr_ar
      FROM vw_pgd_acao
      ${where.clause}
      GROUP BY 1
      ORDER BY total DESC
      LIMIT 12
    `, where.params);
    return toNum(rows, ['total', 'vlr_ar']);
  }

  /** Prazos de execução: ações "em aberto" (não finalizadas/canceladas) por proximidade da data. */
  async getPrazos(filters: Filters) {
    const where = this.buildWhere(filters, undefined, STATUS_ABERTA);
    const [row] = await safe(this.pool, `
      SELECT
        COUNT(*)                                                                              AS total_aberto,
        COUNT(*) FILTER (WHERE dt_acao < CURRENT_DATE)                                        AS vencidas,
        COUNT(*) FILTER (WHERE dt_acao >= CURRENT_DATE AND dt_acao <= CURRENT_DATE + 7)        AS vence_7,
        COUNT(*) FILTER (WHERE dt_acao >  CURRENT_DATE + 7  AND dt_acao <= CURRENT_DATE + 14)  AS vence_14,
        COUNT(*) FILTER (WHERE dt_acao >  CURRENT_DATE + 14 AND dt_acao <= CURRENT_DATE + 30)  AS vence_30,
        COUNT(*) FILTER (WHERE dt_acao > CURRENT_DATE + 30 OR dt_acao IS NULL)                 AS vence_depois,
        MIN(dt_acao) FILTER (WHERE dt_acao < CURRENT_DATE)                                     AS vencida_mais_antiga
      FROM vw_pgd_acao
      ${where.clause}
    `, where.params);

    const r = toNum([row ?? {}], ['total_aberto', 'vencidas', 'vence_7', 'vence_14', 'vence_30', 'vence_depois'])[0] as Record<string, unknown>;

    let diasAtraso = 0;
    if (r.vencida_mais_antiga) {
      const dias = Math.floor((Date.now() - new Date(String(r.vencida_mais_antiga)).getTime()) / 86_400_000);
      diasAtraso = Math.max(dias, 0);
    }
    return { ...r, dias_atraso_max: diasAtraso };
  }

  async getFiliais() {
    return safe(this.pool, `SELECT DISTINCT filial FROM vw_pgd_acao WHERE filial IS NOT NULL ORDER BY filial`);
  }

  async getAnos() {
    return safe(this.pool, `SELECT DISTINCT EXTRACT(YEAR FROM dt_acao)::int AS ano FROM vw_pgd_acao WHERE dt_acao IS NOT NULL ORDER BY 1 DESC LIMIT 5`);
  }

  private buildWhere(filters: Filters, extraRaw?: string, statusIn?: number[]) {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (filters.filial)    { params.push(`%${filters.filial}%`); conds.push(`filial ILIKE $${params.length}`); }
    if (filters.ano)       { params.push(Number(filters.ano));    conds.push(`EXTRACT(YEAR FROM dt_acao) = $${params.length}`); }
    if (filters.tp_acao)   { params.push(filters.tp_acao);        conds.push(`tp_acao = $${params.length}`); }
    if (filters.dt_inicio) { params.push(filters.dt_inicio);      conds.push(`dt_acao >= $${params.length}`); }
    if (filters.dt_fim)    { params.push(filters.dt_fim);         conds.push(`dt_acao <= $${params.length}`); }
    if (extraRaw) conds.push(extraRaw);
    if (statusIn) { params.push(statusIn); conds.push(`status_id = ANY($${params.length})`); }
    return {
      clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
      params,
    };
  }
}
