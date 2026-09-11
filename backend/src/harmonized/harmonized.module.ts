import { Module } from '@nestjs/common';
import { HarmonizedController } from './harmonized.controller';
import { HarmonizedService } from './harmonized.service';

@Module({ controllers: [HarmonizedController], providers: [HarmonizedService] })
export class HarmonizedModule {}
