import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { BriefService } from './brief.service';

@Controller('brief')
export class BriefController {
  constructor(private readonly svc: BriefService) {}
  @Get()
  @Roles('analyst', 'admin')            // 'analyst' == commissioner in this deployment
  get() { return this.svc.dailyBrief(); }
}
