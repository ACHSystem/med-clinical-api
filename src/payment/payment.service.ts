import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../generated/prisma/client';
import { PaymentMethodDto, PaymentMethodListQueryDto } from './payment-info.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) { }

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

  async findOne(id: string, clinicId: string) {
    const info = await this.prisma.paymentMethod.findFirst({ where: { id, clinicId } });
    if (!info) {
      throw new NotFoundException('Información de pago no encontrada');
    }
    return info;
  }

  async create(paymentMethod: PaymentMethodDto, clinicId: string) {
    const info = await this.prisma.$transaction(async (tx) => {
      const created = await tx.paymentMethod.create({
        data: {
          bank: paymentMethod.bank,
          identify: paymentMethod.identify,
          phone: paymentMethod.phone,
          email: paymentMethod.email,
          account: paymentMethod.account,
          clinicId,
        }
      });

      await this.auditService.record({
        entity: 'PaymentMethod',
        entityId: created.id,
        action: AuditAction.CREATE,
        metadata: { fields: Object.keys(paymentMethod) },
        clinicId,
      }, tx);

      return created;
    });

    return writeResponse('Información de pago agregada exitosamente', info);
  }

  async update(id: string, dto: PaymentMethodDto, clinicId: string) {
    await this.findOne(id, clinicId);
    const info = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.paymentMethod.update({ where: { id }, data: dto });

      await this.auditService.record({
        entity: 'PaymentMethod',
        entityId: updated.id,
        action: AuditAction.UPDATE,
        metadata: { fields: Object.keys(dto) },
        clinicId,
      }, tx);

      return updated;
    });

    return writeResponse('Información de pago actualizada exitosamente', info);
  }

  async remove(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const info = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.paymentMethod.update({ where: { id }, data: { isActive: false } });

      await this.auditService.record({
        entity: 'PaymentMethod',
        entityId: deleted.id,
        action: AuditAction.DELETE,
        metadata: { softDelete: true },
        clinicId,
      }, tx);

      return deleted;
    });

    return writeResponse('Información de pago eliminada exitosamente', info);
  }
}