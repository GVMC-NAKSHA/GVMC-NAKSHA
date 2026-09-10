import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { one } from '../infra/pg.provider';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class PropertiesService {
  constructor(@Inject(PG) private pg: Pool, private llm: LlmService) {}

  async getProperty(id: string) {
    const row = await one(this.pg, `
      SELECT p.*, w.name AS ward_name, p.updated_at AS verified_at
      FROM properties p JOIN wards w ON w.id = p.ward_id WHERE p.id = $1`, [id]);
    if (!row) throw new NotFoundException('Property not found');
    return row;
  }

  async explain(id: string) {
    const p = await this.getProperty(id);
    const text = await this.llm.explainProperty({
      ward_name: p.ward_name, ward_id: p.ward_id, area_sqm: p.area_sqm,
      detection_type: p.detection_type, confidence: Math.round((p.confidence ?? 0) * 100),
      confidence_breakdown: p.confidence_breakdown, detected_at: p.detected_at,
    });
    await this.pg.query(`UPDATE properties SET ai_explanation = $1 WHERE id = $2`, [text, id]);
    return { ai_explanation: text };
  }
}
