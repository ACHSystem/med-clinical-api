import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentMethodDto, PaymentMethodListQueryDto } from './payment-info.dto';
import { CurrentUser, CurrentUserData } from '../common/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../generated/prisma/client';

@Controller('payment-info')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  async getAllPayments(@Query() query: PaymentMethodListQueryDto, @CurrentUser() user: CurrentUserData) {
    return await this.paymentService.getAllPayments(user.clinicId, query);
  }

  @Roles(Role.DOCTOR)
  @Post()
  async create(@Body() dto: PaymentMethodDto, @CurrentUser() user: CurrentUserData) {
    return await this.paymentService.createPaymentMethod(dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: PaymentMethodDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return await this.paymentService.updatePaymentMethod(id, dto, user.clinicId);
  }

  @Roles(Role.DOCTOR)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return await this.paymentService.removePaymentMethod(id, user.clinicId);
  }
}