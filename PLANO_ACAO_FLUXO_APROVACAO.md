# Plano de Ação — Fluxo de Aprovação, Comprovação e Permissionamento PGD
> Revisado com status reais do banco, correções de fluxo e confirmações do Felipe.

---

## 1. O que já existe (não criar)

| Recurso | Status |
|---|---|
| `pgd_status` — status_id, nome, ativo, ordem, exibe_lista | ✅ |
| `pgd_acao_status` — acao_status_id, acao_id, dt_status, detalhe, usuario, status_id | ✅ |
| `pgd_status_usuario_permissoes` — login, status_id | ✅ |
| `vw_pgd_acao` — expõe status_id, status_nome, consultor, gerente_regional, gerente_unidade | ✅ |
| `ad_user_cfg` — login, pgd_acao_visao (GD/COM/GER), gerente_login, filial | ✅ |
| JWT com `permissoes[]` (status_ids que o usuário pode mover para) | ✅ |

---

## 2. Status reais do banco (após migration já executada)

| status_id | nome | ativo | ordem | exibe_lista | ícone |
|---|---|---|---|---|---|
| 1 | AGUARDANDO VALIDAÇÃO (GR) | S | 1 | S | 🟡 fa-clock |
| 2 | AGUARDANDO VALIDAÇÃO (GU) | **N** | 2 | S | — desativado |
| 3 | EM APROVAÇÃO | S | 3 | S | 🔵 fa-clock |
| 4 | PLANEJADA | S | 4 | S | 🟢 fa-hourglass-half |
| 5 | REALIZADA - EM ANÁLISE | S | 7 | S | 🔵 fa-search |
| 7 | CANCELADA | S | 13 | **N** | 🔴 fa-ban |
| 8 | REPROVADA (GR) | S | 11 | S | 🔴 fa-times-circle |
| 9 | REALIZADA - RECUSADA (GR) | **N** | 12 | S | — desativado |
| 10 | PLANEJADA - COM REAJUSTE | **N** | 5 | S | — desativado |
| 11 | FINALIZADA - ESTÁ PAGO | S | 10 | S | 🟢 fa-check-circle |
| 12 | PLANEJADA - REPROGRAMADA | S | 6 | N | 🔵 fa-redo |
| 13 | REALIZADA - REPROVADA (MKT) | S | 8 | S | 🔴 fa-search-minus |
| 14 | REALIZADA - APROVADA | S | 9 | S | 🔵 fa-clock |
| 15 | INFO PENDENTES | S | 10 | — | 🟡 fa-exclamation-circle |
| 18 | REALIZADA - REPROVADA (GR) | S | 18 | S | 🔴 fa-times-circle |
| 19 | REALIZADA - APROVADA (GR) | S | 19 | S | 🔵 fa-check |
| 20 | APROVADA COM PAGAMENTO | S | 20 | S | 🟢 fa-file-invoice-dollar |
| 21 | FINALIZADA - SEM INVESTIMENTO | S | 21 | S | 🟢 fa-check-circle |
| 22 | INVESTIMENTO APROVADO | S | 22 | S | 🟢 fa-thumbs-up |
| 23 | FINALIZADA PAGO | S | 23 | S | 🟢 fa-check-double |

---

## 3. SQL de ajuste fino (rodar no banco)

```sql
-- Garantir exibe_lista no status 15 (INFO PENDENTES estava sem valor)
UPDATE pgd_status SET exibe_lista = 'S' WHERE status_id = 15;

-- Confirmar ordem correta (sem conflito no ordem=10)
UPDATE pgd_status SET ordem = 10 WHERE status_id = 15;
UPDATE pgd_status SET ordem = 11 WHERE status_id = 11; -- FINALIZADA - ESTÁ PAGO

SELECT status_id, nome, ativo, ordem, exibe_lista
FROM pgd_status
ORDER BY ordem;
```

---

## 4. Fluxo de estados correto (state machine)

```
Criar ação
  └─→ AGUARDANDO VALIDAÇÃO (GR) [1]
          ├─[GR reprova]──────→ REPROVADA (GR) [8]
          │                          └─[Consultor corrige e resubmete]──→ [1] (volta ao início)
          └─[GR aprova]──────→ EM APROVAÇÃO [3]   ← aguardando MKT/Tamara
                                    ├─[MKT reprova/solicita ajuste]──→ INFO PENDENTES [15]
                                    │                                       └─[Consultor ajusta]──→ EM APROVAÇÃO [3]
                                    └─[MKT aprova]──────────────────→ PLANEJADA [4]
                                                                            └─[Gerador comprova]──→ REALIZADA - EM ANÁLISE [5]
                                                                                                          ├─[GR reprova]──→ REALIZADA - REPROVADA (GR) [18]
                                                                                                          │                     └─[Gerador reajusta]──→ [5]
                                                                                                          └─[GR aprova]───→ REALIZADA - APROVADA (GR) [19]
                                                                                                                                  ├─[MKT/GU reprova]──→ REALIZADA - REPROVADA (MKT) [13]
                                                                                                                                  │                          └─[Gerador reajusta]──→ [5]
                                                                                                                                  └─[MKT/GU aprova]───→ REALIZADA - APROVADA [14]
                                                                                                                                                              └─[Tamara decide]:
                                                                                                                                                                   ├─ APROVADA COM PAGAMENTO [20]
                                                                                                                                                                   │       └─[Bruno]→ INVESTIMENTO APROVADO [22]
                                                                                                                                                                   │                       └─[Laura/Financeiro]→ FINALIZADA PAGO [23]
                                                                                                                                                                   ├─ FINALIZADA - ESTÁ PAGO [11]   ← pagamento já feito
                                                                                                                                                                   └─ FINALIZADA - SEM INVESTIMENTO [21]

CANCELADA [7] ← pode ser acionado em qualquer ponto (único status que termina o fluxo no meio)
```

**Regras:**
- Toda transição para trás (reprovação) exige `justificativa` obrigatória
- `REPROVADA (GR) [8]` e `REALIZADA - REPROVADA [18/13]` NÃO terminam a ação — retornam ao consultor/GD para correção
- Apenas `CANCELADA [7]` e os três status `FINALIZADA [11/21/23]` encerram definitivamente

---

## 5. Regras de visibilidade na grid (por perfil)

| `pgd_acao_visao` | Perfil | Filtro de ações visíveis |
|---|---|---|
| `GD` | Gerador de Demanda (DINAC) | `tp_acao = 'DINAC' AND consultor_id = $login` |
| `COM` | Consultor de Vendas (AR) | `tp_acao != 'DINAC' AND consultor_id = $login` |
| `GER` | Gerente (GR ou GU) | `consultor_id IN (SELECT login FROM ad_user_cfg WHERE gerente_login = $login)` |
| `ADM` | Admin / tamara.oliveira | sem filtro — vê tudo |

> `gerente_login` ✅ já existe em `ad_user_cfg`. Relação direta: subordinado → seu gerente imediato.

---

## 6. Botões na grid (por linha e por perfil)

| Botão | Visível para | Condição de status |
|---|---|---|
| **Visualizar** (era Editar) | GD, COM, GER, ADM | qualquer status |
| **Comprovar** (verde) | GD, COM, ADM | status_id = 4 (PLANEJADA) |
| **Analisar** (substitui Editar para gerentes) | GER, ADM | status_id IN (1, 5, 19) — onde gerente age |
| **Log** | ~~removido~~ | — |

> Botão "Editar" passa a se chamar "Visualizar" — a lógica de edição move para dentro do fluxo de status.

---

## 7. Migrations SQL necessárias

```sql
-- 1. Coluna justificativa no histórico de status
ALTER TABLE pgd_acao_status
  ADD COLUMN IF NOT EXISTS justificativa TEXT;

-- 2. Tabela de comprovação principal
CREATE TABLE IF NOT EXISTS pgd_acao_comprovacao (
  comprovacao_id        SERIAL PRIMARY KEY,
  acao_id               INT NOT NULL REFERENCES pgd_acao(acao_id),
  vlr_investido_ar      NUMERIC(15,2),
  vlr_investido_forn    NUMERIC(15,2),
  sem_vlr_investido_ar  BOOLEAN DEFAULT FALSE,
  sem_vlr_investido_forn BOOLEAN DEFAULT FALSE,
  publico_realizado     INT,
  obs                   TEXT,
  atividade_justificativa TEXT,
  usuario               VARCHAR(50) NOT NULL,
  dt_comprovacao        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(acao_id)
);

-- 3. Fotos da comprovação
CREATE TABLE IF NOT EXISTS pgd_acao_foto (
  foto_id    SERIAL PRIMARY KEY,
  acao_id    INT NOT NULL REFERENCES pgd_acao(acao_id),
  tipo       VARCHAR(50) NOT NULL, -- 'lista_presenca_1','lista_presenca_2','lista_presenca_3','rel_desenv_lavoura'
  filename   VARCHAR(255) NOT NULL,
  filepath   TEXT NOT NULL,
  usuario    VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 8. Backend NestJS — alterações e endpoints novos

### 8.1 Auth — adicionar `pgd_acao_visao` e `gerente_login` no JWT

**`auth.service.ts`** — query de usuário:
```typescript
const QUERY_USUARIO = `
  SELECT u.login, u.pswd, u.name, u.email, u.active,
         u.priv_admin, u.picture, u.role, u.phone,
         c.setor, c.filial, c.com_cargo, c.com_id_sap,
         c.pgd_acao_visao, c.gerente_login          -- ← adicionar
  FROM public.sec_users u
  LEFT JOIN public.ad_user_cfg c ON c.login = u.login
  WHERE (u.login = $1 OR u.email = $1) LIMIT 1
`;
```

Payload JWT (adicionar):
```typescript
pgd_acao_visao: user.pgd_acao_visao ?? null,
gerente_login: user.gerente_login ?? null,
```

### 8.2 Filtro de hierarquia em `findAll`

**`actions.service.ts`** — `findAll(query, user)`:
```typescript
private buildHierarchyWhere(user: JwtPayload, params: unknown[]): string {
  switch (user.pgd_acao_visao) {
    case 'GD':
      params.push(user.sub);
      return `tp_acao = 'DINAC' AND consultor_id = $${params.length}`;
    case 'COM':
      params.push(user.sub);
      return `tp_acao != 'DINAC' AND consultor_id = $${params.length}`;
    case 'GER':
      params.push(user.sub);
      return `consultor_id IN (
        SELECT login FROM ad_user_cfg WHERE gerente_login = $${params.length}
      )`;
    default: // ADM
      return '1=1';
  }
}
```

### 8.3 `PATCH /actions/:id/status` — Transição de status

```
Body: { status_id: number, justificativa?: string }
Guards: JwtAuthGuard
```

Validações backend:
1. Ação existe — caso contrário 404
2. `user.permissoes.includes(status_id)` — caso contrário 403
3. Transição válida conforme state machine (tabela de transições permitidas)
4. `justificativa` obrigatória quando `status_id IN (8, 15, 13, 18)` (reprovações)

```typescript
// INSERT no histórico
INSERT INTO pgd_acao_status (acao_status_id, acao_id, dt_status, detalhe, usuario, status_id, justificativa)
VALUES (next_id, acao_id, NOW(), $detalhe, $usuario, $status_id, $justificativa)

// UPDATE o status atual na pgd_acao (confirmar se coluna existe ou se vem de view)
```

### 8.4 `GET /actions/:id/history` — Histórico de status

```sql
SELECT pas.acao_status_id, pas.dt_status, ps.nome AS status_nome,
       pas.usuario, pas.detalhe, pas.justificativa
FROM pgd_acao_status pas
JOIN pgd_status ps ON ps.status_id = pas.status_id
WHERE pas.acao_id = $1
ORDER BY pas.dt_status DESC
```

### 8.5 `POST /actions/:id/comprovacao` — Enviar comprovação

```
Body: { vlr_investido_ar, vlr_investido_forn, publico_realizado, obs, atividade_justificativa,
        sem_vlr_investido_ar, sem_vlr_investido_forn }
Guards: JwtAuthGuard
Efeito:
  1. UPSERT em pgd_acao_comprovacao
  2. Transição automática status → 5 (REALIZADA - EM ANÁLISE)
```

### 8.6 `POST /actions/:id/foto` — Upload de foto

```
Body: multipart — { tipo: 'lista_presenca_1'|'2'|'3'|'rel_desenv_lavoura', file }
Salvar em: /uploads/pgd/fotos/{acao_id}/{tipo}_{timestamp}.{ext}
INSERT em pgd_acao_foto
```

---

## 9. Frontend — componentes e páginas

### 9.1 `StatusBadge.tsx` — mapeamento completo

```typescript
const STATUS_MAP: Record<number, { bg: string; text: string; label: string; icon: string }> = {
  1:  { bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: 'Aguard. Validação (GR)',    icon: 'Clock' },
  3:  { bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'Em Aprovação',               icon: 'Clock' },
  4:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Planejada',                  icon: 'Hourglass' },
  5:  { bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'Realizada - Em Análise',     icon: 'Search' },
  7:  { bg: 'bg-rose-500/15',    text: 'text-rose-400',    label: 'Cancelada',                  icon: 'Ban' },
  8:  { bg: 'bg-rose-500/15',    text: 'text-rose-400',    label: 'Reprovada (GR)',             icon: 'XCircle' },
  11: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Finalizada - Está Pago',     icon: 'CheckCircle2' },
  12: { bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'Planejada - Reprogramada',   icon: 'RefreshCw' },
  13: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    label: 'Realiz. Reprovada (MKT)',    icon: 'SearchX' },
  14: { bg: 'bg-blue-500/15',    text: 'text-blue-400',    label: 'Realizada - Aprovada',       icon: 'Clock' },
  15: { bg: 'bg-amber-500/15',   text: 'text-amber-400',   label: 'Info Pendentes',             icon: 'AlertCircle' },
  18: { bg: 'bg-rose-500/15',    text: 'text-rose-400',    label: 'Realiz. Reprovada (GR)',     icon: 'XCircle' },
  19: { bg: 'bg-sky-500/15',     text: 'text-sky-400',     label: 'Realiz. Aprovada (GR)',      icon: 'CheckCheck' },
  20: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Aprovada com Pagamento',     icon: 'FileCheck' },
  21: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Finalizada - Sem Invest.',   icon: 'CheckCircle2' },
  22: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Investimento Aprovado',      icon: 'ThumbsUp' },
  23: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Finalizada Pago',            icon: 'BadgeCheck' },
};
```

### 9.2 Grid — botões por linha

```typescript
const { pgd_acao_visao } = useAuth();

// Por linha:
const isOwner = pgd_acao_visao === 'GD' || pgd_acao_visao === 'COM';
const isGerente = pgd_acao_visao === 'GER';

const showComprovar = isOwner && row.status_id === 4;
const showAnalisar  = isGerente && [1, 5, 19].includes(row.status_id);
const showVisualizar = true; // sempre visível (ex-"Editar")
// Log: removido
```

### 9.3 `DetalheAcao.tsx` — Analisar + Aprovar/Reprovar

**Rota:** `/acoes/:id/analisar`

Layout:
- Topbar: nome da ação + `StatusBadge` + data
- Seções colapsáveis: Dados Gerais | Produtos | Culturas | Clientes
- Aba: Histórico de status (timeline vertical, mais recente no topo)
- **Footer fixo** com botões conforme status + perfil:

```typescript
// status 1 + GER (GR analisando)
<Button variant="success" onClick={() => transitar(3)}>Aprovar → MKT</Button>
<Button variant="danger"  onClick={() => setModalReprovar(true)}>Reprovar</Button>

// status 5 + GER (GR analisando realização)
<Button variant="success" onClick={() => transitar(19)}>Aprovar Realização</Button>
<Button variant="danger"  onClick={() => setModalReprovar(true)}>Reprovar Realização</Button>

// status 19 + MKT/GU
<Button variant="success" onClick={() => transitar(14)}>Aprovar</Button>
<Button variant="danger"  onClick={() => setModalReprovar(true)}>Reprovar</Button>

// status 14 + MKT (Tamara decide pagamento)
<Button onClick={() => transitar(20)}>Pagamento a Realizar</Button>
<Button onClick={() => transitar(11)}>Pagamento Já Realizado</Button>
<Button onClick={() => transitar(21)}>Sem Pagamento</Button>
```

**Modal Reprovar:**
```tsx
<textarea required minLength={10} placeholder="Descreva o motivo da reprovação..." />
```

### 9.4 `Comprovacao.tsx` — Envio pelo Gerador

**Rota:** `/acoes/:id/comprovar`

Campos:
- `vlr_investido_ar` (CurrencyInput) + checkbox "Sem investimento AR"
- `vlr_investido_fornecedor` (CurrencyInput) + checkbox "Sem investimento Fornecedor"
- `publico_realizado` (Input number)
- `obs` (Textarea)
- `atividade_justificativa` (Textarea — explicar diferenças do planejado)
- Upload: 3× lista de presença + 1× relatório de desenvolvimento (Input file)

Footer:
```tsx
<button onClick={handleEnviar}>Enviar para Análise</button>  // → status 5
<div className="w-px h-5 bg-white/10" />
<button className="text-rose-400">Cancelar</button>
```

### 9.5 Auth store — expor `pgd_acao_visao`

```typescript
// Zustand store (useAuthStore)
interface AuthState {
  user: {
    login: string;
    name: string;
    pgd_acao_visao: 'GD' | 'COM' | 'GER' | 'ADM' | null;
    gerente_login: string | null;
    permissoes: number[];
    // ...
  } | null;
}
```

---

## 10. Ordem de implementação

### Sprint 1 — Base obrigatória
1. Rodar migrations SQL (justificativa, comprovacao, foto)
2. `auth.service.ts` → adicionar `pgd_acao_visao` + `gerente_login` no JWT
3. `actions.service.ts` → `buildHierarchyWhere` em `findAll`
4. `PATCH /actions/:id/status` com validação de permissões e state machine

### Sprint 2 — Grid + Análise
5. `StatusBadge.tsx`
6. Grid: botões Visualizar / Analisar / Comprovar por perfil e status
7. `DetalheAcao.tsx` — visualização + Aprovar/Reprovar + footer dinâmico
8. Modal de justificativa

### Sprint 3 — Comprovação
9. `POST /actions/:id/comprovacao` + `POST /actions/:id/foto`
10. `Comprovacao.tsx` com uploads
11. `GET /actions/:id/history` → timeline no DetalheAcao

### Sprint 4 — Refinamento
12. Fluxos de pagamento (Tamara → Bruno → Financeiro)
13. Notificações (opcional — email ao mudar status)
14. Testes end-to-end por perfil

---

## 11. Tabela de transições permitidas (state machine backend)

```typescript
const TRANSITIONS: Record<number, number[]> = {
  1:  [3, 8, 7],    // Aguard GR → Em Aprovação | Reprovada GR | Cancelada
  3:  [4, 15, 7],   // Em Aprovação → Planejada | Info Pendentes | Cancelada
  4:  [5, 7],       // Planejada → Realizada Em Análise | Cancelada
  5:  [19, 18, 7],  // Realiz Em Análise → Aprovada GR | Reprovada GR | Cancelada
  8:  [1],          // Reprovada GR → Aguard GR (consultor corrige e resubmete)
  15: [3],          // Info Pendentes → Em Aprovação (consultor ajusta e resubmete)
  18: [5],          // Realiz Reprovada GR → Realiz Em Análise (resubmete)
  19: [14, 13, 7],  // Realiz Aprovada GR → Realiz Aprovada | Reprovada MKT | Cancelada
  13: [5],          // Realiz Reprovada MKT → Realiz Em Análise (resubmete)
  14: [20, 11, 21], // Realiz Aprovada → rotas de pagamento (Tamara)
  20: [22],         // Aprovada c/ Pagamento → Investimento Aprovado (Bruno)
  22: [23],         // Investimento Aprovado → Finalizada Pago (Financeiro)
  // 11, 21, 23 = terminais
};
```

