import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

interface DashFilters { filial?: string; ano?: string; tp_acao?: string; dt_inicio?: string; dt_fim?: string; }

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('kpis')        kpis(@Query() q: DashFilters)           { return this.svc.getKpis(q); }
  @Get('por-status')  porStatus(@Query() q: DashFilters)      { return this.svc.getPorStatus(q); }
  @Get('por-mes')     porMes(@Query() q: DashFilters)         { return this.svc.getPorMes(q); }
  @Get('por-tipo')    porTipo(@Query() q: DashFilters)        { return this.svc.getPorTipo(q); }
  @Get('por-filial')  porFilial(@Query() q: DashFilters)      { return this.svc.getPorFilial(q); }
  @Get('consultores') topConsultores(@Query() q: DashFilters) { return this.svc.getTopConsultores(q); }
  @Get('produtos')    topProdutos(@Query() q: DashFilters)    { return this.svc.getTopProdutos(q); }
  @Get('culturas')    topCulturas(@Query() q: DashFilters)    { return this.svc.getTopCulturas(q); }
  @Get('regional')    porRegional(@Query() q: DashFilters)    { return this.svc.getPorRegional(q); }
  @Get('prazos')      prazos(@Query() q: DashFilters)         { return this.svc.getPrazos(q); }
  @Get('filiais')     filiais()                               { return this.svc.getFiliais(); }
  @Get('anos')        anos()                                   { return this.svc.getAnos(); }
}
