// app/(dashboard)/supervisor/TicketReview.tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export function TicketReview({ items }: { items: any[] }) {
  const [list, setList] = useState(items);

  async function review(id: string, status: string) {
    await api(`/api/tickets/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setList((ts: any[]) => ts.filter(t => t.id !== id));
  }

  if (!list?.length) return <p className="muted">No open tickets.</p>;
  return (
    <table>
      <thead><tr><th>ID</th><th>Ward</th><th>Category</th><th>Priority</th><th>Status</th><th></th></tr></thead>
      <tbody>
        {list.map((t: any) => (
          <tr key={t.id}>
            <td>{t.id.slice(0, 8)}</td><td>{t.ward_id}</td><td>{t.category}</td>
            <td>{t.priority}</td><td>{t.status}</td>
            <td className="row">
              <button onClick={() => review(t.id, 'approved')}>Approve</button>
              <button onClick={() => review(t.id, 'rejected')}>Reject</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
