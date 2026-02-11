import { Module } from '@nestjs/common';
import { SequencesService } from './sequences.service';
import { SequencesController } from './sequences.controller';
import { SigningModule } from '../signing/signing.module';
import { DgiiModule } from '../dgii/dgii.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { XmlBuilderModule } from '../xml-builder/xml-builder.module';

@Module({
  imports: [SigningModule, DgiiModule, CertificatesModule, XmlBuilderModule],
  controllers: [SequencesController],
  providers: [SequencesService],
  exports: [SequencesService],
})
export class SequencesModule {}
