import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class Queue implements OnModuleDestroy {
  private client: RedisClientType = createClient({ url: process.env.REDIS_URL });

  // Connect lazily on first use, not at construction — a Redis blip during boot must not
  // crash the process with an unhandled rejection.
  private async ready(): Promise<void> {
    if (!this.client.isOpen && !this.client.isReady) {
      await this.client.connect();
    }
  }

  async enqueue(stream: 'ingest', job: Record<string, unknown>) {
    await this.ready();
    const jobId = randomUUID();
    await this.client.lPush(`queue:${stream}`, JSON.stringify({ jobId, ...job }));
    return jobId;
  }

  async ping(): Promise<'ok' | 'down'> {
    try {
      await this.ready();
      return (await this.client.ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      return 'down';
    }
  }

  onModuleDestroy() {
    return this.client.isOpen ? this.client.quit() : undefined;
  }
}
