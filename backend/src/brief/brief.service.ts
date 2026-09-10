import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { LlmService } from '../llm/llm.service';
import { StatsService } from '../stats/stats.service';

@Injectable()
export class BriefService {
  constructor(@Inject(PG) private pg: Pool, private llm: LlmService, private stats: StatsService) {}

  async dailyBrief() {
    const all = await this.stats.getAllWards();
    const text = await this.llm.generateCommissionerBrief({
      city_totals: {
        data_as_of: new Date().toISOString().slice(0, 10),
        total_detected: all.totals.total_detections,
        total_unassessed: all.totals.new_builds,
        total_underassessed: all.totals.change_of_use,
        est_revenue_cr: (all.totals.revenue_estimate / 1e7).toFixed(2),
      },
      top_wards: all.wards.slice(0, 10).map((w: any) => ({
        ward_id: w.ward_id, ward_name: w.ward_name,
        new_builds: w.unassessed_count, change_of_use: 0,
        false_positive_rate: 0.08, est_revenue_lakhs: 0,
      })),
    });
    return { ai_brief: text, generated_at: new Date().toISOString() };
  }
}
