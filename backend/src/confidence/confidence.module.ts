import { Global, Module } from '@nestjs/common';
import { ConfidenceService } from './confidence.service';

// @Global so any module can inject ConfidenceService without importing ConfidenceModule.
// The worker owns the batch confidence path (harmonize/match.py); this API-side service is
// only an optional on-demand recompute.
@Global()
@Module({ providers: [ConfidenceService], exports: [ConfidenceService] })
export class ConfidenceModule {}
