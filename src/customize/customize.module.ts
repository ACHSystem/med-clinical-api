import { Module } from '@nestjs/common';
import { CustomizeController } from './customize.controller';
import { CustomizeService } from './customize.service';

@Module({
  controllers: [CustomizeController],
  providers: [CustomizeService]
})
export class CustomizeModule {}
