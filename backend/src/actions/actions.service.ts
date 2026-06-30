import {
  Injectable, Inject, NotFoundException,
  BadRequestException, ForbiddenException, OnModuleInit,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { QueryActionsDto } from './dto/query-actions.dto';
import { CreateActionDto } from './dto/create-action.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { JwtUser } from '../common/decorators/current-user.decorator';

const ALLOWED_SORT = new Set([
  'acao_id', 'dt_acao', 'consultor', 'filial', 'municipio',
  'atividade', 'vlr_previsto_ar', 'status_nome',
]);

// Status que exigem justificativa obrigatória
const REQUIRES_JUSTIFICATIVA = new Set([7, 8, 13, 15, 18]);

// State machine: status_atual → [status_destinos permitidos]
const TRANSITIONS: Record<number, number[]> = {
  1:  [4, 8, 7],
  3:  [4, 15, 7],
  4:  [5, 7],
  5:  [19, 18, 7],
  8:  [1],
  13: [5],
  15: [3],
  18: [5],
  19: [14, 13, 7],
  14: [20, 11, 21],
  20: [22],
  22: [23],
};

@Injectable()
export class ActionsService implements OnModuleInit {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Cacheado no startup — evita nested try/catch dentro de transações */
  private hasJustificativaCol = false;
  private acaoHasStatusIdCol  = false;

  async onModuleInit() {
    const check = async (table: string, column: string): Promise<boolean> => {
      try {
        const { rows } = await this.pool.query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
          [table, column],
        );
        return rows.length > 0;
      } catch { return false; }
    };
    this.hasJustificativaCol = await check('pgd_acao_status', 'justificativa');
    this.acaoHasStatusIdCol  = await check('pgd_acao', 'status_id');
    console.log('[ActionsService] hasJustificativaCol:', this.hasJustificativaCol,
      '| acaoHasStatusIdCol:', this.acaoHasStatusIdCol);
  }

  // ─── Hierarquia ────────────────────────────────────────────────────────────

  private async buildHierarchyWhere(user: JwtUser, params: unknown[]): Promise<string> {
    // ADM ou priv_admin preenchido e !== 'N' → vê tudo
    const isAdmin =
      user.pgd_acao_visao === 'ADM' ||
      user.priv_admin === 'S';

    console.log('[buildHierarchyWhere] user:', {
      sub: user.sub,
      pgd_acao_visao: user.pgd_acao_visao,
      priv_admin: user.priv_admin,
      com_id_sap: user.com_id_sap,
      isAdmin,
    });

    if (isAdmin) return '1=1';

    switch (user.pgd_acao_visao) {
      case 'GD': {
        if (!user.com_id_sap) return `1=0`;
        params.push(Number(user.com_id_sap));
        return `tp_acao = 'DINAC' AND consultor_id = $${params.length}`;
      }
      case 'COM': {
        if (!user.com_id_sap) return `1=0`;
        params.push(Number(user.com_id_sap));
        return `tp_acao != 'DINAC' AND consultor_id = $${params.length}`;
      }
      case 'GER': {
        // Verifica se o gerente tem subordinados cadastrados
        const { rows: subordinados } = await this.pool.query(
          `SELECT COUNT(*) AS cnt FROM ad_user_cfg
           WHERE gerente_login = $1 AND com_id_sap IS NOT NULL`,
          [user.sub],
        );
        if (Number(subordinados[0].cnt) === 0) {
          // Sem subordinados cadastrados → ADM fallback (mostra tudo)
          console.warn('[buildHierarchyWhere] GER sem subordinados em ad_user_cfg → mostrando tudo');
          return '1=1';
        }
        params.push(user.sub);
        return `consultor_id IN (
          SELECT com_id_sap::bigint FROM ad_user_cfg
          WHERE gerente_login = $${params.length} AND com_id_sap IS NOT NULL
        )`;
      }
      default:
        console.warn('[buildHierarchyWhere] pgd_acao_visao inesperado:', user.pgd_acao_visao, '— mostrando tudo');
        return '1=1';
    }
  }

  // ─── Grid ──────────────────────────────────────────────────────────────────

  async findAll(query: QueryActionsDto, user: JwtUser) {
    const { page, limit, search, status_id, filial, dt_inicio, dt_fim, sort_dir } = query;
    const sort_by = ALLOWED_SORT.has(query.sort_by ?? '') ? query.sort_by : 'acao_id';
    const dir = sort_dir === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const params: unknown[] = [];
    const hierWhere = await this.buildHierarchyWhere(user, params);
    const where: string[] = [hierWhere];

    if (search) {
      params.push(`%${search}%`);
      const i = params.length;
      where.push(`(consultor ILIKE $${i} OR municipio ILIKE $${i} OR filial ILIKE $${i} OR atividade ILIKE $${i} OR acao_id::text ILIKE $${i})`);
    }
    if (status_id) { params.push(status_id); where.push(`status_id = $${params.length}`); }
    if (filial)    { params.push(`%${filial}%`); where.push(`filial ILIKE $${params.length}`); }
    if (dt_inicio) { params.push(dt_inicio); where.push(`dt_acao >= $${params.length}`); }
    if (dt_fim)    { params.push(dt_fim);    where.push(`dt_acao <= $${params.length}`); }

    const whereClause = where.join(' AND ');
    const countSql = `SELECT COUNT(*) FROM vw_pgd_acao WHERE ${whereClause}`;
    const dataSql = `
      SELECT
        v.*,
        (
          SELECT STRING_AGG('- ' || p.produto, chr(10) ORDER BY p.produto)
          FROM pgd_acao_produto ap
          JOIN pgd_produto p ON p.produto_id = ap.produto_id
          WHERE ap.acao_id = v.acao_id
        ) AS produtos,
        (
          SELECT STRING_AGG('- ' || c.cultura_nome, chr(10) ORDER BY c.cultura_nome)
          FROM pgd_acao_cultura ac
          JOIN pgd_cultura c ON c.cultura_id = ac.cultura_id
          WHERE ac.acao_id = v.acao_id
        ) AS culturas
      FROM vw_pgd_acao v
      WHERE ${whereClause}
      ORDER BY ${sort_by} ${dir}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    console.log('[findAll] hierWhere:', hierWhere);
    console.log('[findAll] countSQL:', countSql);
    console.log('[findAll] params:', params);

    try {
      const [countResult, dataResult] = await Promise.all([
        this.pool.query(countSql, params),
        this.pool.query(dataSql, [...params, limit, offset]),
      ]);

      const total = Number(countResult.rows[0].count);
      console.log('[findAll] total rows:', total);

      return {
        data: dataResult.rows,
        meta: {
          total,
          page, limit,
          total_pages: Math.ceil(total / limit),
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[findAll] DB error:', msg);
      throw new Error(`DB error: ${msg}`);
    }
  }

  async findOne(id: number) {
    const { rows } = await this.pool.query(
      `SELECT * FROM vw_pgd_acao WHERE acao_id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const acao = rows[0];

    const [prodResult, cultResult, cliResult] = await Promise.all([
      this.pool.query(
        `SELECT ap.produto_id, p.produto, ap.fornecedor_rtv, ap.planejada, ap.trabalhado
         FROM pgd_acao_produto ap
         JOIN pgd_produto p ON p.produto_id = ap.produto_id
         WHERE ap.acao_id = $1 ORDER BY p.produto`,
        [id],
      ),
      this.pool.query(
        `SELECT ac.cultura_id, c.cultura_nome, ac.planejada, ac.trabalhado
         FROM pgd_acao_cultura ac
         JOIN pgd_cultura c ON c.cultura_id = ac.cultura_id
         WHERE ac.acao_id = $1 ORDER BY c.cultura_nome`,
        [id],
      ),
      this.pool.query(
        `SELECT cliente_id, cliente_nome FROM pgd_acao_cliente WHERE acao_id = $1`,
        [id],
      ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    return {
      ...acao,
      produtos_detalhe: prodResult.rows,
      culturas_detalhe: cultResult.rows,
      clientes: (cliResult as { rows: Record<string, unknown>[] }).rows,
    };
  }

  // ─── Histórico de status ───────────────────────────────────────────────────

  async findHistory(acaoId: number) {
    // Tenta com justificativa; se coluna não existir, retorna sem ela
    try {
      const { rows } = await this.pool.query(
        `SELECT
           pas.acao_status_id,
           pas.dt_status,
           pas.status_id,
           ps.nome  AS status_nome,
           pas.usuario,
           pas.detalhe,
           pas.justificativa
         FROM pgd_acao_status pas
         JOIN pgd_status ps ON ps.status_id = pas.status_id
         WHERE pas.acao_id = $1
         ORDER BY pas.dt_status DESC`,
        [acaoId],
      );
      return rows;
    } catch {
      const { rows } = await this.pool.query(
        `SELECT
           pas.acao_status_id,
           pas.dt_status,
           pas.status_id,
           ps.nome  AS status_nome,
           pas.usuario,
           pas.detalhe,
           NULL AS justificativa
         FROM pgd_acao_status pas
         JOIN pgd_status ps ON ps.status_id = pas.status_id
         WHERE pas.acao_id = $1
         ORDER BY pas.dt_status DESC`,
        [acaoId],
      );
      return rows;
    }
  }

  // ─── Transição de status ───────────────────────────────────────────────────

  async transitionStatus(id: number, dto: TransitionStatusDto, user: JwtUser) {
    const { rows: acoes } = await this.pool.query(
      `SELECT acao_id, status_id FROM vw_pgd_acao WHERE acao_id = $1`,
      [id],
    );
    if (!acoes[0]) throw new NotFoundException(`Ação ${id} não encontrada`);

    const currentStatusId: number = Number(acoes[0].status_id);
    const targetStatusId: number = dto.status_id;

    // ADM pode forçar qualquer transição — bypass de permissões e state machine
    const isAdmin =
      user.pgd_acao_visao === 'ADM' ||
      user.priv_admin === 'S';

    if (!isAdmin) {
      if (!user.permissoes.includes(targetStatusId)) {
        throw new ForbiddenException(
          `Sem permissão para mover para o status ${targetStatusId}`,
        );
      }
      const allowed = TRANSITIONS[currentStatusId] ?? [];
      if (!allowed.includes(targetStatusId)) {
        throw new BadRequestException(
          `Transição de ${currentStatusId} para ${targetStatusId} não permitida`,
        );
      }
    }

    if (REQUIRES_JUSTIFICATIVA.has(targetStatusId) && !dto.justificativa?.trim()) {
      throw new BadRequestException('Justificativa obrigatória para esta transição');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(12345680)`);

      const { rows: maxRows } = await client.query(
        `SELECT COALESCE(MAX(acao_status_id), 0) + 1 AS next_id FROM pgd_acao_status`,
      );
      const nextId = Number(maxRows[0].next_id);

      const { rows: statusRows } = await client.query(
        `SELECT nome FROM pgd_status WHERE status_id = $1`,
        [targetStatusId],
      );
      const statusNome = statusRows[0]?.nome ?? String(targetStatusId);

      // Usa flag cacheada no startup — sem nested try/catch dentro da transação
      if (this.hasJustificativaCol) {
        await client.query(
          `INSERT INTO pgd_acao_status
             (acao_status_id, acao_id, dt_status, detalhe, usuario, status_id, justificativa)
           VALUES ($1, $2, NOW(), $3, $4, $5, $6)`,
          [nextId, id, statusNome, user.sub, targetStatusId, dto.justificativa ?? null],
        );
      } else {
        await client.query(
          `INSERT INTO pgd_acao_status
             (acao_status_id, acao_id, dt_status, detalhe, usuario, status_id)
           VALUES ($1, $2, NOW(), $3, $4, $5)`,
          [nextId, id, statusNome, user.sub, targetStatusId],
        );
      }

      // Atualiza status_id na tabela pgd_acao se a coluna existir
      if (this.acaoHasStatusIdCol) {
        await client.query(
          `UPDATE pgd_acao SET status_id = $1 WHERE acao_id = $2`,
          [targetStatusId, id],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return { ok: true, novo_status_id: targetStatusId };
  }

  // ─── Listas de suporte ─────────────────────────────────────────────────────

  async getStatusList(all = false) {
    // all=true: retorna todos os status (inclusive inativos/ocultos) — uso exclusivo do ADM
    if (all) {
      const { rows } = await this.pool.query(
        `SELECT status_id, nome, ordem FROM pgd_status ORDER BY ordem, status_id`,
      );
      return rows;
    }
    // exibe_lista pode não existir na tabela — fallback sem esse filtro
    try {
      const { rows } = await this.pool.query(
        `SELECT status_id, nome, ordem FROM pgd_status WHERE ativo = 'S' AND exibe_lista = 'S' ORDER BY ordem`,
      );
      return rows;
    } catch {
      const { rows } = await this.pool.query(
        `SELECT status_id, nome, ordem FROM pgd_status WHERE ativo = 'S' ORDER BY ordem`,
      );
      return rows;
    }
  }

  async getFiliais() {
    // Tenta via view; se vazia, tenta via SAP diretamente
    try {
      const { rows } = await this.pool.query(
        `SELECT DISTINCT filial FROM vw_pgd_acao WHERE filial IS NOT NULL ORDER BY filial`,
      );
      if (rows.length > 0) return rows.map((r: { filial: string }) => r.filial);
    } catch { /* cai no fallback */ }
    try {
      const { rows } = await this.pool.query(
        `SELECT vf.filial FROM sap_view.vw_filial vf ORDER BY vf.filial`,
      );
      return rows.map((r: { filial: string }) => r.filial);
    } catch {
      return [];
    }
  }

  async getFormOptions() {
    const safe = async (sql: string, label: string) => {
      try {
        const { rows } = await this.pool.query(sql);
        console.log(`[getFormOptions] ${label}: ${rows.length} registros`);
        return rows;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[getFormOptions] ${label} FALHOU:`, msg);
        return [];
      }
    };

    const [consultores, tripes, municipios, filiais, dtms, produtos, culturas] =
      await Promise.all([
        safe(
          `SELECT distinct consultor_id, consultor as label FROM comercial.vw_consultor ORDER BY consultor`,
          'consultores',
        ),
        safe(
          `SELECT pti.id as value, concat(pt.descricao, ' - ', pti.descricao) as label
           FROM public.pgd_tripe pt
           INNER JOIN public.pgd_tripe_item pti ON pti.tripe_id = pt.id
           ORDER BY pt.descricao, pti.descricao`,
          'tripes',
        ),
        safe(
          `SELECT ibge_id as value, municipio_nome||' - '||uf as label
           FROM public.dw_ibge ORDER BY municipio_nome`,
          'municipios',
        ),
        safe(
          `SELECT vf.cod_filial as value, vf.filial as label
           FROM sap_view.vw_filial vf ORDER BY vf.filial`,
          'filiais',
        ),
        safe(
          `SELECT dtm_id as value, dtm as label FROM public.pgd_dtm WHERE dtm_id > 0 ORDER BY dtm`,
          'dtms',
        ),
        safe(
          `SELECT p.produto_id as value,
                  CONCAT(p.produto,' ( ',f.nome,' ) - ',g.grupo_produto) as label,
                  f.nome as fornecedor_rtv
           FROM pgd_produto p
           INNER JOIN pgd_fornecedor f ON f.fornecedor_id = p.fornecedor_id
           INNER JOIN pgd_grupo_produto g ON g.grupo_produto_id = p.grupo_produto_id
           ORDER BY p.produto`,
          'produtos',
        ),
        safe(
          `SELECT c.cultura_id as value,
                  CONCAT(c.cultura_nome,' (',cg.grupo_nome,') ') as label
           FROM "public".pgd_cultura c
           INNER JOIN pgd_cultura_grupo cg ON cg.grupo_id = c.grupo_id
           ORDER BY c.cultura_nome`,
          'culturas',
        ),
      ]);

    return { consultores, tripes, municipios, filiais, dtms, produtos, culturas };
  }

  async getConsultorInfo(consultorId: number) {
    try {
      const { rows } = await this.pool.query(
        `SELECT DISTINCT
           consultor_id,
           consultor,
           unidade,
           divisao_id        AS gerente_gd_id,
           divisao_gerente   AS gerente_gd,
           regional_id       AS gerente_regional_id,
           regional_gerente  AS gerente_regional,
           unidade_gerente_id,
           unidade_gerente
         FROM comercial.vw_consultor WHERE consultor_id = $1 LIMIT 1`,
        [consultorId],
      );
      return rows[0] ?? null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[getConsultorInfo]', msg);
      return null;
    }
  }

  async getAtividades(tpAcao: string) {
    try {
      const { rows } = await this.pool.query(
        `SELECT atividade_id as value, atividade as label
         FROM public.pgd_atividade
         WHERE tp_atividade LIKE $1
         ORDER BY atividade`,
        [`%${tpAcao}%`],
      );
      return rows;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[getAtividades]', msg);
      return [];
    }
  }

  async searchClientes(search: string) {
    try {
      const { rows } = await this.pool.query(
        `SELECT cod_pn::text AS value, nome AS label
         FROM (
           SELECT MIN(cod_pn) AS cod_pn, nome
           FROM sap_4hana.pn_cliente
           WHERE nome ILIKE $1
           GROUP BY nome
         ) AS registro_unico
         ORDER BY nome
         LIMIT 50`,
        [`%${search}%`],
      );
      return rows;
    } catch (err: unknown) {
      const e = err as { message?: string };
      console.error('[SEARCH CLIENTES]', e.message);
      return [];
    }
  }

  // ─── Diagnóstico ───────────────────────────────────────────────────────────

  async getDebugInfo() {
    const safe = async (sql: string, label: string) => {
      try {
        const { rows } = await this.pool.query(sql);
        return { ok: true, count: rows.length, sample: rows.slice(0, 3) };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: msg };
      }
    };

    const [pgdAcao, vwPgdAcao, pgdAcaoStatus, pgdStatus, adUserCfg] = await Promise.all([
      safe(`SELECT COUNT(*) as cnt FROM pgd_acao`, 'pgd_acao'),
      safe(`SELECT COUNT(*) as cnt FROM vw_pgd_acao`, 'vw_pgd_acao'),
      safe(`SELECT COUNT(*) as cnt FROM pgd_acao_status`, 'pgd_acao_status'),
      safe(`SELECT status_id, nome, ativo FROM pgd_status ORDER BY status_id LIMIT 10`, 'pgd_status'),
      safe(`SELECT login, pgd_acao_visao, com_id_sap, gerente_login FROM ad_user_cfg LIMIT 10`, 'ad_user_cfg'),
    ]);

    // Verifica colunas reais do pgd_acao_status
    const statusCols = await safe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pgd_acao_status'`,
      'pgd_acao_status_cols',
    );

    // Verifica colunas reais do pgd_status
    const pgdStatusCols = await safe(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='pgd_status'`,
      'pgd_status_cols',
    );

    return {
      pgdAcao,
      vwPgdAcao,
      pgdAcaoStatus,
      pgdStatus,
      adUserCfg,
      statusCols,
      pgdStatusCols,
    };
  }

  // ─── Criar ação ────────────────────────────────────────────────────────────

  async create(dto: CreateActionDto, user: JwtUser) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(12345678)`);

      // Colunas reais da tabela pgd_acao (sem view)
      const { rows: cols } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'pgd_acao'`,
      );
      const colNames = new Set(cols.map((r: { column_name: string }) => r.column_name));
      console.log('[create] Colunas pgd_acao:', [...colNames].join(', '));

      const { rows: maxRows } = await client.query(
        `SELECT COALESCE(MAX(acao_id), 0) + 1 AS next_id FROM pgd_acao`,
      );
      const acaoId = Number(maxRows[0].next_id);

      // Constrói record filtrando só colunas que existem na tabela
      // consultor_id vem do JWT (bigint, SAP ID numérico)
      const dtoAny = dto as unknown as Record<string, unknown>;
      const record: Record<string, unknown> = { acao_id: acaoId };

      for (const [k, v] of Object.entries(dtoAny)) {
        // Ignora campos que não são colunas da tabela ou arrays (produtos, culturas, clientes)
        if (colNames.has(k) && !Array.isArray(v)) {
          // Campos boolean → varchar(1): converte para 'S'/'N'
          record[k] = typeof v === 'boolean' ? (v ? 'S' : 'N') : v;
        }
      }

      // consultor_id: prioriza o selecionado no formulário (GER/ADM criando para qualquer consultor)
      // fallback para com_id_sap do JWT apenas quando não informado (GD/COM criando para si)
      if (!record['consultor_id'] && user.com_id_sap) {
        record['consultor_id'] = Number(user.com_id_sap);
      }

      const colList = Object.keys(record);
      const placeholders = colList.map((_, i) => `$${i + 1}`);
      const values = colList.map((k) => record[k]);

      console.log('[create] INSERT pgd_acao colunas:', colList);
      console.log('[create] INSERT pgd_acao values:', values);

      await client.query(
        `INSERT INTO pgd_acao (${colList.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values,
      );

      // Produtos
      for (const p of dto.produtos ?? []) {
        await client.query(
          `INSERT INTO pgd_acao_produto (acao_id, produto_id, fornecedor_rtv, planejada, trabalhado)
           VALUES ($1, $2, $3, $4, $5)`,
          [acaoId, p.produto_id, p.fornecedor_rtv ?? '', p.planejada ?? 'N', p.trabalhado ?? 'N'],
        );
      }
      // Culturas
      for (const c of dto.culturas ?? []) {
        await client.query(
          `INSERT INTO pgd_acao_cultura (acao_id, cultura_id, planejada, trabalhado)
           VALUES ($1, $2, $3, $4)`,
          [acaoId, c.cultura_id, c.planejada ?? 'N', c.trabalhado ?? 'N'],
        );
      }
      // Clientes
      for (const cl of dto.clientes ?? []) {
        await client.query(
          `INSERT INTO pgd_acao_cliente (acao_id, cliente_id) VALUES ($1, $2)`,
          [acaoId, cl.cliente_id],
        ).catch((e: unknown) => {
          console.warn('[create] pgd_acao_cliente falhou:', (e as Error).message);
        });
      }

      // Status inicial — tenta com justificativa; se coluna não existir, sem ela
      await client.query(`SELECT pg_advisory_xact_lock(12345679)`);
      const { rows: maxStatus } = await client.query(
        `SELECT COALESCE(MAX(acao_status_id), 0) + 1 AS next_id FROM pgd_acao_status`,
      );
      const statusId = Number(maxStatus[0].next_id);

      try {
        await client.query(
          `INSERT INTO pgd_acao_status
             (acao_status_id, acao_id, dt_status, detalhe, usuario, status_id)
           VALUES ($1, $2, NOW(), $3, $4, 1)`,
          [statusId, acaoId, 'Aguardando validação GR', user.sub],
        );
      } catch (statusErr: unknown) {
        const msg = (statusErr as Error).message;
        console.error('[create] INSERT pgd_acao_status falhou:', msg);
        throw statusErr;
      }

      await client.query('COMMIT');
      return { acao_id: acaoId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Remover ───────────────────────────────────────────────────────────────

  async remove(id: number) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const t of [
        'pgd_acao_produto', 'pgd_acao_cultura', 'pgd_acao_cliente',
        'pgd_acao_parceiro', 'pgd_contato', 'pgd_acao_foto', 'pgd_acao_status',
        'pgd_acao_comprovacao',
      ]) {
        await client.query(`DELETE FROM ${t} WHERE acao_id = $1`, [id]).catch(() => null);
      }
      const { rowCount } = await client.query(
        `DELETE FROM pgd_acao WHERE acao_id = $1`,
        [id],
      );
      await client.query('COMMIT');
      if (!rowCount) throw new NotFoundException(`Ação ${id} não encontrada`);
      return { deleted: id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Comprovação ───────────────────────────────────────────────────────────

  async getComprovacao(id: number) {
    // Query principal tenta colunas sem_vlr_*; fallback sem elas (podem não existir na view)
    let acaoQuery = `SELECT acao_id, tp_acao, consultor, filial, dt_acao, atividade,
                            vlr_previsto_ar, vlr_previsto_fornecedor,
                            vlr_investido_ar, vlr_investido_fornecedor,
                            sem_vlr_previsto_ar, sem_vlr_previsto_fornecedor,
                            sem_vlr_investido_ar, sem_vlr_investido_fornecedor,
                            publico_previsto, publico_realizado, obs, status_id, status_nome
                     FROM vw_pgd_acao WHERE acao_id = $1`;
    let acaoResRaw: { rows: Record<string, unknown>[] };
    try {
      acaoResRaw = await this.pool.query(acaoQuery, [id]);
    } catch {
      acaoResRaw = await this.pool.query(
        `SELECT acao_id, tp_acao, consultor, filial, dt_acao, atividade,
                vlr_previsto_ar, vlr_previsto_fornecedor,
                vlr_investido_ar, vlr_investido_fornecedor,
                NULL AS sem_vlr_previsto_ar, NULL AS sem_vlr_previsto_fornecedor,
                NULL AS sem_vlr_investido_ar, NULL AS sem_vlr_investido_fornecedor,
                publico_previsto, publico_realizado, obs, status_id, status_nome
         FROM vw_pgd_acao WHERE acao_id = $1`,
        [id],
      );
    }
    const [produtosRes, culturasRes, despesasRes] = await Promise.all([
      this.pool.query(
        `SELECT ap.produto_id, p.produto AS nome, f.nome AS fornecedor,
                ap.planejada, ap.trabalhado
         FROM pgd_acao_produto ap
         JOIN pgd_produto p ON p.produto_id = ap.produto_id
         JOIN pgd_fornecedor f ON f.fornecedor_id = p.fornecedor_id
         WHERE ap.acao_id = $1 ORDER BY p.produto`,
        [id],
      ),
      this.pool.query(
        `SELECT ac.cultura_id, c.cultura_nome AS nome,
                ac.planejada, ac.trabalhado
         FROM pgd_acao_cultura ac
         JOIN pgd_cultura c ON c.cultura_id = ac.cultura_id
         WHERE ac.acao_id = $1 ORDER BY c.cultura_nome`,
        [id],
      ),
      this.pool.query(
        `SELECT pdc.pgd_despesa_id, pdc.dt_despesa, pdc.tp_despesa_id,
                td.nome AS tp_despesa, pdc.vlr_despesa,
                pdc.docto_fiscal, pdc.comprovante_pagto
         FROM pgd_despesa_comprovante pdc
         LEFT JOIN pgd_tp_despesa td ON td.id = pdc.tp_despesa_id
         WHERE pdc.acao_id = $1
         ORDER BY pdc.dt_despesa, pdc.pgd_despesa_id`,
        [id],
      ).catch(() => ({ rows: [] as Record<string, unknown>[] })),
    ]);

    if (!acaoResRaw.rows[0]) throw new NotFoundException(`Ação ${id} não encontrada`);

    return {
      acao: acaoResRaw.rows[0],
      produtos: produtosRes.rows,
      culturas: culturasRes.rows,
      despesas: despesasRes.rows,
    };
  }

  async getTiposDespesa() {
    try {
      const { rows } = await this.pool.query(
        `SELECT id AS value, nome AS label FROM pgd_tp_despesa ORDER BY nome`,
      );
      return rows;
    } catch { return []; }
  }

  async saveComprovacao(id: number, dto: import('./dto/comprovacao.dto').SaveComprovacaoDto, user: import('../common/decorators/current-user.decorator').JwtUser) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Campos atualizáveis em pgd_acao — só os que existem na tabela
      const updates: string[] = [];
      const vals: unknown[] = [];
      const push = (col: string, val: unknown) => {
        vals.push(val); updates.push(`${col} = $${vals.length}`);
      };

      if (dto.vlr_investido_ar   !== undefined) push('vlr_investido_ar',   dto.vlr_investido_ar);
      if (dto.vlr_investido_fornecedor !== undefined) push('vlr_investido_fornecedor', dto.vlr_investido_fornecedor);
      if (dto.sem_vlr_investido_ar !== undefined) push('sem_vlr_investido_ar', dto.sem_vlr_investido_ar);
      if (dto.sem_vlr_investido_fornecedor !== undefined) push('sem_vlr_investido_fornecedor', dto.sem_vlr_investido_fornecedor);
      if (dto.publico_realizado  !== undefined) push('publico_realizado',  dto.publico_realizado);
      if (dto.obs                !== undefined) push('obs',                dto.obs);

      if (updates.length) {
        vals.push(id);
        await client.query(
          `UPDATE pgd_acao SET ${updates.join(', ')} WHERE acao_id = $${vals.length}`,
          vals,
        ).catch(async (e: Error) => {
          // Colunas podem não existir — tenta coluna a coluna
          console.warn('[saveComprovacao] UPDATE batch falhou:', e.message, '— tentando coluna a coluna');
          for (let i = 0; i < updates.length; i++) {
            await client.query(
              `UPDATE pgd_acao SET ${updates[i]} WHERE acao_id = $2`,
              [vals[i], id],
            ).catch((e2: Error) => console.warn(`[saveComprovacao] coluna ${updates[i]} falhou:`, e2.message));
          }
        });
      }

      // 2. Produtos — atualiza trabalhado
      for (const p of dto.produtos ?? []) {
        await client.query(
          `UPDATE pgd_acao_produto SET trabalhado = $1 WHERE acao_id = $2 AND produto_id = $3`,
          [p.trabalhado ?? 'N', id, p.produto_id],
        );
      }

      // 3. Culturas — atualiza trabalhado
      for (const c of dto.culturas ?? []) {
        await client.query(
          `UPDATE pgd_acao_cultura SET trabalhado = $1 WHERE acao_id = $2 AND cultura_id = $3`,
          [c.trabalhado ?? 'N', id, c.cultura_id],
        );
      }

      // 4. Transição de status se solicitado
      if (dto.enviar) {
        const { rows: maxRows } = await client.query(
          `SELECT COALESCE(MAX(acao_status_id), 0) + 1 AS next_id FROM pgd_acao_status`,
        );
        const nextId = Number(maxRows[0].next_id);
        const { rows: sRows } = await client.query(
          `SELECT nome FROM pgd_status WHERE status_id = 5`,
        );
        const statusNome = sRows[0]?.nome ?? 'Em Análise';

        if (this.hasJustificativaCol) {
          await client.query(
            `INSERT INTO pgd_acao_status (acao_status_id, acao_id, dt_status, detalhe, usuario, status_id, justificativa)
             VALUES ($1, $2, NOW(), $3, $4, 5, NULL)`,
            [nextId, id, statusNome, user.sub],
          );
        } else {
          await client.query(
            `INSERT INTO pgd_acao_status (acao_status_id, acao_id, dt_status, detalhe, usuario, status_id)
             VALUES ($1, $2, NOW(), $3, $4, 5)`,
            [nextId, id, statusNome, user.sub],
          );
        }
        if (this.acaoHasStatusIdCol) {
          await client.query(`UPDATE pgd_acao SET status_id = 5 WHERE acao_id = $1`, [id]);
        }
      }

      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async addDespesa(acaoId: number, dto: import('./dto/comprovacao.dto').DespesaDto) {
    const { rows: maxRows } = await this.pool.query(
      `SELECT COALESCE(MAX(pgd_despesa_id), 0) + 1 AS next_id FROM pgd_despesa_comprovante`,
    );
    const nextId = Number(maxRows[0].next_id);
    await this.pool.query(
      `INSERT INTO pgd_despesa_comprovante
         (pgd_despesa_id, acao_id, dt_despesa, tp_despesa_id, vlr_despesa, docto_fiscal, comprovante_pagto)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [nextId, acaoId, dto.dt_despesa, dto.tp_despesa_id, dto.vlr_despesa,
       dto.docto_fiscal ?? null, dto.comprovante_pagto ?? null],
    );
    return { pgd_despesa_id: nextId };
  }

  async deleteDespesa(acaoId: number, despesaId: number) {
    const { rowCount } = await this.pool.query(
      `DELETE FROM pgd_despesa_comprovante WHERE pgd_despesa_id = $1 AND acao_id = $2`,
      [despesaId, acaoId],
    );
    if (!rowCount) throw new NotFoundException(`Despesa ${despesaId} não encontrada`);
    return { deleted: despesaId };
  }

  async saveFileReference(acaoId: number, campo: string, filename: string) {
    const allowed = ['lista_presenca', 'rel_desenv_lavoura', 'lista_presenca_2', 'lista_presenca_3'];
    if (!allowed.includes(campo)) throw new Error(`Campo inválido: ${campo}`);
    await this.pool.query(
      `UPDATE pgd_acao SET ${campo} = $1 WHERE acao_id = $2`,
      [filename, acaoId],
    );
    return { campo, filename };
  }
}
