import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import { PG } from '../infra/infra.module';
import { q, one } from '../infra/pg.provider';
import { R2 } from '../infra/r2.client';
import { Queue } from '../infra/queue.client';
import { CreateSourceDto, ListSourcesDto } from './dto';

const EXT: Record<string, string> = {
  drone_imagery: 'tif', ori: 'tif', dsm_dtm: 'tif',
  cadastral: 'geojson', municipal_gis: 'geojson', utility: 'geojson', building_footprint: 'geojson',
  revenue: 'csv', ground_truth: 'gpx', gnss_cors: 'csv',
};
const CT: Record<string, string> = {
  tif: 'image/tiff', geojson: 'application/geo+json', csv: 'text/csv', gpx: 'application/gpx+xml', pdf: 'application/pdf',
};

@Injectable()
export class SourcesService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private queue: Queue) {}

  async registerAndPresign(dto: CreateSourceDto, userId: string) {
    const scanned = dto.type === 'revenue' && dto.scanned === true;
    const ext = scanned ? 'pdf' : EXT[dto.type];
    const id  = crypto.randomUUID();
    const key = `sources/${dto.type}/${id}.${ext}`;
    const status: string = scanned ? 'pending_ocr' : 'processing';

    await this.pg.query(`
      INSERT INTO data_sources (id, type, ward_id, r2_key, original_name, crs, captured_at, scanned, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, dto.type, dto.wardId ?? null, key, dto.originalName ?? null, dto.crs ?? null,
       dto.capturedAt ?? null, scanned, status, userId]);

    const uploadUrl = await this.r2.presignPut(key, CT[ext]);
    let jobId: string | null = null;
    if (!scanned)
      jobId = await this.queue.enqueue('ingest', { jobType: 'NORMALIZE_SOURCE', sourceId: id, r2Key: key, type: dto.type });

    await this.audit(userId, 'source.register', `data_sources:${id}`, { type: dto.type, scanned });
    return { sourceId: id, uploadUrl, status, jobId };
  }

  async list(f: ListSourcesDto) {
    const where: string[] = []; const params: unknown[] = [];
    for (const [col, val] of [['type', f.type], ['ward_id', f.wardId], ['status', f.status]] as const)
      if (val) { params.push(val); where.push(`${col} = $${params.length}`); }
    return q(this.pg, `
      SELECT id, type, ward_id, status, crs, captured_at, scanned, metadata, created_at
      FROM data_sources ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`, params);
  }

  async getWithDownloadUrl(id: string) {
    const row = await one(this.pg, `SELECT * FROM data_sources WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('Source not found');
    return { ...row, download_url: await this.r2.presignGet(row.r2_key) };
  }

  async featuresGeoJSON(id: string) {
    const rows = await q(this.pg, `
      SELECT id, ST_AsGeoJSON(geom)::json AS geometry, properties, was_invalid
      FROM source_features WHERE source_id = $1`, [id]);
    return { type: 'FeatureCollection',
             features: rows.map(r => ({ type: 'Feature', id: r.id, geometry: r.geometry,
                                        properties: { ...r.properties, _was_invalid: r.was_invalid } })) };
  }

  async enqueueOcr(id: string) {
    const row = await one(this.pg, `SELECT id, status FROM data_sources WHERE id = $1`, [id]);
    if (!row) throw new NotFoundException('Source not found');
    const jobId = await this.queue.enqueue('ingest', { jobType: 'DIGITIZE_SOURCE', sourceId: id });
    await this.pg.query(`UPDATE data_sources SET status='processing' WHERE id=$1`, [id]);
    return { status: 'processing', jobId };
  }

  private audit(actor: string, action: string, entity: string, detail: object) {
    return this.pg.query(`INSERT INTO audit_logs (actor, action, entity, detail) VALUES ($1,$2,$3,$4)`,
                         [actor, action, entity, detail]);
  }
}
