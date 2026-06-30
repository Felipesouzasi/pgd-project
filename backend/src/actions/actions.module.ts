import { Module } from '@nestjs/common';
import { ActionsController } from './actions.controller';
import { ActionsService } from './actions.service';
import { PdfService } from './pdf.service';

@Module({
  controllers: [ActionsController],
  providers: [ActionsService, PdfService],
})
export class ActionsModule {}
