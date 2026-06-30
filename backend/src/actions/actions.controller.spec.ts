import { Test, TestingModule } from '@nestjs/testing';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { PdfService } from './pdf.service';
import { JwtUser } from '../common/decorators/current-user.decorator';

describe('ActionsController', () => {
  let controller: ActionsController;
  let actionsService: jest.Mocked<Partial<ActionsService>>;
  let pdfService: jest.Mocked<Partial<PdfService>>;

  const mockUser: JwtUser = { sub: 'test', login: 'test', name: 'Test', email: 'test@ex.com', permissoes: [] };

  beforeEach(async () => {
    actionsService = {
      findAll: jest.fn().mockResolvedValue([]),
      getStatusList: jest.fn().mockResolvedValue([]),
      getFiliais: jest.fn().mockResolvedValue([]),
      getFormOptions: jest.fn().mockResolvedValue({}),
      getTiposDespesa: jest.fn().mockResolvedValue([]),
      getConsultorInfo: jest.fn().mockResolvedValue({}),
      getAtividades: jest.fn().mockResolvedValue([]),
      searchClientes: jest.fn().mockResolvedValue([]),
      getDebugInfo: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ acao_id: 1 }),
      findHistory: jest.fn().mockResolvedValue([]),
      transitionStatus: jest.fn().mockResolvedValue({ ok: true }),
      getComprovacao: jest.fn().mockResolvedValue({}),
      saveComprovacao: jest.fn().mockResolvedValue({ ok: true }),
      addDespesa: jest.fn().mockResolvedValue({ ok: true }),
      deleteDespesa: jest.fn().mockResolvedValue({ ok: true }),
      saveFileReference: jest.fn().mockResolvedValue({ ok: true }),
      remove: jest.fn().mockResolvedValue({ ok: true }),
      findOne: jest.fn().mockResolvedValue({}),
    };

    pdfService = {
      generateAcaoPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ActionsController],
      providers: [
        { provide: ActionsService, useValue: actionsService },
        { provide: PdfService, useValue: pdfService },
      ],
    }).compile();

    controller = module.get<ActionsController>(ActionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll', () => {
    controller.findAll({}, mockUser);
    expect(actionsService.findAll).toHaveBeenCalled();
  });

  it('getStatusList', () => {
    controller.getStatusList('true');
    expect(actionsService.getStatusList).toHaveBeenCalledWith(true);
  });

  it('getFiliais', () => {
    controller.getFiliais();
    expect(actionsService.getFiliais).toHaveBeenCalled();
  });

  it('getFormOptions', () => {
    controller.getFormOptions();
    expect(actionsService.getFormOptions).toHaveBeenCalled();
  });

  it('getTiposDespesa', () => {
    controller.getTiposDespesa();
    expect(actionsService.getTiposDespesa).toHaveBeenCalled();
  });

  it('getConsultorInfo', () => {
    controller.getConsultorInfo(1);
    expect(actionsService.getConsultorInfo).toHaveBeenCalledWith(1);
  });

  it('getAtividades', () => {
    controller.getAtividades('DT');
    expect(actionsService.getAtividades).toHaveBeenCalledWith('DT');
  });

  it('searchClientes', () => {
    controller.searchClientes('test');
    expect(actionsService.searchClientes).toHaveBeenCalledWith('test');
  });

  it('getDebugInfo', () => {
    controller.getDebugInfo();
    expect(actionsService.getDebugInfo).toHaveBeenCalled();
  });

  it('create success', async () => {
    await controller.create({} as any, mockUser);
    expect(actionsService.create).toHaveBeenCalled();
  });

  it('create error', async () => {
    actionsService.create.mockRejectedValueOnce(new Error('err'));
    await expect(controller.create({} as any, mockUser)).rejects.toThrow();
  });

  it('downloadPdf success', async () => {
    const res = { set: jest.fn(), end: jest.fn() };
    await controller.downloadPdf(1, res as any);
    expect(pdfService.generateAcaoPdf).toHaveBeenCalledWith(1);
    expect(res.set).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it('downloadPdf error', async () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    pdfService.generateAcaoPdf.mockRejectedValueOnce(new Error('err'));
    await controller.downloadPdf(1, res as any);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('findHistory', () => {
    controller.findHistory(1);
    expect(actionsService.findHistory).toHaveBeenCalledWith(1);
  });

  it('transitionStatus', () => {
    controller.transitionStatus(1, { status_id: 2 }, mockUser);
    expect(actionsService.transitionStatus).toHaveBeenCalledWith(1, { status_id: 2 }, mockUser);
  });

  it('getComprovacao', () => {
    controller.getComprovacao(1);
    expect(actionsService.getComprovacao).toHaveBeenCalledWith(1);
  });

  it('saveComprovacao success', async () => {
    await controller.saveComprovacao(1, {} as any, mockUser);
    expect(actionsService.saveComprovacao).toHaveBeenCalled();
  });

  it('saveComprovacao error', async () => {
    actionsService.saveComprovacao.mockRejectedValueOnce(new Error('err'));
    await expect(controller.saveComprovacao(1, {} as any, mockUser)).rejects.toThrow();
  });

  it('addDespesa success', async () => {
    await controller.addDespesa(1, {} as any);
    expect(actionsService.addDespesa).toHaveBeenCalled();
  });

  it('addDespesa error', async () => {
    actionsService.addDespesa.mockRejectedValueOnce(new Error('err'));
    await expect(controller.addDespesa(1, {} as any)).rejects.toThrow();
  });

  it('deleteDespesa', () => {
    controller.deleteDespesa(1, 2);
    expect(actionsService.deleteDespesa).toHaveBeenCalledWith(1, 2);
  });

  it('uploadFile success', async () => {
    await controller.uploadFile(1, 'campo', { filename: 'file.jpg' } as any);
    expect(actionsService.saveFileReference).toHaveBeenCalledWith(1, 'campo', 'file.jpg');
  });

  it('uploadFile no file error', async () => {
    await expect(controller.uploadFile(1, 'campo', null as any)).rejects.toThrow();
  });

  it('remove', () => {
    controller.remove(1);
    expect(actionsService.remove).toHaveBeenCalledWith(1);
  });

  it('findOne', () => {
    controller.findOne(1);
    expect(actionsService.findOne).toHaveBeenCalledWith(1);
  });
});
