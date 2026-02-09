import { Module } from '@nestjs/common';
import { XmlBuilderService } from './xml-builder.service';

@Module({
  providers: [XmlBuilderService],
  exports: [XmlBuilderService],
})
export class XmlBuilderModule {}
