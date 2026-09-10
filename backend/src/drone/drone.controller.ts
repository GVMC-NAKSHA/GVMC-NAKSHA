import { Body, Controller, Get, HttpCode, Inject, Post, Query } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q, one } from '../infra/pg.provider';
import { Queue } from '../infra/queue.client';
import { Roles } from '../common/roles.decorator';
import { FlaggedTileDto } from './dto';

@Controller('drone')
export class DroneController {
  constructor(@Inject(PG) private pg: Pool, private queue: Queue) {}

  @Post('flagged-tile')
  @Roles('official')
  @HttpCode(202)
  async ingestFlaggedTile(@Body() dto: FlaggedTileDto) {
    const src = await one(this.pg, `
      INSERT INTO data_sources (type, ward_id, r2_key, crs, captured_at, status)
      VALUES ('drone_imagery', $1, $2, 'EPSG:4326', $3, 'processing') RETURNING id`,
      [dto.wardId, dto.r2Key, dto.capturedAt ?? null]);
    await this.pg.query(`
      INSERT INTO drone_tiles (ward_id, source_id, bbox, confidence, r2_key, captured_at, buffered)
      VALUES ($1,$2, ST_GeomFromGeoJSON($3), $4, $5, $6, $7)`,
      [dto.wardId, src.id, JSON.stringify(dto.bbox), dto.confidence, dto.r2Key, dto.capturedAt ?? null,
       dto.confidence < 50]);
    const jobId = await this.queue.enqueue('ingest',
      { jobType: 'NORMALIZE_SOURCE', sourceId: src.id, r2Key: dto.r2Key, type: 'drone_imagery' });
    return { status: 'processing', sourceId: src.id, jobId };
  }

  @Get('tiles')
  tiles(@Query('wardId') wardId?: string, @Query('minConfidence') minConfidence = '0') {
    const where: string[] = ['confidence >= $1']; const params: unknown[] = [Number(minConfidence)];
    if (wardId) { params.push(wardId); where.push(`ward_id = $${params.length}`); }
    return q(this.pg, `SELECT id, ward_id, confidence, r2_key, ST_AsGeoJSON(bbox)::json AS bbox,
                              captured_at, buffered
                       FROM drone_tiles WHERE ${where.join(' AND ')} ORDER BY confidence DESC`, params);
  }
}
