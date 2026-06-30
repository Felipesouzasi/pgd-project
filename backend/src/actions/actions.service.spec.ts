import { Test, TestingModule } from '@nestjs/testing';
import { ActionsService } from './actions.service';
import { PG_POOL } from '../database/database.module';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtUser } from '../common/decorators/current-user.decorator';

describe('ActionsService', () => {
  let service: ActionsService;
  let mockPool: any;
  let mockClient: any;

  const mockUser = { sub: 'test', name: 'Test', email: 'test@ex.com', permissoes: [1, 2, 3], pgd_acao_visao: 'ADM', priv_admin: 'S' } as any;

  beforeEach(async () => {
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1, acao_id: 1 }], rowCount: 1 }),
      release: jest.fn(),
    };

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [{ id: 1, acao_id: 1, tp_acao: 'DT', status_id: 1, autor_email: 'a@a.com', gerente_email: 'g@g.com' }] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActionsService,
        { provide: PG_POOL, useValue: mockPool },
      ],
    }).compile();

    service = module.get<ActionsService>(ActionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll', async () => {
    await service.findAll({ pg: 1, limit: 10, search: 'test', status_id: 1 } as any, mockUser);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getStatusList', async () => {
    await service.getStatusList(true);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getFiliais', async () => {
    await service.getFiliais();
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getFormOptions', async () => {
    await service.getFormOptions();
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getTiposDespesa', async () => {
    await service.getTiposDespesa();
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getConsultorInfo', async () => {
    await service.getConsultorInfo(1);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getAtividades', async () => {
    await service.getAtividades('DT');
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('searchClientes', async () => {
    await service.searchClientes('test');
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getDebugInfo', async () => {
    await service.getDebugInfo();
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('findHistory', async () => {
    await service.findHistory(1);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('getComprovacao', async () => {
    await service.getComprovacao(1);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('deleteDespesa', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 1 });
    await service.deleteDespesa(1, 1);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('remove', async () => {
    await service.remove(1);
    expect(mockClient.query).toHaveBeenCalled();
  });

  it('findOne', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ acao_id: 1, tp_acao: 'DT' }] }) // acao
      .mockResolvedValueOnce({ rows: [] }) // produtos
      .mockResolvedValueOnce({ rows: [] }) // culturas
      .mockResolvedValueOnce({ rows: [] }); // clientes
    await service.findOne(1);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('create', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ next_id: 1 }] }) // acao_id
      .mockResolvedValueOnce({ rows: [] }) // INSERT pgd_acao
      .mockResolvedValueOnce({ rows: [{ next_id: 1 }] }) // acao_status_id
      .mockResolvedValueOnce({ rows: [] }) // INSERT pgd_acao_status
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await service.create({
      tp_acao: 'DT',
      atividade_id: 1,
      publico_previsto: 10,
      vlr_previsto_ar: 100,
      vlr_previsto_fornecedor: 100,
      produtos: [{ produto_id: 1 }],
      culturas: [{ cultura_id: 1 }],
      clientes: ['123']
    } as any, mockUser);

    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('transitionStatus - success', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [{ next_id: 1 }] }) // acao_status_id
      .mockResolvedValueOnce({ rows: [{ nome: 'PLANEJADA' }] }) // pgd_status
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await service.transitionStatus(1, { status_id: 4 }, mockUser);
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('saveComprovacao', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [] }) // UPSERT
      .mockResolvedValueOnce({ rows: [{ next_id: 1 }] }) // acao_status_id
      .mockResolvedValueOnce({ rows: [{ nome: 'EM ANÁLISE' }] }) // pgd_status
      .mockResolvedValueOnce({ rows: [] }) // INSERT status
      .mockResolvedValueOnce({ rows: [] }) // UPDATE acao
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await service.saveComprovacao(1, {
      vlr_investido_ar: 100,
      vlr_investido_fornecedor: 100,
      sem_vlr_investido_ar: 'N',
      sem_vlr_investido_forn: 'N',
      publico_realizado: 10,
      obs: 'test'
    } as any, mockUser);
    
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
  });

  it('addDespesa', async () => {
    await service.addDespesa(1, { tipo_id: 1, vlr_total: 100, fornecedor: 'test', nf_numero: '123' } as any);
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('saveFileReference', async () => {
    await service.saveFileReference(1, 'lista_presenca', 'file.jpg');
    expect(mockPool.query).toHaveBeenCalled();
  });
});
