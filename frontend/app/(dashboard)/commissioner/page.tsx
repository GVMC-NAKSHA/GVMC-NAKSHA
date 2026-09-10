// app/(dashboard)/commissioner/page.tsx
import { ChatPanel } from '@/components/ChatPanel';

const API = process.env.API_URL!;
const get = (p: string) => fetch(`${API}${p}`, { cache: 'no-store' }).then(r => r.json());

export default async function CommissionerPage() {
  const [wards, brief] = await Promise.all([
    get(`/api/stats/all-wards`),
    get(`/api/brief`),
  ]);
  return (
    <main className="dashboard">
      <h1>Commissioner · City-wide Overview</h1>
      <section className="cards">
        <div><b>{wards.length}</b><span>wards</span></div>
        <div><b>{wards.reduce((s: number, w: any) => s + (w.total_detections ?? 0), 0)}</b><span>detections</span></div>
        <div><b>{wards.reduce((s: number, w: any) => s + (w.pending_verification ?? 0), 0)}</b><span>pending</span></div>
        <div><b>Rs {Math.round(wards.reduce((s: number, w: any) => s + (w.revenue_estimate ?? 0), 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <div className="split">
        <table>
          <thead><tr><th>Ward</th><th>Detections</th><th>Pending</th><th>New builds</th><th>Revenue est.</th></tr></thead>
          <tbody>
            {wards.map((w: any) => (
              <tr key={w.ward_id}>
                <td>{w.ward_id}</td><td>{w.total_detections}</td><td>{w.pending_verification}</td>
                <td>{w.new_builds}</td><td>Rs {Math.round((w.revenue_estimate ?? 0) / 1e5)}L</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="brief">
          <h2>City brief</h2>
          <p>{brief.text ?? brief.summary}</p>
        </div>
      </div>
      <ChatPanel />
    </main>
  );
}
