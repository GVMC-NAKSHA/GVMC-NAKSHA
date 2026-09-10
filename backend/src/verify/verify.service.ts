import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q, one } from '../infra/pg.provider';

@Injectable()
export class VerifyService {
  private static readonly VALID = new Set(
    ['pending','verified','underassessed','false_positive','already_assessed']);
  constructor(@Inject(PG) private pg: Pool) {}

  async updateStatus(propertyId: string, dto: { status: string; notes?: string; updatedBy?: string }) {
    if (!VerifyService.VALID.has(dto.status))
      throw new BadRequestException(`Invalid status. Must be one of: ${[...VerifyService.VALID].sort().join(', ')}`);
    const exists = await one(this.pg, `SELECT id FROM properties WHERE id = $1`, [propertyId]);
    if (!exists) throw new NotFoundException('Property not found');

    const now = new Date();
    await this.pg.query(
      `UPDATE properties SET status=$1, updated_by=$2, updated_at=$3, notes=$4 WHERE id=$5`,
      [dto.status, dto.updatedBy ?? 'officer', now, dto.notes ?? '', propertyId]);
    await this.pg.query(
      `INSERT INTO verification_status (property_id, status, updated_by, updated_at, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (property_id) DO UPDATE SET
         status=EXCLUDED.status, updated_by=EXCLUDED.updated_by,
         updated_at=EXCLUDED.updated_at, notes=EXCLUDED.notes`,
      [propertyId, dto.status, dto.updatedBy ?? 'officer', now, dto.notes ?? '']);
    return { status: dto.status };
  }
}
