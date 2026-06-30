import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';
import { PG_POOL } from '../database/database.module';

describe('PdfService', () => {
  let service: PdfService;
  let mockPool: any;

  beforeEach(async () => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ 
        rows: [{ 
          acao_id: 1, 
          tp_acao: 'DT', 
          dt_acao: new Date(),
          vlr_investido_ar: 100,
          vlr_investido_fornecedor: 100,
          foto_path: 'mock.jpg'
        }] 
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfService,
        { provide: PG_POOL, useValue: mockPool },
      ],
    }).compile();

    service = module.get<PdfService>(PdfService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('generateAcaoPdf', async () => {
    // Mock pdfkit to just execute callbacks and return a buffer
    jest.mock('pdfkit', () => {
      return jest.fn().mockImplementation(() => ({
        pipe: jest.fn(),
        rect: jest.fn().mockReturnThis(),
        fill: jest.fn().mockReturnThis(),
        fontSize: jest.fn().mockReturnThis(),
        font: jest.fn().mockReturnThis(),
        text: jest.fn().mockReturnThis(),
        image: jest.fn().mockReturnThis(),
        moveDown: jest.fn().mockReturnThis(),
        addPage: jest.fn().mockReturnThis(),
        on: jest.fn((event, cb) => {
          if (event === 'data') cb(Buffer.from('pdf'));
          if (event === 'end') cb();
        }),
        end: jest.fn(),
      }));
    });

    const buffer = await service.generateAcaoPdf(1);
    expect(buffer).toBeDefined();
  });
});
