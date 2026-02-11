import { Module } from '@nestjs/common';
import { ReceptionService } from './reception.service';
import { ReceptionController } from './reception.controller';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { SigningModule } from '../signing/signing.module';
import { DgiiModule } from '../dgii/dgii.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { ResponseXmlBuilder } from '../xml-builder/response-xml-builder';

@Module({
  imports: [WebhooksModule, SigningModule, DgiiModule, CertificatesModule],
  controllers: [ReceptionController],
  providers: [ReceptionService, ResponseXmlBuilder],
  exports: [ReceptionService],
})
export class ReceptionModule {}
