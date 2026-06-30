import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';

describe('ActionsController (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  // Mock do pool de conexões com o banco para testar a lógica sem depender do DB
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [{ next_id: 100 }] }),
      release: jest.fn(),
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PG_POOL)
      .useValue(mockPool)
      .compile();

    app = moduleFixture.createNestApplication();
    jwtService = new JwtService({ secret: 'pgd_jwt_secret_2026' });
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createToken = (payload: any) => {
    return jwtService.sign({
      sub: 'test.user',
      name: 'Test User',
      email: 'test@example.com',
      ...payload,
    });
  };

  it('/actions/:id/status (PATCH) - GD sem justificativa (ERRO 400)', async () => {
    // Simula a ação existindo no banco
    mockPool.query.mockResolvedValueOnce({
      rows: [{ acao_id: 1, status_id: 1, autor_email: 'autor@ex.com', gerente_email: 'ger@ex.com' }]
    });

    const token = createToken({
      pgd_acao_visao: 'GD',
      priv_admin: 'N',
      permissoes: [8] // GD pode enviar para reprovada
    });

    const response = await request(app.getHttpServer())
      .patch('/actions/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status_id: 8 });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Justificativa obrigatória para esta transição');
  });

  it('/actions/:id/status (PATCH) - ADM Bypass de Permissão (SUCESSO)', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ acao_id: 1, status_id: 1, autor_email: 'autor@ex.com', gerente_email: 'ger@ex.com' }]
    });

    // Mock das queries seguintes dentro da transaction
    const mockClient = {
      query: jest.fn().mockImplementation((query) => {
        if (query.includes('MAX(acao_status_id)')) return Promise.resolve({ rows: [{ next_id: 2 }] });
        if (query.includes('pgd_status')) return Promise.resolve({ rows: [{ nome: 'Teste' }] });
        return Promise.resolve({ rows: [] });
      }),
      release: jest.fn(),
    };
    mockPool.connect.mockResolvedValueOnce(mockClient);

    const token = createToken({
      pgd_acao_visao: 'ADM', // God mode
      priv_admin: 'S',
      permissoes: [] // Sem permissões no JWT
    });

    const response = await request(app.getHttpServer())
      .patch('/actions/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status_id: 20 }); // Aprovada com pagamento

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('/actions/:id/status (PATCH) - GER tenta ir pra status não permitido (ERRO 403)', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ acao_id: 1, status_id: 1, autor_email: 'autor@ex.com', gerente_email: 'ger@ex.com' }]
    });

    const token = createToken({
      pgd_acao_visao: 'GER',
      priv_admin: 'N',
      permissoes: [20] // Ele fingiu ter a permissão de ADM, mas a máquina de estado bloqueia a transição do status 1 pro 20
    });

    const response = await request(app.getHttpServer())
      .patch('/actions/1/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ status_id: 20 });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('não permitida');
  });
});
