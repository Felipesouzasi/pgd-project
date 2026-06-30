# PGD — Adubos Real

## Estrutura

```
PGD/
├── backend/    NestJS + pg  (porta 3001)
└── frontend/   Vite + React (porta 5173)
```

## Instalação e execução

### Backend
```bash
cd backend
npm install
npm run start:dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Endpoints disponíveis

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /api/auth/login | Login (retorna JWT) |
| GET | /api/actions | Grid de ações (paginada) |
| GET | /api/actions/:id | Detalhe de uma ação |
| GET | /api/actions/status-list | Lista de status |
| GET | /api/actions/filiais | Lista de filiais |

## Query params — GET /api/actions

| Param | Tipo | Default |
|-------|------|---------|
| page | number | 1 |
| limit | number | 50 |
| search | string | — |
| status | string | — |
| filial | string | — |
| dt_inicio | date | — |
| dt_fim | date | — |
| sort_by | string | acao_id |
| sort_dir | asc\|desc | desc |
