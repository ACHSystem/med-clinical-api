import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { PaymentMethodDto, PaymentMethodListQueryDto } from './payment-info.dto';

@Injectable()
export class PaymentService {
  constructor(private prisma: PrismaService) { }

  async findAll(clinicId: string, query: PaymentMethodListQueryDto) {
    const where = {
      clinicId,
      isActive: query.isActive ?? true,
      ...(query.search
        ? {
            OR: [
              { bank: { contains: query.search, mode: 'insensitive' as const } },
              { identify: { contains: query.search, mode: 'insensitive' as const } },
              { phone: { contains: query.search, mode: 'insensitive' as const } },
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { account: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [methods, total] = await Promise.all([
      this.prisma.paymentMethod.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.paymentMethod.count({ where }),
    ]);
    return toPaginatedResult(methods, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const info = await this.prisma.paymentMethod.findUnique({ where: { id } });
    if (!info) {
      throw new NotFoundException('Información de pago no encontrada');
    }
    return info;
  }

  async create(paymentMethod: PaymentMethodDto, clinicId: string) {
    const info = await this.prisma.paymentMethod.create({
      data: {
        bank: paymentMethod.bank,
        identify: paymentMethod.identify,
        phone: paymentMethod.phone,
        email: paymentMethod.email,
        account: paymentMethod.account,
        clinicId,
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