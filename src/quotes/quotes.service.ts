import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuoteDto, UpdateQuoteDto } from './quotes.dto';

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  async getQuotes(userId: string) {
    const quotes = await this.prisma.quote.findMany({
      where: { userId, isActive: true },
      include: { patient: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
    return quotes;
  }

  async findOne(id: string, userId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, userId },
      include: { patient: true, items: true },
    });
    if (!quote) {
      throw new NotFoundException('Presupuesto no encontrado');
    }
    return quote;
  }

  async create(quotes: CreateQuoteDto, userId: string) {
    const { items, ...quoteData } = quotes;
    const quote = await this.prisma.quote.create({
      data: {
        ...quoteData,
        validUntil: quoteData.validUntil ? new Date(quoteData.validUntil) : undefined,
        userId,
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

  async update(id: string, quotes: UpdateQuoteDto, userId: string) {
    await this.findOne(id, userId);
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

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    const quote = await this.prisma.quote.update({ where: { id }, data: { isActive: false } });
    return {
      status: true,
      message: 'Presupuesto eliminado exitosamente',
      data: quote,
    };
  }
}