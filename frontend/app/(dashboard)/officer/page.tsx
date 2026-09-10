// app/(dashboard)/officer/page.tsx
import { MapCanvas } from '@/components/MapCanvas';
import { ChatPanel } from '@/components/ChatPanel';

const API = process.env.API_URL!;
const get = (p: string) => fetch(`${API}${p}`, { cache: 'no-store' }).then(r => r.json());

export default async function OfficerPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '1';
  const [stats, unassessed, features] = await Promise.all([
    get(`/api/stats?ward_id=${ward}`),
    get(`/api/wards/${ward}/unassessed?status=pending`),
    get(`/api/wards/${ward}/geojson`),
  ]);
  return (
    <main className="dashboard">
      <h1>Officer · Ward {ward}</h1>
      <section className="cards">
        <div><b>{stats.total_detections}</b><span>detections</span></div>
        <div><b>{stats.pending_verification}</b><span>pending</span></div>
        <div><b>{stats.new_builds}</b><span>new builds</span></div>
        <div><b>Rs {Math.round((stats.revenue_estimate ?? 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <div className="split">
        <table>
          <thead><tr><th>ID</th><th>Type</th><th>Area</th><th>Conf.</th><th>Status</th></tr></thead>
          <tbody>
            {unassessed.map((p: any) => (
              <tr key={p.id}>
                <td>{p.id.slice(0, 8)}</td><td>{p.detection_type}</td>
                <td>{p.area_sqm}</td><td>{Math.round((p.confidence ?? 0) * 100)}%</td><td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <MapCanvas wardId={ward} featureCollection={features} matches={[]} colorForMatch={() => '#3388ff'} />
      </div>
      <ChatPanel />
    </main>
  );
}
