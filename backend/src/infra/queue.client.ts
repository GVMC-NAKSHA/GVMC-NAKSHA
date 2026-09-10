import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createClient } from 'redis';

@Injectable()
export class Queue implements OnModuleDestroy {
  private client = createClient({ url: process.env.REDIS_URL });
  private ready = this.client.connect();

  async enqueue(stream: 'ingest', job: Record<string, unknown>) {
    await this.ready;
    const jobId = randomUUID();
    await this.client.lPush(`queue:${stream}`, JSON.stringify({ jobId, ...job }));
    return jobId;
  }
  async ping(): Promise<'ok' | 'down'> {
    try { await this.ready; return (await this.client.ping()) === 'PONG' ? 'ok' : 'down'; }
    catch { return 'down'; }
  }
  onModuleDestroy() { return this.client.quit(); }
}
