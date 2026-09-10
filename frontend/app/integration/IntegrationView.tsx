'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { MapCanvas } from '@/components/MapCanvas';
import { ConflictPanel } from '@/components/ConflictPanel';
import { LayerToggles } from '@/components/LayerToggles';

const confidenceColor = (score: number) =>
  score >= 80 ? '#1a9850' : score >= 60 ? '#fee08b' : score >= 40 ? '#fdae61' : '#d73027';

type Props = { ward: string; conflicts: any[]; matches: any[]; features: any };

export function IntegrationView({ ward, conflicts, matches, features }: Props) {
  const [layers, setLayers] = useState<Record<string, boolean>>({ cadastral: true, ori: false, utility: true, building_footprint: true });
  const [list, setList] = useState(conflicts);

  async function resolve(id: string, status: string) {
    await api(`/api/conflicts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status }) });
    setList((cs: any[]) => cs.filter(c => c.id !== id));
  }

  return (
    <div className="integration-grid">
      <aside>
        <LayerToggles value={layers} onChange={setLayers} />
        <ConflictPanel items={list} onResolve={resolve} />
      </aside>
      <MapCanvas
        wardId={ward}
        featureCollection={features}
        layers={layers}
        matches={matches}
        colorForMatch={(m: any) => confidenceColor(Number(m.match_score))}
      />
    </div>
  );
}
