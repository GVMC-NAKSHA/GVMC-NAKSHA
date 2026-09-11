// app/(dashboard)/supervisor/page.tsx
import { serverApi } from '@/lib/server-api';
import { MapCanvas } from '@/components/MapCanvas';
import { ChatPanel } from '@/components/ChatPanel';
import { TicketReview } from './TicketReview';

export default async function SupervisorPage({ searchParams }: { searchParams: { ward?: string } }) {
  const ward = searchParams.ward ?? '1';
  const [ticketResp, features] = await Promise.all([
    serverApi(`/api/tickets?status=open`).catch(() => ({ tickets: [] })),
    serverApi(`/api/wards/${ward}/geojson`).catch(() => ({ type: 'FeatureCollection', features: [] })),
  ]);
  const tickets: any[] = ticketResp?.tickets ?? [];
  return (
    <main className="dashboard">
      <h1>Supervisor · Ground-truth Review</h1>
      <section className="cards">
        <div><b>{tickets.length}</b><span>open tickets</span></div>
        <div><b>{tickets.filter((t: any) => t.status === 'under_review').length}</b><span>under review</span></div>
        <div><b>{tickets.filter((t: any) => t.status === 'resolved').length}</b><span>resolved</span></div>
        <div><b>Ward {ward}</b><span>map focus</span></div>
      </section>
      <div className="split">
        <TicketReview items={tickets} />
        <MapCanvas wardId={ward} featureCollection={features} />
      </div>
      <ChatPanel />
    </main>
  );
}
