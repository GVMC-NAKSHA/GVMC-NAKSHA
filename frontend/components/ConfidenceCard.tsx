const LABELS: Record<string, string> = {
  geometric_match_score: 'Geometric match',
  attribute_match_score: 'Attribute match',
  source_reliability_weight: 'Source reliability',
  recency_score: 'Recency',
};

export function ConfidenceCard({ score, breakdown }: { score: number; breakdown: Record<string, number> }) {
  return (
    <div className="confidence-card">
      <div className="score">{score}<span>/100</span></div>
      {Object.entries(breakdown).map(([k, v]) => (
        <div key={k} className="bar-row">
          <span>{LABELS[k] ?? k}</span>
          <div className="bar"><div style={{ width: `${Math.round(v * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}
