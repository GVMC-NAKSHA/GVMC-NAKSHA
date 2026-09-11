// app/(dashboard)/officer/page.tsx
import { serverApi } from '@/lib/server-api';
import { MapCanvas } from '@/components/MapCanvas';
import { ChatPanel } from '@/components/ChatPanel';

export default async function OfficerPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '1';
  const [stats, unassessed, features] = await Promise.all([
    serverApi(`/api/stats?ward_id=${ward}`).catch(() => ({})),
    serverApi(`/api/wards/${ward}/unassessed?status=pending`).catch(() => []),
    serverApi(`/api/wards/${ward}/geojson`).catch(() => ({ type: 'FeatureCollection', features: [] })),
  ]);
  const rows: any[] = Array.isArray(unassessed) ? unassessed : [];
  return (
    <main className="dashboard">
      <h1>Officer · Ward {ward}</h1>
      <section className="cards">
        <div><b>{stats.total_detections ?? 0}</b><span>detections</span></div>
        <div><b>{stats.pending_verification ?? 0}</b><span>pending</span></div>
        <div><b>{stats.new_builds ?? 0}</b><span>new builds</span></div>
        <div><b>Rs {Math.round((stats.revenue_estimate ?? 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <div className="split">
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Area</th><th>Conf.</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((p: any) => (
              <tr key={p.id}>
                <td>{String(p.id).slice(0, 8)}</td><td>{p.detection_type}</td>
                <td>{p.area_sqm}</td><td>{Math.round((p.confidence ?? 0) * 100)}%</td><td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <MapCanvas wardId={ward} featureCollection={features} />
      </div>
      <ChatPanel />
    </main>
  );
}
