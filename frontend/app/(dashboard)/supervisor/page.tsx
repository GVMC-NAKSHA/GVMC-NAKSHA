// app/(dashboard)/supervisor/page.tsx
import { MapCanvas } from '@/components/MapCanvas';
import { ChatPanel } from '@/components/ChatPanel';
import { TicketReview } from './TicketReview';

const API = process.env.API_URL!;
const get = (p: string) => fetch(`${API}${p}`, { cache: 'no-store' }).then(r => r.json());

export default async function SupervisorPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '1';
  const [tickets, features] = await Promise.all([
    get(`/api/tickets?status=open`),
    get(`/api/wards/${ward}/geojson`),
  ]);
  return (
    <main className="dashboard">
      <h1>Supervisor · Ground-truth Review</h1>
      <section className="cards">
        <div><b>{tickets.length}</b><span>open tickets</span></div>
        <div><b>{tickets.filter((t: any) => t.priority === 'high').length}</b><span>high priority</span></div>
        <div><b>{tickets.filter((t: any) => t.status === 'in_progress').length}</b><span>in progress</span></div>
        <div><b>Ward {ward}</b><span>map focus</span></div>
      </section>
      <div className="split">
        <TicketReview items={tickets} />
        <MapCanvas wardId={ward} featureCollection={features} matches={[]} colorForMatch={() => '#3388ff'} />
      </div>
      <ChatPanel />
    </main>
  );
}
