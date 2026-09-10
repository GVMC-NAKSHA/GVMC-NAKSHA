// components/ChatPanel.tsx
'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export function ChatPanel() {
  const [log, setLog] = useState<{ role: 'you' | 'ai'; text: string }[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const q = msg.trim();
    if (!q || busy) return;
    setLog(l => [...l, { role: 'you', text: q }]); setMsg(''); setBusy(true);
    try {
      const { response } = await api<{ response: string }>('/api/chat',
        { method: 'POST', body: JSON.stringify({ message: q }) });
      setLog(l => [...l, { role: 'ai', text: response }]);
    } catch (e: any) {
      setLog(l => [...l, { role: 'ai', text: `error: ${e.message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="chat-panel">
      <div className="chat-log">
        {log.map((m, i) => <p key={i} className={m.role}><b>{m.role}:</b> {m.text}</p>)}
      </div>
      <div className="row">
        <input value={msg} onChange={e => setMsg(e.target.value)}
               onKeyDown={e => e.key === 'Enter' && send()} placeholder="Ask about a ward…" />
        <button onClick={send} disabled={busy}>Send</button>
      </div>
    </div>
  );
}
