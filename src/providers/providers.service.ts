import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { ProviderDto, ProviderListQueryDto, ProviderServiceDto } from './providers.dto';

@Injectable()
export class ProvidersService {
  constructor(private readonly prisma: PrismaService) { }

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

  async findOne(id: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: { services: true },
    });
    if (!provider) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    return provider;
  }

  async createProvider(providers: ProviderDto, clinicId: string) {
    const provider = await this.prisma.provider.create({ data: { ...providers, clinicId } });
    return {
      status: true,
      message: 'Proveedor agregado exitosamente',
      data: provider,
    };
  }

  async updateProvider(id: string, dto: ProviderDto) {
    await this.findOne(id);
    const provider = await this.prisma.provider.update({ where: { id }, data: dto });
    return {
      status: true,
      message: 'Proveedor actualizado exitosamente',
      data: provider,
    };
  }

  async removeProvider(id: string) {
    await this.findOne(id);
    const provider = await this.prisma.provider.update({
      where: { id },
      data: { isActive: false }
    });
    return {
      status: true,
      message: 'Proveedor eliminado exitosamente',
      data: provider,
    };
  }

  async createService(providerId: string, serviceProvider: ProviderServiceDto) {
    await this.findOne(providerId);
    const service = await this.prisma.providerService.create({
      data: { ...serviceProvider, providerId },
    });
    return {
      status: true,
      message: 'Servicio agregado exitosamente',
      data: service,
    };
  }

  async updateService(serviceId: string, serviceProvider: ProviderServiceDto) {
    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }
    const updated = await this.prisma.providerService.update({ where: { id: serviceId }, data: serviceProvider });
    return {
      status: true,
      message: 'Servicio actualizado exitosamente',
      data: updated,
    };
  }

  async removeService(serviceId: string) {
    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }
    const deleted = await this.prisma.providerService.update({ where: { id: serviceId }, data: { isActive: false } });
    return {
      status: true,
      message: 'Servicio eliminado exitosamente',
      data: deleted,
    };
  }
}