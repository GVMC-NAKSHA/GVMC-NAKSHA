import { Module } from '@nestjs/common';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';
import { VerifyModule } from '../verify/verify.module';
@Module({ imports: [VerifyModule], controllers: [PropertiesController], providers: [PropertiesService] })
export class PropertiesModule {}
