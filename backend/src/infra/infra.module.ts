import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { R2 } from './r2.client';
import { Queue } from './queue.client';

export const PG = 'PG_POOL';

@Global()
@Module({
  providers: [
    { provide: PG, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }) },
    R2, Queue,
  ],
  exports: [PG, R2, Queue],
})
export class InfraModule {}
