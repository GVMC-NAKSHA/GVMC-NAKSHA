'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { MapCanvas } from '@/components/MapCanvas';
import { ConflictPanel } from '@/components/ConflictPanel';
import { LayerToggles } from '@/components/LayerToggles';

const confidenceColor = (score: number) =>
  score >= 80 ? '#1a9850' : score >= 60 ? '#fee08b' : score >= 40 ? '#fdae61' : '#d73027';

type Props = {
  ward: string;
  conflicts: any[];
  matches: any[];
  features: any;
  harmonized: any[];
};

export function IntegrationView({ ward, conflicts, matches, features, harmonized }: Props) {
  const [layers, setLayers] = useState<Record<string, boolean>>({
    cadastral: true, ori: false, utility: true, building_footprint: true,
  });
  const [list, setList] = useState(conflicts);
  const [parcels, setParcels] = useState(harmonized);
  const [busy, setBusy] = useState('');

  async function resolve(id: string, status: string) {
    await api(`/api/conflicts/${id}/resolve`, { method: 'POST', body: JSON.stringify({ status }) });
    setList((cs: any[]) => cs.filter((c) => c.id !== id));
  }

  async function assemble() {
    setBusy('Assembling golden record…');
    try {
      await api(`/api/harmonized/assemble?wardId=${ward}`, { method: 'POST' });
      // give the worker a moment, then refresh the list
      await new Promise((r) => setTimeout(r, 1500));
      const rows = await api<any[]>(`/api/harmonized?wardId=${ward}`);
      setParcels(rows);
      setBusy(`Assembled ${rows.length} harmonized parcels`);
    } catch (e: any) {
      setBusy(`Error: ${e.message}`);
    }
  }

  async function exportCadastre() {
    setBusy('Exporting GeoJSON…');
    try {
      const r = await api<{ presigned_url?: string; geojson?: any; feature_count: number }>(
        `/api/harmonized/export?wardId=${ward}&format=geojson`,
      );
      setBusy(`Exported ${r.feature_count} parcels`);
      if (r.presigned_url) {
        window.open(r.presigned_url, '_blank');
      } else if (r.geojson) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(r.geojson, null, 2)], { type: 'application/geo+json' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = `harmonized_ward${ward}.geojson`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      setBusy(`Error: ${e.message}`);
    }
  }

  return (
    <div className="integration-grid">
      <aside>
        <h1>Ward {ward} · Harmonization</h1>
        <div className="actions">
          <button onClick={assemble}>Assemble golden record</button>
          <button onClick={exportCadastre} disabled={!parcels.length}>Export cadastre</button>
        </div>
        {busy && <p className="muted">{busy}</p>}
        <p className="muted">
          {parcels.length} harmonized parcel{parcels.length === 1 ? '' : 's'} · {matches.length} matches ·{' '}
          {list.length} open conflict{list.length === 1 ? '' : 's'}
        </p>
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
