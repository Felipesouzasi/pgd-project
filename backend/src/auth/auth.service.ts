import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { PG_POOL } from '../database/database.module';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

const BCRYPT_ROUNDS = 12;

const QUERY_USUARIO = `
  SELECT
    u.login, u.pswd, u.name, u.email, u.active,
    u.priv_admin, u.picture, u.role, u.phone,
    c.setor, c.filial, c.com_cargo, c.com_id_sap,
    c.pgd_acao_visao, c.gerente_login
  FROM public.sec_users u
  LEFT JOIN public.ad_user_cfg c ON c.login = u.login
  WHERE (u.login = $1 OR u.email = $1)
  LIMIT 1
`;

const QUERY_PERMISSOES = `
  SELECT status_id FROM pgd_status_usuario_permissoes
  WHERE login = $1
`;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const loginInput = dto.login.trim().toLowerCase();

    const { rows: users } = await this.pool.query(QUERY_USUARIO, [loginInput]);
    const user = users[0];

    if (!user) {
      throw new UnauthorizedException('Login ou senha incorretos');
    }

    const passwordOk = this.verifyPassword(dto.password, user.pswd);

    if (!passwordOk) {
      throw new UnauthorizedException('Login ou senha incorretos');
    }

    if (user.active !== 'Y' && user.active !== 'S') {
      throw new UnauthorizedException('Usuário inativo');
    }

    // Hash legado (não-bcrypt) = primeiro acesso real, deve definir senha
    const mustChangePassword = !this.isBcrypt(user.pswd);

    const { rows: perms } = await this.pool.query(QUERY_PERMISSOES, [user.login]);
    const permissoes: number[] = perms.map((r: { status_id: number }) =>
      Number(r.status_id),
    );

    const payload = {
      sub: user.login,
      name: user.name,
      email: user.email,
      role: user.role ?? null,
      priv_admin: user.priv_admin,
      com_cargo: user.com_cargo ?? null,
      com_id_sap: user.com_id_sap ?? null,
      filial: user.filial ?? null,
      pgd_acao_visao: user.pgd_acao_visao ?? null,
      gerente_login: user.gerente_login ?? null,
      permissoes,
      must_change_password: mustChangePassword,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        login: user.login,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        priv_admin: user.priv_admin,
        com_cargo: user.com_cargo,
        pgd_acao_visao: user.pgd_acao_visao ?? null,
        gerente_login: user.gerente_login ?? null,
        permissoes,
        must_change_password: mustChangePassword,
      },
    };
  }

  async changePassword(login: string, dto: ChangePasswordDto) {
    if (dto.new_password !== dto.confirm_password) {
      throw new BadRequestException('As senhas não coincidem');
    }

    if (dto.new_password.length < 8) {
      throw new BadRequestException('A senha deve ter no mínimo 8 caracteres');
    }

    const hash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);

    await this.pool.query(
      `UPDATE public.sec_users SET pswd = $1 WHERE login = $2`,
      [hash, login],
    );

    // Reissue token sem must_change_password
    const { rows: users } = await this.pool.query(QUERY_USUARIO, [login]);
    const user = users[0];

    const { rows: perms } = await this.pool.query(QUERY_PERMISSOES, [login]);
    const permissoes: number[] = perms.map((r: { status_id: number }) =>
      Number(r.status_id),
    );

    const payload = {
      sub: user.login,
      name: user.name,
      email: user.email,
      role: user.role ?? null,
      priv_admin: user.priv_admin,
      com_cargo: user.com_cargo ?? null,
      com_id_sap: user.com_id_sap ?? null,
      filial: user.filial ?? null,
      pgd_acao_visao: user.pgd_acao_visao ?? null,
      gerente_login: user.gerente_login ?? null,
      permissoes,
      must_change_password: false,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        login: user.login,
        name: user.name,
        email: user.email,
        picture: user.picture,
        role: user.role,
        priv_admin: user.priv_admin,
        com_cargo: user.com_cargo,
        pgd_acao_visao: user.pgd_acao_visao ?? null,
        gerente_login: user.gerente_login ?? null,
        permissoes,
        must_change_password: false,
      },
    };
  }

  async forgotPassword(login: string): Promise<{ ok: boolean }> {
    const loginInput = login.trim().toLowerCase();

    const { rows: users } = await this.pool.query(QUERY_USUARIO, [loginInput]);
    const user = users[0];

    if (!user) {
      // Não vazar que usuário não existe
      return { ok: true };
    }

    const resetSecret = (process.env.JWT_SECRET ?? 'secret') + '_reset';
    const hint = (user.pswd ?? '').slice(0, 8);

    const token = this.jwtService.sign(
      { sub: user.login, purpose: 'reset', hint },
      { secret: resetSecret, expiresIn: '1h' },
    );

    const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
    const resetLink = `${appUrl}/redefinir-senha?token=${token}`;

    // Sempre loga no console para facilitar testes em dev
    console.log(`[RESET] Link para ${user.login} <${user.email}>: ${resetLink}`);

    const smtpConfigured =
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      !process.env.SMTP_USER.includes('seuemail');

    if (smtpConfigured) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: Number(process.env.SMTP_PORT ?? 587) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
          to: user.email,
          subject: 'Redefinição de senha — PGD',
          html: `
            <p>Olá, ${user.name ?? user.login}.</p>
            <p>Clique no link abaixo para criar uma nova senha. Válido por 1 hora.</p>
            <p><a href="${resetLink}">${resetLink}</a></p>
            <p>Se você não solicitou a redefinição, ignore este e-mail.</p>
          `,
        });
      } catch (mailErr) {
        console.error('[SMTP] Falha ao enviar e-mail:', mailErr);
        // Não falha o endpoint — o link está no console
      }
    }

    return { ok: true };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ ok: boolean }> {
    const resetSecret = (process.env.JWT_SECRET ?? 'secret') + '_reset';

    let payload: { sub: string; purpose: string; hint: string };
    try {
      payload = this.jwtService.verify(token, { secret: resetSecret }) as typeof payload;
    } catch {
      throw new BadRequestException('Token inválido ou expirado');
    }

    if (payload.purpose !== 'reset') {
      throw new BadRequestException('Token inválido');
    }

    const { rows: users } = await this.pool.query(QUERY_USUARIO, [payload.sub]);
    const user = users[0];

    if (!user) {
      throw new BadRequestException('Usuário não encontrado');
    }

    if (!(user.pswd ?? '').startsWith(payload.hint)) {
      throw new BadRequestException('Token já utilizado ou inválido');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('A senha deve ter no mínimo 8 caracteres');
    }

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.pool.query(
      `UPDATE public.sec_users SET pswd = $1 WHERE login = $2`,
      [hash, user.login],
    );

    return { ok: true };
  }

  private isBcrypt(hash: string): boolean {
    return /^\$2[aby]\$/.test(hash ?? '');
  }

  private verifyPassword(input: string, stored: string): boolean {
    if (!stored) return false;

    // Bcrypt
    if (this.isBcrypt(stored)) {
      try {
        return bcrypt.compareSync(input, stored);
      } catch {
        return false;
      }
    }

    // Hash legado — usuário entra com o hash diretamente (situação atual)
    if (input === stored) return true;

    // Tenta comparar senha plain contra hash legado (para migração futura)
    const buf = Buffer.from(input);
    const h = stored.toLowerCase();
    if (h.length === 64)
      return crypto.createHash('sha256').update(buf).digest('hex') === h;
    if (h.length === 40)
      return crypto.createHash('sha1').update(buf).digest('hex') === h;
    if (h.length === 32)
      return crypto.createHash('md5').update(buf).digest('hex') === h;

    return false;
  }
}
