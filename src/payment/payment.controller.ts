import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentMethodDto, PaymentMethodListQueryDto } from './payment-info.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';

@Controller('payment-info')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  async findAll(@Query() query: PaymentMethodListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.paymentService.findAll(user.clinicId, query);
  }

  @Post()
  async create(@Body() dto: PaymentMethodDto, @CurrentUser() user: CurrentUserData) {
    return await this.paymentService.create(dto, user.clinicId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: PaymentMethodDto) {
    return await this.paymentService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return await this.paymentService.remove(id);
  }
}