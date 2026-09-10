import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q } from '../infra/pg.provider';
import { R2 } from '../infra/r2.client';

@Injectable()
export class ExportService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2) {}

  async exportCsv(wardId?: string) {
    const params = wardId ? [wardId] : [];
    const rows = await q(this.pg, `
      SELECT p.id, w.name AS ward_name, p.lat, p.lng, p.area_sqm, p.detection_type, p.confidence,
             p.detected_at, COALESCE(vs.status,'pending') AS verification_status, vs.updated_by, vs.notes
      FROM properties p JOIN wards w ON w.id = p.ward_id
      LEFT JOIN verification_status vs ON vs.property_id = p.id
      ${wardId ? 'WHERE p.ward_id = $1' : ''} ORDER BY p.confidence DESC`, params);
    if (!rows.length) throw new BadRequestException('No rows to export');

    const header = Object.keys(rows[0]).join(',');
    const body   = rows.map(r => Object.values(r).map(v => JSON.stringify(v ?? '')).join(',')).join('\n');
    const key    = `exports/gvmc_properties_${new Date().toISOString().replace(/[:.]/g,'').slice(0,15)}.csv`;
    await this.r2.putObject(key, `${header}\n${body}`, 'text/csv');
    return { presigned_url: await this.r2.presignGet(key), row_count: rows.length };
  }
}
