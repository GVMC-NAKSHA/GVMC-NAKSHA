import { Controller, Get, Query } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  get(@Query('ward_id') wardId?: string) { return this.stats.getStats(wardId); }

  @Get('all-wards')
  wards() { return this.stats.getAllWards(); }
}
