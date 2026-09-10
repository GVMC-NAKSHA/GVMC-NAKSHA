import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Roles } from '../common/roles.decorator';
import { PropertiesService } from './properties.service';
import { VerifyService } from '../verify/verify.service';
import { VerifyDto } from '../verify/dto';

@Controller('properties')
export class PropertiesController {
  constructor(private readonly props: PropertiesService, private readonly verify: VerifyService) {}

  @Get(':id')                     get(@Param('id') id: string) { return this.props.getProperty(id); }
  @Post(':id/verify')
  @Roles('official', 'admin')     verifyProp(@Param('id') id: string, @Body() dto: VerifyDto, @Req() req: any) {
                                    return this.verify.updateStatus(id, { ...dto, updatedBy: dto.updatedBy ?? req.user.email }); }
  @Get(':id/explain')            explain(@Param('id') id: string) { return this.props.explain(id); }
}
