import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto, ListTicketsDto, ReviewTicketDto, PhotoUploadDto } from './dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  @Post()             @Roles('official')          create(@Body() dto: CreateTicketDto, @Req() req: any) { return this.svc.create(dto, req.user?.email); }
  @Get()              @Roles('official','admin')  list(@Query() q: ListTicketsDto)      { return this.svc.list(q); }
  @Get(':id')         @Roles('official','admin')  get(@Param('id') id: string)          { return this.svc.get(id); }
  @Patch(':id/review')@Roles('official','admin')  review(@Param('id') id: string, @Body() dto: ReviewTicketDto) { return this.svc.review(id, dto); }
  @Post('photo-upload')@Roles('official')         photo(@Body() dto: PhotoUploadDto)     { return this.svc.photoUploadUrl(dto); }
}
