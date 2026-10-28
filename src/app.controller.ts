import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { detailResponse } from './common/api-response';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello() {
    return detailResponse({
      service: this.appService.getHello(),
      status: 'ok',
    });
  }
}
