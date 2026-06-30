import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtUser {
  sub: string;
  name: string;
  email: string;
  role: string | null;
  priv_admin: string;
  com_cargo: string | null;
  com_id_sap: string | null;
  filial: string | null;
  pgd_acao_visao: 'GD' | 'COM' | 'GER' | 'ADM' | null;
  gerente_login: string | null;
  permissoes: number[];
  must_change_password: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser =>
    ctx.switchToHttp().getRequest().user,
);
