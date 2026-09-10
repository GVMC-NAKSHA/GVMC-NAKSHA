import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q } from '../infra/pg.provider';
import { R2 } from '../infra/r2.client';
import { Queue } from '../infra/queue.client';
import { UploadCsvDto } from './dto';

@Injectable()
export class AdminService {
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private queue: Queue) {}

  async uploadCsv(dto: UploadCsvDto) {                       // legacy archive-only behaviour kept
    const key = `uploads/${dto.filename ?? 'assessment_data.csv'}`;
    await this.r2.putObject(key, Buffer.from(dto.fileContent, 'base64'), 'text/csv');
    await this.pg.query(`INSERT INTO admin_config (key_name, value) VALUES ('data_mode','live')
                         ON CONFLICT (key_name) DO UPDATE SET value='live', updated_at=now()`);
    return { properties_imported: 0, message: 'CSV uploaded. Use POST /sources/upload for real ingestion.' };
  }

  async dbConfig(dto: Record<string, unknown>) {
    const allowed = ['ndbi_threshold', 'min_area_sqm', 'cloud_cover_max'];
    for (const k of allowed) if (dto[k] != null)
      await this.pg.query(`INSERT INTO admin_config (key_name, value) VALUES ($1,$2)
                           ON CONFLICT (key_name) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`,
                          [k, String(dto[k])]);
    return {};
  }

  async refresh() {                                          // was: SSM send-command to EC2
    const wards = await q(this.pg, `SELECT id FROM wards`);
    const jobs = await Promise.all(wards.map(w => this.queue.enqueue('ingest', { jobType: 'HARMONIZE_WARD', wardId: w.id })));
    await this.pg.query(`INSERT INTO admin_config (key_name, value) VALUES ('pipeline_status','running')
                         ON CONFLICT (key_name) DO UPDATE SET value='running', updated_at=now()`);
    return { triggered: true, jobs: jobs.length };
  }
}
