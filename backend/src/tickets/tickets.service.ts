import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import * as crypto from 'crypto';
import { PG } from '../infra/infra.module';
import { q, one } from '../infra/pg.provider';
import { R2 } from '../infra/r2.client';
import { Brevo, escapeHtml } from '../infra/email.client';
import { CreateTicketDto, ListTicketsDto, ReviewTicketDto, PhotoUploadDto } from './dto';

@Injectable()
export class TicketsService {
  private static readonly REVIEW = new Set(['under_review', 'resolved']);
  constructor(@Inject(PG) private pg: Pool, private r2: R2, private email: Brevo) {}

  async create(dto: CreateTicketDto, createdByEmail?: string) {
    for (const f of ['wardId', 'houseNumber', 'description'] as const)
      if (!dto[f]?.trim()) throw new BadRequestException(`${f} is required`);
    if (!await one(this.pg, `SELECT id FROM wards WHERE id = $1`, [dto.wardId]))
      throw new NotFoundException('Ward not found');
    const row = await one(this.pg, `
      INSERT INTO tickets (ward_id, property_id, parcel_id, house_number, description,
                           tax_pending, gnss_lat, gnss_lng, gnss_accuracy_m, photo_r2_key, created_by_email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, status`,
      [dto.wardId, dto.propertyId ?? null, dto.parcelId ?? null, dto.houseNumber, dto.description,
       dto.taxPending ?? null, dto.gnssLat ?? null, dto.gnssLng ?? null, dto.gnssAccuracyM ?? null,
       dto.photoR2Key ?? null, createdByEmail ?? null]);
    return row;
  }

  async list(f: ListTicketsDto) {
    const where: string[] = []; const params: unknown[] = [];
    if (f.wardId) { params.push(f.wardId); where.push(`t.ward_id = $${params.length}`); }
    if (f.status) { params.push(f.status); where.push(`t.status = $${params.length}`); }
    const rows = await q(this.pg, `
      SELECT t.*, w.name AS ward_name FROM tickets t JOIN wards w ON w.id = t.ward_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.created_at DESC`, params);
    return { tickets: rows };
  }

  async get(id: string) {
    const row = await one(this.pg, `
      SELECT t.*, w.name AS ward_name FROM tickets t JOIN wards w ON w.id = t.ward_id WHERE t.id = $1`, [id]);
    if (!row) throw new NotFoundException('Ticket not found');
    if (row.photo_r2_key) row.photo_url = await this.r2.presignGet(row.photo_r2_key);
    return { ticket: row };
  }

  async review(id: string, dto: ReviewTicketDto) {
    if (!TicketsService.REVIEW.has(dto.status))
      throw new BadRequestException(`status must be one of: ${[...TicketsService.REVIEW].sort().join(', ')}`);
    const { rowCount } = await this.pg.query(
      `UPDATE tickets SET status=$1, supervisor_notes=$2, reviewed_by=$3, reviewed_at=now(), updated_at=now()
       WHERE id=$4`, [dto.status, dto.supervisorNotes ?? '', dto.reviewedBy ?? 'supervisor', id]);
    if (!rowCount) throw new NotFoundException('Ticket not found');
    const ticket = await one<{ created_by_email: string | null; house_number: string }>(this.pg,
      `SELECT created_by_email, house_number FROM tickets WHERE id = $1`, [id]);
    if (ticket?.created_by_email) {
      const house = escapeHtml(ticket.house_number);
      await this.email.send([ticket.created_by_email], `Ticket update: ${ticket.house_number} — ${dto.status}`,
        `<p>Your ticket for <b>${house}</b> was marked <b>${dto.status}</b>` +
        (dto.supervisorNotes ? ` with the note: "${escapeHtml(dto.supervisorNotes)}"` : '') + `.</p>`);
    }
    return { status: dto.status };
  }

  async photoUploadUrl(dto: PhotoUploadDto) {
    const ext = (dto.filename?.split('.').pop() ?? 'jpg').toLowerCase();
    const safe = ['jpg', 'jpeg', 'png', 'heic', 'webp'].includes(ext) ? ext : 'jpg';
    const key = `uploads/tickets/${crypto.randomUUID()}.${safe}`;
    const ct  = safe === 'jpg' || safe === 'jpeg' ? 'image/jpeg' : `image/${safe}`;
    return { upload_url: await this.r2.presignPut(key, ct), r2_key: key };
  }
}
