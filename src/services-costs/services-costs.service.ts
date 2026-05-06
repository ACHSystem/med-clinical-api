import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceCostDto } from './services-costs.dto';

@Injectable()
export class ServicesCostsService {
  constructor(private prisma: PrismaService) { }

  async getServicesAndCosts() {
    const servicesAndCosts = await this.prisma.serviceCost.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return servicesAndCosts;
  }

  async findOne(id: string) {
    const service = await this.prisma.serviceCost.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return service;
  }

  async create(serviceCost: ServiceCostDto) {
    const service = await this.prisma.serviceCost.create({
      data: {
        name: serviceCost.name,
        description: serviceCost.description || '',
        price: serviceCost.price
      }
    });
    return {
      status: true,
      message: 'Costo de servicio agregado exitosamente',
      data: service,
    };
  }

  async update(id: string, serviceCost: ServiceCostDto) {
    await this.findOne(id);
    const service = await this.prisma.serviceCost.update({ where: { id }, data: {
      name: serviceCost.name,
      description: serviceCost.description || '',
      price: serviceCost.price
    } });
    return {
      status: true,
      message: 'Costo de servicio actualizado exitosamente',
      data: service,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    const service = await this.prisma.serviceCost.update({ where: { id }, data: { isActive: false } });
    return {
      status: true,
      message: 'Costo de servicio eliminado exitosamente',
      data: service,
    };
  }
}