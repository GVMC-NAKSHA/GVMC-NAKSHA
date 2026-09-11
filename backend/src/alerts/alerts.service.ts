import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { one, q } from '../infra/pg.provider';
import { LlmService } from '../llm/llm.service';
import { Brevo, escapeHtml } from '../infra/email.client';

@Injectable()
export class AlertsService {
  constructor(@Inject(PG) private pg: Pool, private llm: LlmService, private email: Brevo) {}

  async generateAndStore(wardId: string) {
    const wardData = await one(this.pg, `
      SELECT w.id AS ward_id, w.name AS ward_name,
             COUNT(p.id) FILTER (WHERE p.detected_at > now() - interval '7 days')::int AS new_count,
             AVG(p.confidence) * 100 AS avg_confidence
      FROM wards w LEFT JOIN properties p ON p.ward_id = w.id
      WHERE w.id = $1 GROUP BY w.id, w.name`, [wardId]);
    const { text, severity, score } = await this.llm.generateWardAlert({
      ward_name: wardData.ward_name, ward_id: wardData.ward_id,
      new_count: wardData.new_count, monthly_baseline: 20,
      spike_pct: 0, avg_confidence: wardData.avg_confidence ?? 0, historical_fp_rate: 0.08,
      type_split: {}, largest_property_sqm: 0,
    });
    const sev = severity === 'HIGH' ? 'danger' : severity === 'MEDIUM' ? 'warning' : 'info';
    const row = await one(this.pg,
      `INSERT INTO alerts (ward_id, severity, text, score) VALUES ($1,$2,$3,$4) RETURNING *`,
      [wardId, sev, text, score]);
    if (sev === 'danger') await this.notifyHighSeverity(wardData.ward_id, wardData.ward_name, text);
    return row;
  }

  // ── HIGH-severity alerts get emailed to officials/admins scoped to this ward ──
  private async notifyHighSeverity(wardId: string, wardName: string, text: string) {
    const recipients = await q<{ email: string }>(this.pg, `
      SELECT email FROM profiles
      WHERE role IN ('official','admin') AND email IS NOT NULL
        AND (ward_scope = '{}' OR $1 = ANY(ward_scope))`, [wardId]);
    if (!recipients.length) return;
    await this.email.send(recipients.map(r => r.email), `HIGH severity alert — Ward ${wardId} (${wardName})`,
      `<p>${escapeHtml(text)}</p>`);
  }
}
