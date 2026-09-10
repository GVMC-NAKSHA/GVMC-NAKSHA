import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { AdminService } from './admin.service';
import { UploadCsvDto } from './dto';

@Controller('admin')
export class AdminController {
  constructor(private readonly svc: AdminService) {}

  @Post('upload-csv')
  @Roles('admin')
  uploadCsv(@Body() dto: UploadCsvDto) { return this.svc.uploadCsv(dto); }

  @Post('db-config')
  @Roles('admin')
  dbConfig(@Body() dto: Record<string, unknown>) { return this.svc.dbConfig(dto); }

  @Post('refresh')
  @Roles('admin')
  @HttpCode(202)
  refresh() { return this.svc.refresh(); }
}
