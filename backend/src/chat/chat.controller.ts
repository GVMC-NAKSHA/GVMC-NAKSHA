import { BadRequestException, Body, Controller, Inject, Post } from '@nestjs/common';
import { Pool } from 'pg';
import { PG } from '../infra/infra.module';
import { q } from '../infra/pg.provider';
import { LlmService } from '../llm/llm.service';
import { ChatDto } from './dto';

@Controller('chat')
export class ChatController {
  constructor(private readonly llm: LlmService, @Inject(PG) private pg: Pool) {}

  @Post()
  async chat(@Body() dto: ChatDto) {
    if (!dto.message?.trim()) throw new BadRequestException('message is required');
    // single-shot: give the model the ward/stat context it needs (no ReAct loop)
    const stats = await q(this.pg, `SELECT id, name FROM wards ORDER BY id`);
    const response = await this.llm.chatReply(dto.message.trim(), { wards: stats });
    return { response };
  }
}
