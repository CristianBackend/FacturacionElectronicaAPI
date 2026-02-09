import { Module } from '@nestjs/common';
import { ContingencyService } from './contingency.service';
import { ContingencyController } from './contingency.controller';

@Module({
  controllers: [ContingencyController],
  providers: [ContingencyService],
  exports: [ContingencyService],
})
export class ContingencyModule {}
