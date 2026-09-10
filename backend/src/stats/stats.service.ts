import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q, one } from '../infra/pg.provider';

// KPI queries ported 1:1 from stats_service.py
@Injectable()
export class StatsService {
  constructor(@Inject(PG) private pg: Pool) {}

  async getStats(wardId?: string) {
    const params = wardId ? [wardId] : [];
    const where  = wardId ? 'WHERE p.ward_id = $1' : '';
    const row = await one(this.pg, `
      SELECT COUNT(*)::int AS total_detections,
             COUNT(*) FILTER (WHERE detection_type='new_build')::int      AS new_builds,
             COUNT(*) FILTER (WHERE detection_type='change_of_use')::int  AS change_of_use,
             COUNT(*) FILTER (WHERE COALESCE(status,'pending')='pending')::int AS pending_verification,
             COUNT(*) FILTER (WHERE status='verified')::int              AS verified,
             COUNT(*) FILTER (WHERE status='false_positive')::int        AS false_positives,
             COALESCE(SUM(CASE WHEN COALESCE(status,'pending') IN ('pending','underassessed')
                  THEN area_sqm * CASE WHEN detection_type='new_build' THEN 80 ELSE 40 END ELSE 0 END),0) AS revenue_estimate
      FROM properties p ${where}`, params);
    const cfg = Object.fromEntries((await q(this.pg,
      `SELECT key_name, value FROM admin_config
       WHERE key_name IN ('data_mode','pipeline_status','last_refresh','ndbi_threshold')`))
      .map((r: any) => [r.key_name, r.value]));
    return { ...row, ward_id: wardId ?? null,
             data_mode: cfg.data_mode ?? 'demo', pipeline_status: cfg.pipeline_status ?? 'idle',
             last_refresh: cfg.last_refresh ?? null, ndbi_threshold: +(cfg.ndbi_threshold ?? 0.15) };
  }

  async getAllWards() {
    const wards = await q(this.pg, `
      SELECT w.id AS ward_id, w.name AS ward_name,
             COUNT(DISTINCT p.id)::int AS total_detections,
             COUNT(p.id) FILTER (WHERE p.detection_type='new_build')::int AS unassessed_count,
             COALESCE(t.open_tickets,0)::int     AS open_tickets,
             COALESCE(t.resolved_tickets,0)::int AS resolved_tickets
      FROM wards w
      LEFT JOIN properties p ON p.ward_id = w.id
      LEFT JOIN (SELECT ward_id,
                        COUNT(*) FILTER (WHERE status IN ('open','under_review')) AS open_tickets,
                        COUNT(*) FILTER (WHERE status='resolved') AS resolved_tickets
                 FROM tickets GROUP BY ward_id) t ON t.ward_id = w.id
      GROUP BY w.id, w.name, t.open_tickets, t.resolved_tickets
      ORDER BY unassessed_count DESC`);
    const totals = await this.getStats();
    return { wards: wards.map(w => ({ ...w, ai_brief: null })), ai_brief: null, totals };
  }
}
