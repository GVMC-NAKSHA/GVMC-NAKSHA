// app/(dashboard)/admin/AdminActions.tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

const SOURCE_TYPES = ['cadastral', 'ori', 'utility', 'building_footprint'];

export function AdminActions() {
  const [sourceType, setSourceType] = useState(SOURCE_TYPES[0]);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function upload() {
    if (!file || busy) return;
    setBusy(true); setStatus('uploading…');
    try {
      const { uploadUrl } = await api<{ uploadUrl: string }>('/api/sources/upload', {
        method: 'POST', body: JSON.stringify({ sourceType, filename: file.name }),
      });
      await fetch(uploadUrl, { method: 'PUT', body: file });
      setStatus('uploaded');
    } catch (e: any) {
      setStatus(`error: ${e.message}`);
    } finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setStatus('refreshing…');
    try {
      await api('/api/admin/refresh', { method: 'POST' });
      setStatus('refreshed');
    } catch (e: any) {
      setStatus(`error: ${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <section className="admin-actions">
      <div className="row">
        <select value={sourceType} onChange={e => setSourceType(e.target.value)}>
          {SOURCE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={upload} disabled={busy || !file}>Upload source</button>
        <button onClick={refresh} disabled={busy}>Refresh</button>
      </div>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
