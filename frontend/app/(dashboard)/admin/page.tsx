// app/(dashboard)/admin/page.tsx
import { ChatPanel } from '@/components/ChatPanel';
import { AdminActions } from './AdminActions';

const API = process.env.API_URL!;
const get = (p: string) => fetch(`${API}${p}`, { cache: 'no-store' }).then(r => r.json());

export default async function AdminPage() {
  const stats = await get(`/api/stats`);
  return (
    <main className="dashboard">
      <h1>Admin · Data Ingestion</h1>
      <section className="cards">
        <div><b>{stats.total_detections}</b><span>detections</span></div>
        <div><b>{stats.pending_verification}</b><span>pending</span></div>
        <div><b>{stats.new_builds}</b><span>new builds</span></div>
        <div><b>Rs {Math.round((stats.revenue_estimate ?? 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <AdminActions />
      <ChatPanel />
    </main>
  );
}
