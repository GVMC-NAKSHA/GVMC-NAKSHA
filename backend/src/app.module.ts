import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { InfraModule } from './infra/infra.module';
import { AuthGuard } from './common/auth.guard';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { WardsModule } from './wards/wards.module';
import { PropertiesModule } from './properties/properties.module';
import { StatsModule } from './stats/stats.module';
import { VerifyModule } from './verify/verify.module';
import { ExportModule } from './export/export.module';
import { AlertsModule } from './alerts/alerts.module';
import { BriefModule } from './brief/brief.module';
import { AdminModule } from './admin/admin.module';
import { ChatModule } from './chat/chat.module';
import { LlmModule } from './llm/llm.module';
import { TicketsModule } from './tickets/tickets.module';
import { SourcesModule } from './sources/sources.module';
import { HarmonizationModule } from './harmonization/harmonization.module';
import { ConflictsModule } from './conflicts/conflicts.module';
import { ConfidenceModule } from './confidence/confidence.module';
import { HarmonizedModule } from './harmonized/harmonized.module';
import { DroneModule } from './drone/drone.module';

@Module({
  imports: [
    LoggerModule.forRoot({ pinoHttp: { level: process.env.LOG_LEVEL ?? 'info' } }),
    InfraModule, HealthModule, AuthModule, LlmModule,
    WardsModule, PropertiesModule, StatsModule, VerifyModule, ExportModule,
    AlertsModule, BriefModule, AdminModule, ChatModule, TicketsModule,
    SourcesModule, HarmonizationModule, ConflictsModule, ConfidenceModule,
    HarmonizedModule, DroneModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
