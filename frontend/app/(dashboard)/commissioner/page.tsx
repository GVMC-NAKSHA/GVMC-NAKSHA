// app/(dashboard)/commissioner/page.tsx
import { serverApi } from '@/lib/server-api';
import { ChatPanel } from '@/components/ChatPanel';

export default async function CommissionerPage() {
  const [allWards, brief] = await Promise.all([
    serverApi(`/api/stats/all-wards`).catch(() => ({ wards: [], totals: {} })),
    serverApi(`/api/brief`).catch(() => ({ ai_brief: '' })),
  ]);
  const wards: any[] = allWards?.wards ?? [];
  const totals = allWards?.totals ?? {};
  return (
    <main className="dashboard">
      <h1>Commissioner · City-wide Overview</h1>
      <section className="cards">
        <div><b>{wards.length}</b><span>wards</span></div>
        <div><b>{totals.total_detections ?? 0}</b><span>detections</span></div>
        <div><b>{totals.pending_verification ?? 0}</b><span>pending</span></div>
        <div><b>Rs {Math.round((totals.revenue_estimate ?? 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <div className="split">
        <table>
          <thead>
            <tr><th>Ward</th><th>Name</th><th>Detections</th><th>Unassessed</th><th>Open tickets</th></tr>
          </thead>
          <tbody>
            {wards.map((w: any) => (
              <tr key={w.ward_id}>
                <td>{w.ward_id}</td><td>{w.ward_name}</td><td>{w.total_detections}</td>
                <td>{w.unassessed_count}</td><td>{w.open_tickets}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="brief">
          <h2>City brief</h2>
          <p>{brief?.ai_brief || 'No brief available.'}</p>
        </div>
      </div>
      <ChatPanel />
    </main>
  );
}
