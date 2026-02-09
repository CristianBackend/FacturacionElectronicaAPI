import { Module, Global } from '@nestjs/common';
import { RncValidationService } from './rnc-validation.service';
import { RncController } from './rnc.controller';

@Global()
@Module({
  controllers: [RncController],
  providers: [RncValidationService],
  exports: [RncValidationService],
})
export class RncModule {}
