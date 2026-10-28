import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { AuditService } from '../audit/audit.service';
import { AuditAction, Prisma } from '../generated/prisma/client';
import { ProviderDto, ProviderListQueryDto, ProviderServiceDto } from './providers.dto';

@Injectable()
export class ProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) { }

  async getProviders(clinicId: string, query: ProviderListQueryDto) {
    const where = {
      clinicId,
      isActive: true,
      ...(query.type ? { type: query.type } : {}),
      ...(query.search
        ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { businessName: { contains: query.search, mode: 'insensitive' as const } },
            { identify: { contains: query.search, mode: 'insensitive' as const } },
            { type: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [providers, total] = await Promise.all([
      this.prisma.provider.findMany({
        where,
        include: { services: true },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.provider.count({ where }),
    ]);
    return toPaginatedResult(providers, total, query.page, query.limit);
  }

  async findOne(id: string, clinicId: string) {
    const provider = await this.prisma.provider.findFirst({
      where: { id, clinicId },
      include: { services: true },
    });
    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    return provider;
  }

  async createProvider(providers: ProviderDto, clinicId: string) {
    const existing = await this.prisma.provider.findFirst({
      where: { clinicId, identify: providers.identify },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Ya existe un proveedor con esta identificación en la clínica');
    }

    try {
      const provider = await this.prisma.$transaction(async (tx) => {
        const created = await tx.provider.create({ data: { ...providers, clinicId } });

        await this.auditService.record({
          entity: 'Provider',
          entityId: created.id,
          action: AuditAction.CREATE,
          metadata: { fields: Object.keys(providers) },
          clinicId,
        }, tx);

        return created;
      });

      return writeResponse('Proveedor agregado exitosamente', provider);
    } catch (error) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async updateProvider(id: string, dto: ProviderDto, clinicId: string) {
    const existing = await this.findOne(id, clinicId);
    const duplicate = await this.prisma.provider.findFirst({
      where: { clinicId, identify: dto.identify, id: { not: id } },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Ya existe un proveedor con esta identificación en la clínica');
    }

    try {
      const provider = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.provider.update({ where: { id }, data: dto });

        await this.auditService.record({
          entity: 'Provider',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: { fields: Object.keys(dto) },
          clinicId: existing.clinicId,
        }, tx);

        return updated;
      });

      return writeResponse('Proveedor actualizado exitosamente', provider);
    } catch (error) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async removeProvider(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const provider = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.provider.update({
        where: { id },
        data: { isActive: false }
      });

      await this.auditService.record({
        entity: 'Provider',
        entityId: deleted.id,
        action: AuditAction.DELETE,
        metadata: { softDelete: true },
        clinicId: deleted.clinicId,
      }, tx);

      return deleted;
    });

    return writeResponse('Proveedor eliminado exitosamente', provider);
  }

  async createService(providerId: string, serviceProvider: ProviderServiceDto, clinicId: string) {
    const provider = await this.findOne(providerId, clinicId);
    const service = await this.prisma.$transaction(async (tx) => {
      const created = await tx.providerService.create({
        data: { ...serviceProvider, providerId },
      });

      await this.auditService.record({
        entity: 'ProviderService',
        entityId: created.id,
        action: AuditAction.CREATE,
        metadata: { fields: Object.keys(serviceProvider) },
        clinicId: provider.clinicId,
      }, tx);

      return created;
    });

    return writeResponse('Servicio agregado exitosamente', service);
  }

  async updateService(serviceId: string, serviceProvider: ProviderServiceDto, clinicId: string) {
    const service = await this.prisma.providerService.findFirst({
      where: { id: serviceId, provider: { clinicId } },
      include: { provider: true },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerService.update({ where: { id: serviceId }, data: serviceProvider });

      await this.auditService.record({
        entity: 'ProviderService',
        entityId: result.id,
        action: AuditAction.UPDATE,
        metadata: { fields: Object.keys(serviceProvider) },
        clinicId: service.provider.clinicId,
      }, tx);

      return result;
    });

    return writeResponse('Servicio actualizado exitosamente', updated);
  }

  async removeService(serviceId: string, clinicId: string) {
    const service = await this.prisma.providerService.findFirst({
      where: { id: serviceId, provider: { clinicId } },
      include: { provider: true },
    });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerService.update({ where: { id: serviceId }, data: { isActive: false } });

      await this.auditService.record({
        entity: 'ProviderService',
        entityId: result.id,
        action: AuditAction.DELETE,
        metadata: { softDelete: true },
        clinicId: service.provider.clinicId,
      }, tx);

      return result;
    });

    return writeResponse('Servicio eliminado exitosamente', deleted);
  }

  private handleDuplicate(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un proveedor con esta identificación en la clínica');
    }
  }
}