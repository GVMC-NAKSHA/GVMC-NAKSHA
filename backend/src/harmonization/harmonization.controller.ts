import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q } from '../infra/pg.provider';
import { Roles } from '../common/roles.decorator';
import { LlmService } from '../llm/llm.service';
import { HarmonizationService } from './harmonization.service';
import { SchemaMapDto } from './dto';

@Controller('harmonization')
export class HarmonizationController {
  constructor(private readonly svc: HarmonizationService, private readonly llm: LlmService,
              @Inject(PG) private pg: Pool) {}

  @Post('run')
  @Roles('admin', 'analyst')
  @HttpCode(202)
  async run(@Query('wardId') wardId?: string) {
    const wards = wardId ? [wardId] : (await q(this.pg, `SELECT id FROM wards`)).map((r: any) => r.id);
    const jobs = await Promise.all(wards.map(w => this.svc.enqueueBatch(w)));
    return { status: 'processing', jobs };
  }

  @Get('matches')
  matches(@Query('wardId') wardId?: string, @Query('minScore') minScore = '0') {
    return this.svc.listMatches(wardId, Number(minScore));
  }

  @Get('matches/:id')
  matchDetail(@Param('id') id: string) { return this.svc.matchDetail(id); }

  @Post('schema-map')
  @Roles('admin', 'analyst')
  async schemaMap(@Body() dto: SchemaMapDto) {
    const mappings = await this.llm.suggestFieldMapping(dto.a, dto.b);
    if (dto.sourceAId && dto.sourceBId) await this.svc.persistMappings(dto.sourceAId, dto.sourceBId, mappings);
    return { mappings };
  }

  @Get('schema-map')
  listMappings(@Query('sourceAId') a?: string, @Query('sourceBId') b?: string) {
    return this.svc.listMappings(a, b);
  }
}
