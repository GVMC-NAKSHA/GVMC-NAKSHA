import { Body, Controller, Post, Query } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { AlertsService } from './alerts.service';
import { ExportService } from '../export/export.service';
import { GenerateAlertDto } from './dto';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly svc: AlertsService, private readonly exp: ExportService) {}

  @Post('export')
  @Roles('official', 'admin')
  export(@Query('ward_id') wardId?: string) { return this.exp.exportCsv(wardId); }

  @Post('generate')
  @Roles('analyst', 'admin')
  generate(@Body() dto: GenerateAlertDto) { return this.svc.generateAndStore(dto.wardId); }
}
