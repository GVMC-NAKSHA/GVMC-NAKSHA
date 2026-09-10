import { Injectable } from '@nestjs/common';

const SOURCE_RELIABILITY: Record<string, number> = {
  gnss_cors: 1.0, cadastral: 0.95, ground_truth: 0.9, building_footprint: 0.8,
  municipal_gis: 0.8, utility: 0.75, ori: 0.7, dsm_dtm: 0.7, revenue: 0.65, drone_imagery: 0.6,
};

@Injectable()
export class ConfidenceService {
  build(input: {
    matchScore: number;                 // 0-100 from B.3
    fieldMappings: { confidence: number }[];
    sourceAType: string; sourceBType: string;
    capturedAt: Date | null;
  }) {
    const geometric   = input.matchScore / 100;
    const attribute   = input.fieldMappings.length
      ? input.fieldMappings.reduce((s, m) => s + m.confidence, 0) / input.fieldMappings.length : 0.5;
    const reliability = (SOURCE_RELIABILITY[input.sourceAType] + SOURCE_RELIABILITY[input.sourceBType]) / 2;
    const ageYears    = input.capturedAt ? (Date.now() - input.capturedAt.getTime()) / 3.15576e10 : 5;
    const recency     = Math.max(0, 1 - ageYears / 5);

    const breakdown = {
      geometric_match_score: round4(geometric),
      attribute_match_score: round4(attribute),
      source_reliability_weight: round4(reliability),
      recency_score: round4(recency),
    };
    const weights = [0.4, 0.3, 0.2, 0.1];
    const score = Math.round(100 *
      [geometric, attribute, reliability, recency].reduce((s, v, i) => s + v * weights[i], 0));
    return { score, breakdown };
  }
}
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
