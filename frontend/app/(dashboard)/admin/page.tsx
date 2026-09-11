// app/(dashboard)/admin/page.tsx
import { serverApi } from '@/lib/server-api';
import { ChatPanel } from '@/components/ChatPanel';
import { AdminActions } from './AdminActions';

export default async function AdminPage() {
  const stats = await serverApi(`/api/stats`).catch(() => ({}));
  return (
    <main className="dashboard">
      <h1>Admin · Data Ingestion</h1>
      <section className="cards">
        <div><b>{stats.total_detections ?? 0}</b><span>detections</span></div>
        <div><b>{stats.pending_verification ?? 0}</b><span>pending</span></div>
        <div><b>{stats.new_builds ?? 0}</b><span>new builds</span></div>
        <div><b>Rs {Math.round((stats.revenue_estimate ?? 0) / 1e5)}L</b><span>est. revenue</span></div>
      </section>
      <AdminActions />
      <ChatPanel />
    </main>
  );
}
