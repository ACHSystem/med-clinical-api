import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto, UpdateQuoteDto } from './quotes.dto';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async getQuotes(clinicId: string) {
    const quotes = await this.prisma.quote.findMany({
      where: { clinicId, isActive: true },
      include: { patient: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
    return quotes;
  }

  async findOne(id: string, clinicId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, clinicId },
      include: { patient: true, items: true },
    });
    if (!quote) {
      throw new NotFoundException('Presupuesto no encontrado');
    }
    return quote;
  }

  async create(quotes: CreateQuoteDto, clinicId: string, userId: string) {
    // El presupuesto no puede colgar de un paciente de otra clinica (IDOR)
    const patient = await this.prisma.patient.findFirst({ where: { id: quotes.patientId, clinicId } });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const { items, ...quoteData } = quotes;
    const quote = await this.prisma.quote.create({
      data: {
        ...quoteData,
        validUntil: quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
        clinicId,
        createdById: userId,
        items: {
          create: items.map(item => ({
            ...item,
            quantity: item.quantity || 1,
            total: item.unitPrice * (item.quantity || 1),
          })),
        },
      },
      include: { items: true, patient: true },
    });
    return {
      status: true,
      message: 'Presupuesto agregado exitosamente',
      data: quote,
    };
  }

  async update(id: string, quotes: UpdateQuoteDto, clinicId: string) {
    await this.findOne(id, clinicId);
    const quote = await this.prisma.quote.update({
      where: { id },
      data: {
        ...quotes,
        validUntil: quotes.validUntil ? new Date(quotes.validUntil) : undefined,
      },
      include: { items: true, patient: true },
    });
    return {
      status: true,
      message: 'Presupuesto actualizado exitosamente',
      data: quote,
    };
  }

  async remove(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const quote = await this.prisma.quote.update({ where: { id }, data: { isActive: false } });
    return {
      status: true,
      message: 'Presupuesto eliminado exitosamente',
      data: quote,
    };
  }
}