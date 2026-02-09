import { Module } from '@nestjs/common';
import { DgiiService } from './dgii.service';
import { SigningModule } from '../signing/signing.module';

@Module({
  imports: [SigningModule],
  providers: [DgiiService],
  exports: [DgiiService],
})
export class DgiiModule {}
