// app/(dashboard)/admin/AdminActions.tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

const SOURCE_TYPES = [
  'cadastral', 'building_footprint', 'municipal_gis', 'utility',
  'gnss_cors', 'ground_truth', 'revenue', 'ori', 'dsm_dtm', 'drone_imagery',
];
const WARDS = ['1', '2', '3', '4', '5'];

export function AdminActions() {
  const [type, setType] = useState(SOURCE_TYPES[0]);
  const [wardId, setWardId] = useState('4');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(true); setStatus(`${label}…`);
    try { const r = await fn(); setStatus(`${label}: ${JSON.stringify(r).slice(0, 200)}`); }
    catch (e: any) { setStatus(`${label} failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function upload() {
    if (!file) return;
    await run('upload source', async () => {
      const { uploadUrl, sourceId } = await api<{ uploadUrl: string; sourceId: string }>(
        '/api/sources/upload',
        { method: 'POST', body: JSON.stringify({ type, wardId, originalName: file.name }) },
      );
      const put = await fetch(uploadUrl, { method: 'PUT', body: file });
      if (!put.ok) throw new Error(`R2 PUT ${put.status}`);
      return { sourceId, uploaded: true };
    });
  }

  return (
    <section className="admin-actions">
      <div className="row">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {SOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={wardId} onChange={(e) => setWardId(e.target.value)}>
          {WARDS.map((w) => <option key={w} value={w}>Ward {w}</option>)}
        </select>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={upload} disabled={busy || !file}>Upload source</button>
      </div>
      <div className="row">
        <button onClick={() => run('harmonize', () => api(`/api/harmonization/run?wardId=${wardId}`, { method: 'POST' }))} disabled={busy}>
          Harmonize ward {wardId}
        </button>
        <button onClick={() => run('assemble', () => api(`/api/harmonized/assemble?wardId=${wardId}`, { method: 'POST' }))} disabled={busy}>
          Assemble golden record
        </button>
        <button
          onClick={() => run('export', async () => {
            const r = await api<{ presigned_url?: string; geojson?: any; feature_count: number }>(
              `/api/harmonized/export?wardId=${wardId}&format=geojson`,
            );
            if (r.presigned_url) window.open(r.presigned_url, '_blank');
            else if (r.geojson) {
              const url = URL.createObjectURL(new Blob([JSON.stringify(r.geojson, null, 2)], { type: 'application/geo+json' }));
              const a = document.createElement('a');
              a.href = url; a.download = `harmonized_ward${wardId}.geojson`; a.click();
              URL.revokeObjectURL(url);
            }
            return { feature_count: r.feature_count };
          })}
          disabled={busy}
        >
          Export cadastre (GeoJSON)
        </button>
        <button onClick={() => run('refresh', () => api('/api/admin/refresh', { method: 'POST' }))} disabled={busy}>
          Refresh all wards
        </button>
      </div>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
