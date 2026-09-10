import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { ExportModule } from '../export/export.module';
@Module({ imports: [ExportModule], controllers: [AlertsController], providers: [AlertsService] })
export class AlertsModule {}
