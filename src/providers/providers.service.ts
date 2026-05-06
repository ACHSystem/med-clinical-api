import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderDto, ProviderServiceDto } from './providers.dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) { }

  async getProviders() {
    return this.prisma.provider.findMany({
      where: { isActive: true },
      include: { services: true },
      orderBy: { createdAt: 'desc' },
    });
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

  async create(providers: ProviderDto) {
    const provider = await this.prisma.provider.create({ data: providers });
    return {
      status: true,
      message: 'Proveedor agregado exitosamente',
      data: provider,
    };
  }

  async update(id: string, dto: ProviderDto) {
    await this.findOne(id);
    const provider = await this.prisma.provider.update({ where: { id }, data: dto });
    return {
      status: true,
      message: 'Proveedor actualizado exitosamente',
      data: provider,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    const provider = await this.prisma.provider.update({ where: { id }, data: { isActive: false } });
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