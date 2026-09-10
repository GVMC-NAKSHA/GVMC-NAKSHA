import { Module } from '@nestjs/common';
import { VerifyService } from './verify.service';
@Module({ providers: [VerifyService], exports: [VerifyService] })
export class VerifyModule {}
