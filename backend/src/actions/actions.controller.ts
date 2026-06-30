import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Query, Body, Res,
  UseGuards, ParseIntPipe, HttpException, HttpStatus,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ActionsService } from './actions.service';
import { PdfService } from './pdf.service';
import { QueryActionsDto } from './dto/query-actions.dto';
import { CreateActionDto } from './dto/create-action.dto';
import { TransitionStatusDto } from './dto/transition-status.dto';
import { SaveComprovacaoDto, DespesaDto } from './dto/comprovacao.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';

const uploadStorage = diskStorage({
  destination: join(process.cwd(), 'uploads', 'pgd'),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname));
  },
});

@UseGuards(JwtAuthGuard)
@Controller('actions')
export class ActionsController {
  constructor(
    private readonly actionsService: ActionsService,
    private readonly pdfService: PdfService,
  ) {}

  @Get()
  findAll(@Query() query: QueryActionsDto, @CurrentUser() user: JwtUser) {
    return this.actionsService.findAll(query, user);
  }

  @Get('status-list')
  getStatusList(@Query('all') all?: string) {
    return this.actionsService.getStatusList(all === 'true');
  }

  @Get('filiais')
  getFiliais() {
    return this.actionsService.getFiliais();
  }

  @Get('form-options')
  getFormOptions() {
    return this.actionsService.getFormOptions();
  }

  @Get('tipos-despesa')
  getTiposDespesa() {
    return this.actionsService.getTiposDespesa();
  }

  @Get('consultor-info/:id')
  getConsultorInfo(@Param('id', ParseIntPipe) id: number) {
    return this.actionsService.getConsultorInfo(id);
  }

  @Get('atividades')
  getAtividades(@Query('tp_acao') tpAcao: string) {
    return this.actionsService.getAtividades(tpAcao ?? 'DT');
  }

  @Get('clientes')
  searchClientes(@Query('search') search: string) {
    return this.actionsService.searchClientes(search ?? '');
  }

  @Get('debug')
  getDebugInfo() {
    return this.actionsService.getDebugInfo();
  }

  @Post()
  async create(@Body() dto: CreateActionDto, @CurrentUser() user: JwtUser) {
    try {
      return await this.actionsService.create(dto, user);
    } catch (err: unknown) {
      const e = err as { message?: string; detail?: string };
      console.error('[CREATE ACTION ERROR]', e.message);
      throw new HttpException(
        { message: e.message ?? 'Erro ao criar ação', detail: e.detail },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':id/pdf')
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    try {
      const buffer = await this.pdfService.generateAcaoPdf(id);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="acao_${id}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      console.error('[PDF ERROR]', e);
      res.status(e.status ?? 500).json({ message: e.message ?? 'Erro ao gerar PDF' });
    }
  }

  @Get(':id/history')
  findHistory(@Param('id', ParseIntPipe) id: number) {
    return this.actionsService.findHistory(id);
  }

  @Patch(':id/status')
  async transitionStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TransitionStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.actionsService.transitionStatus(id, dto, user);
  }

  // ─── Comprovação ───────────────────────────────────────────────────────────

  @Get(':id/comprovacao')
  getComprovacao(@Param('id', ParseIntPipe) id: number) {
    return this.actionsService.getComprovacao(id);
  }

  @Put(':id/comprovacao')
  async saveComprovacao(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveComprovacaoDto,
    @CurrentUser() user: JwtUser,
  ) {
    try {
      return await this.actionsService.saveComprovacao(id, dto, user);
    } catch (err: unknown) {
      const e = err as { message?: string };
      throw new HttpException(
        { message: e.message ?? 'Erro ao salvar comprovação' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/despesas')
  async addDespesa(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DespesaDto,
  ) {
    try {
      return await this.actionsService.addDespesa(id, dto);
    } catch (err: unknown) {
      const e = err as { message?: string };
      throw new HttpException(
        { message: e.message ?? 'Erro ao adicionar despesa' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete(':id/despesas/:despesaId')
  deleteDespesa(
    @Param('id', ParseIntPipe) id: number,
    @Param('despesaId', ParseIntPipe) despesaId: number,
  ) {
    return this.actionsService.deleteDespesa(id, despesaId);
  }

  @Post(':id/upload')
  @UseInterceptors(FileInterceptor('file', { storage: uploadStorage }))
  async uploadFile(
    @Param('id', ParseIntPipe) id: number,
    @Query('campo') campo: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new HttpException('Arquivo não enviado', HttpStatus.BAD_REQUEST);
    return this.actionsService.saveFileReference(id, campo, file.filename);
  }

  // ─── Genéricos ─────────────────────────────────────────────────────────────

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.actionsService.remove(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.actionsService.findOne(id);
  }
}
