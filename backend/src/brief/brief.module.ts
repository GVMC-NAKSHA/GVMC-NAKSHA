import { Module } from '@nestjs/common';
import { BriefController } from './brief.controller';
import { BriefService } from './brief.service';
import { StatsModule } from '../stats/stats.module';
@Module({ imports: [StatsModule], controllers: [BriefController], providers: [BriefService] })
export class BriefModule {}
