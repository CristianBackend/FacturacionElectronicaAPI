import { Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { DgiiModule } from '../dgii/dgii.module';
import { SigningModule } from '../signing/signing.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { ContingencyModule } from '../contingency/contingency.module';

@Module({
  imports: [DgiiModule, SigningModule, CertificatesModule, ContingencyModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
