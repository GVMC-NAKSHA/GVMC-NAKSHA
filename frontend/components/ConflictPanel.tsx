// components/ConflictPanel.tsx
export function ConflictPanel({ items, onResolve }:
  { items: any[]; onResolve: (id: string, status: string) => void }) {
  if (!items?.length) return <p className="muted">No open conflicts.</p>;
  return (
    <ul className="conflict-panel">
      {items.map(c => (
        <li key={c.id} className={`sev-${c.severity}`}>
          <b>{c.conflict_type}</b> · {c.severity}
          <p>{c.suggested_resolution}</p>
          <div className="row">
            <button onClick={() => onResolve(c.id, 'resolved')}>Resolve</button>
            <button onClick={() => onResolve(c.id, 'needs_review')}>Needs review</button>
            <button onClick={() => onResolve(c.id, 'rejected')}>Reject</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
