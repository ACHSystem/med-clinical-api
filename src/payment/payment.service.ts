import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethodDto } from './payment-info.dto';

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) { }

  async findAll() {
    return this.prisma.paymentMethod.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const info = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!info) {
      throw new NotFoundException('Información de pago no encontrada');
    }
    return info;
  }

  async create(paymentMethod: PaymentMethodDto) {
    const info = await this.prisma.paymentMethod.create({
      data: {
        bank: paymentMethod.bank,
        identify: paymentMethod.identify,
        phone: paymentMethod.phone,
        email: paymentMethod.email,
        account: paymentMethod.account,
      }
    });
    return {
      status: true,
      message: 'Información de pago agregada exitosamente',
      data: info,
    };
  }

  async update(id: string, dto: PaymentMethodDto) {
    await this.findOne(id);
    const info = await this.prisma.paymentMethod.update({ where: { id }, data: dto });
    return {
      status: true,
      message: 'Información de pago actualizada exitosamente',
      data: info,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    const info = await this.prisma.paymentMethod.update({ where: { id }, data: { isActive: false } });
    return {
      status: true,
      message: 'Información de pago eliminada exitosamente',
      data: info,
    };
  }
}