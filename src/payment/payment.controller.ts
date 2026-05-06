import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentMethodDto } from './payment-info.dto';
import { AuthGuard } from '../auth/auth.guard';

@Controller('payment-info')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  @Get()
  async findAll() {
    return await this.paymentService.findAll();
  }

  @Post()
  async create(@Body() dto: PaymentMethodDto) {
    return await this.paymentService.create(dto);
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