export interface Acao {
  acao_id: number;
  dt_acao: string | null;
  consultor: string;
  gerente_regional: string;
  gerente_unidade: string;
  unidade: string;
  filial: string;
  municipio: string;
  atividade: string;
  publico_previsto: number;
  vlr_previsto_ar: number;
  vlr_previsto_fornecedor: number;
  status_id: number;
  status_nome: string;
  reprogramada: string | null;
  reajuste: string | null;
  vlr_investido_ar: number | null;
  vlr_investido_fornecedor: number | null;
  dtm: string | null;
  tripe: string | null;
  produtos: string | null;
  culturas: string | null;
  descricao_tp_acao: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface StatusItem {
  status_id: number;
  nome: string;
  ordem: number;
}

export type PgdAcaoVisao = 'GD' | 'COM' | 'GER' | 'ADM' | null;

export interface AuthUser {
  login: string;
  name: string;
  email: string;
  picture: string | null;
  role: string | null;
  priv_admin: string;
  com_cargo: string | null;
  pgd_acao_visao: PgdAcaoVisao;
  gerente_login: string | null;
  permissoes: number[];
  must_change_password: boolean;
}

export interface LoginResponse {
  access_token: string;
  user: AuthUser;
}
