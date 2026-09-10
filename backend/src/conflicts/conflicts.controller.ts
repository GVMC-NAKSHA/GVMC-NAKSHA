import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { ConflictsService } from './conflicts.service';
import { ListConflictsDto, ResolveConflictDto } from './dto';

@Controller('conflicts')
export class ConflictsController {
  constructor(private readonly svc: ConflictsService) {}

  @Get()
  list(@Query() q: ListConflictsDto) { return this.svc.list(q); }

  @Get(':id')
  get(@Param('id') id: string) { return this.svc.get(id); }

  @Post(':id/resolve')
  @Roles('official', 'admin')
  resolve(@Param('id') id: string, @Body() dto: ResolveConflictDto, @Req() req: any) {
    return this.svc.resolve(id, { ...dto, resolvedBy: dto.resolvedBy ?? req.user.email });
  }
}
