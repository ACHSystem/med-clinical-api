import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { AuditService } from '../audit/audit.service';
import { AuditAction, Prisma } from '../generated/prisma/client';
import { DolarDTO, IDolar, ServiceCostDto, ServiceCostListQueryDto } from './services-costs.dto';
import axios from 'axios';

@Injectable()
export class ServicesCostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) { }

  async getServicesAndCosts(clinicId: string, query: ServiceCostListQueryDto) {
    const where: Prisma.ServiceCostWhereInput = {
      clinicId,
      isActive: query.isActive ?? true,
      ...(query.priceMin !== undefined || query.priceMax !== undefined
        ? {
            price: {
              ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}),
              ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' as const } },
              { description: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [servicesAndCosts, total] = await Promise.all([
      this.prisma.serviceCost.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.serviceCost.count({ where }),
    ]);
    return toPaginatedResult(servicesAndCosts, total, query.page, query.limit);
  }

  async findOne(id: string, clinicId: string, includeInactive = false) {
    const service = await this.prisma.serviceCost.findFirst({
      where: {
        id,
        clinicId,
        ...(includeInactive ? {} : { isActive: true }),
      },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return service;
  }

  async getCurrentDolar() {
    const latest = await this.prisma.dolar.findFirst({
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    if (!latest) {
      throw new NotFoundException('Tasa de dólar no disponible');
    }

    return latest;
  }

  async saveDolarAutomatic() {
    let response: IDolar;

    try {
      response = await axios
        .get<IDolar>('https://ve.dolarapi.com/v1/dolares/oficial')
        .then((result) => result.data);
    } catch {
      throw new BadGatewayException('No se pudo obtener la cotización del dólar');
    }

    const date = new Date(response.fechaActualizacion);

    if (typeof response.promedio !== 'number' || Number.isNaN(date.getTime())) {
      throw new BadGatewayException('La cotización del dólar no tiene el formato esperado');
    }

    return this.saveDolar({ value: response.promedio, date });
  }

  async saveDolar(dolar: DolarDTO) {
    const rawDate = new Date(dolar.date);

    if (Number.isNaN(rawDate.getTime())) {
      throw new BadRequestException('La fecha de la tasa de dólar es inválida');
    }

    // La tasa se guarda por dia calendario UTC: dos capturas del mismo dia con el
    // mismo valor son la misma tasa, aunque la API externa cambie la hora exacta.
    const date = new Date(Date.UTC(
      rawDate.getUTCFullYear(),
      rawDate.getUTCMonth(),
      rawDate.getUTCDate(),
    ));
    const decimalValue = new Prisma.Decimal(dolar.value);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.dolar.findFirst({
          where: { date, value: decimalValue },
        });

        if (existing) {
          return { rate: existing, created: false };
        }

        const created = await tx.dolar.create({
          data: { value: decimalValue, date },
        });

        await this.auditService.record({
          entity: 'Dolar',
          entityId: created.id,
          action: AuditAction.CREATE,
          metadata: { value: dolar.value, date: date.toISOString() },
        }, tx);

        return { rate: created, created: true };
      });

      return writeResponse(
        result.created
          ? 'Tasa de dólar guardada exitosamente.'
          : 'La tasa de dólar ya estaba registrada.',
        result.rate,
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.dolar.findFirst({
          where: { date, value: decimalValue },
        });

        if (existing) {
          return writeResponse('La tasa de dólar ya estaba registrada.', existing);
        }
      }

      throw error;
    }
  }

  async create(serviceCost: ServiceCostDto, clinicId: string) {
    const service = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceCost.create({
        data: {
          name: serviceCost.name,
          description: serviceCost.description || '',
          price: serviceCost.price,
          clinicId,
        },
      });

      await this.auditService.record({
        entity: 'ServiceCost',
        entityId: created.id,
        action: AuditAction.CREATE,
        metadata: { fields: Object.keys(serviceCost) },
        clinicId,
      }, tx);

      return created;
    });

    return writeResponse('Costo de servicio agregado exitosamente', service);
  }

  async update(id: string, serviceCost: ServiceCostDto, clinicId: string) {
    await this.findOne(id, clinicId);
    const service = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceCost.update({
        where: { id },
        data: {
          name: serviceCost.name,
          description: serviceCost.description || '',
          price: serviceCost.price,
        },
      });

      await this.auditService.record({
        entity: 'ServiceCost',
        entityId: updated.id,
        action: AuditAction.UPDATE,
        metadata: { fields: Object.keys(serviceCost) },
        clinicId,
      }, tx);

      return updated;
    });

    return writeResponse('Costo de servicio actualizado exitosamente', service);
  }

  async remove(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const service = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.serviceCost.update({ where: { id }, data: { isActive: false } });

      await this.auditService.record({
        entity: 'ServiceCost',
        entityId: deleted.id,
        action: AuditAction.DELETE,
        metadata: { softDelete: true },
        clinicId,
      }, tx);

      return deleted;
    });

    return writeResponse('Costo de servicio eliminado exitosamente', service);
  }
}
