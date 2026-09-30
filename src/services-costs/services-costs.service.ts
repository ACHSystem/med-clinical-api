import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { DolarDTO, IDolar, ServiceCostDto, ServiceCostListQueryDto } from './services-costs.dto';
import axios from 'axios';

@Injectable()
export class ServicesCostsService {
  constructor(private prisma: PrismaService) { }

  async getServicesAndCosts(clinicId: string, query: ServiceCostListQueryDto) {
    const where = {
      clinicId,
      isActive: query.isActive ?? true,
      ...(query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            price: {
              ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
              ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
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

  async findOne(id: string) {
    const service = await this.prisma.serviceCost.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Servicio no encontrado');
    }
    return service;
  }

  async getCurrentDolar() {
    try {
      const getLatestDolar = await this.prisma.dolar.findFirst({
        orderBy: { id: 'desc' }
      });

      return getLatestDolar;
    } catch (err) {
      return {
        success: false,
        data: null,
        message: 'Error al obtener el precio del dolar en estos momentos.'
      }
    }
  }

  async saveDolarAutomatic() {
    try {
      // const response: Dolar = await axios.get('https://pydolarve.org/api/v2/tipo-cambio?currency=usd&format_date=default&rounded_price=true').then(res => res.data);
      const response: IDolar = await axios.get('https://ve.dolarapi.com/v1/dolares/oficial').then(res => res.data);
      const parseResponse = {
        value: response.promedio,
        date: new Date(response.fechaActualizacion)
      }
      return await this.saveDolar(parseResponse);
    } catch (err) {
      return {
        success: false,
        message: 'Error al obtener el precio del dolar en estos momentos.',
        data: null
      };
    }
  }

  async saveDolar(dolar: DolarDTO) {
    try {
      const dolarSaved = await this.prisma.dolar.create({
        data: {
          value: dolar.value,
          date: dolar.date
        }
      })
      return {
        message: 'Tasa de dolar guardada exitosamente.',
        success: true,
        data: dolarSaved
      };
    } catch (err) {
      return {
        message: 'Error al guardar la tasa de dolar.',
        success: false,
        data: null
      };
    }
  }

  async create(serviceCost: ServiceCostDto, clinicId: string) {
    const service = await this.prisma.serviceCost.create({
      data: {
        name: serviceCost.name,
        description: serviceCost.description || '',
        price: serviceCost.price,
        clinicId,
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
    const service = await this.prisma.serviceCost.update({
      where: { id }, data: {
        name: serviceCost.name,
        description: serviceCost.description || '',
        price: serviceCost.price
      }
    });
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