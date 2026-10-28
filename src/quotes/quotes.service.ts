import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { detailResponse, writeResponse } from '../common/api-response';
import { AuditService } from '../audit/audit.service';
import { AuditAction, Prisma, QuoteStatus } from '../generated/prisma/client';
import {
  CreateQuoteDto,
  QuoteItemDto,
  QuoteListQueryDto,
  UpdateQuoteDto,
} from './quotes.dto';
import { calculateQuoteTotals } from './quotes.calculator';

const QUOTE_INCLUDE = {
  patient: true,
  items: { orderBy: { sortOrder: 'asc' } },
  paymentMethod: true,
  dolar: true,
  createdBy: { select: { id: true, name: true, lastName: true } },
  supersedes: { select: { id: true, version: true, status: true } },
  supersededBy: { select: { id: true, version: true, status: true } },
} satisfies Prisma.QuoteInclude;

const EDITABLE_STATUSES: QuoteStatus[] = [QuoteStatus.DRAFT];

interface ResolvedQuoteItem {
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  sortOrder: number;
  serviceCostId: string | null;
  providerServiceId: string | null;
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getQuotes(clinicId: string, query: QuoteListQueryDto) {
    const where: Prisma.QuoteWhereInput = {
      clinicId,
      isActive: query.isActive ?? true,
      ...(query.includeSuperseded ? {} : { supersededAt: null }),
      ...(query.status ? { status: query.status } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.paymentMethodId
        ? { paymentMethodId: query.paymentMethodId }
        : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom
                ? { gte: new Date(query.createdFrom) }
                : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                title: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                description: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                patient: {
                  is: {
                    OR: [
                      {
                        name: {
                          contains: query.search,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        lastName: {
                          contains: query.search,
                          mode: 'insensitive' as const,
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [quotes, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: QUOTE_INCLUDE,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.quote.count({ where }),
    ]);
    return toPaginatedResult(quotes, total, query.page, query.limit);
  }

  async findOne(id: string, clinicId: string, includeInactive = false) {
    const quote = await this.prisma.quote.findFirst({
      where: {
        id,
        clinicId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: QUOTE_INCLUDE,
    });
    if (!quote) {
      throw new NotFoundException('Presupuesto no encontrado');
    }
    return quote;
  }

  async getOne(id: string, clinicId: string) {
    return detailResponse(await this.findOne(id, clinicId));
  }

  /** Historial completo de versiones (incluye reemplazadas) de la cadena raíz. */
  async getVersions(id: string, clinicId: string) {
    const quote = await this.prisma.quote.findFirst({
      where: { id, clinicId },
      select: { id: true, rootQuoteId: true },
    });
    if (!quote) {
      throw new NotFoundException('Presupuesto no encontrado');
    }

    const rootId = quote.rootQuoteId ?? quote.id;
    const versions = await this.prisma.quote.findMany({
      where: {
        clinicId,
        OR: [{ id: rootId }, { rootQuoteId: rootId }],
      },
      include: QUOTE_INCLUDE,
      orderBy: { version: 'asc' },
    });

    return detailResponse(versions);
  }

  async create(dto: CreateQuoteDto, clinicId: string, userId: string) {
    const date = dto.date ? new Date(dto.date) : new Date();
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    this.assertValidDates(date, validUntil);

    const patient = await this.prisma.patient.findFirst({
      where: { id: dto.patientId, clinicId, isActive: true },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const dolar = await this.resolveDolar(dto.dolarId);
    const paymentMethodId = dto.paymentMethodId
      ? (await this.resolvePaymentMethod(dto.paymentMethodId, clinicId)).id
      : null;

    const items = await this.resolveItems(dto.items, clinicId);
    const totals = calculateQuoteTotals({
      items,
      discount: dto.discount,
      tax: dto.tax,
    });
    this.assertAdjustments(totals.subtotal, totals.discount, totals.tax);

    const id = randomUUID();
    const status = dto.status ?? QuoteStatus.DRAFT;
    const now = new Date();

    const quote = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          id,
          title: dto.title,
          description: dto.description ?? null,
          date,
          validUntil,
          dolarId: dolar.id,
          currency: dto.currency ?? 'USD',
          exchangeRate: dolar.value,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          status,
          issuedAt: status === QuoteStatus.SENT ? now : null,
          version: 1,
          rootQuoteId: id,
          clinicId,
          patientId: patient.id,
          createdById: userId,
          paymentMethodId,
          items: {
            create: totals.items.map((item) => ({
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              sortOrder: item.sortOrder,
              serviceCostId: item.serviceCostId,
              providerServiceId: item.providerServiceId,
            })),
          },
        },
        include: QUOTE_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Quote',
          entityId: created.id,
          action: AuditAction.CREATE,
          metadata: {
            fields: [
              'title',
              'description',
              'date',
              'validUntil',
              'currency',
              'exchangeRate',
              'discount',
              'tax',
              'status',
              'patientId',
              'dolarId',
              'paymentMethodId',
              'items',
            ],
            version: created.version,
            total: created.total.toString(),
          },
          userId,
          clinicId,
        },
        tx,
      );

      return created;
    });

    return writeResponse('Presupuesto agregado exitosamente', quote);
  }

  async update(
    id: string,
    dto: UpdateQuoteDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.findOne(id, clinicId, true);
    const hasContent = Object.keys(dto).some((key) => key !== 'isActive');

    if (!existing.isActive) {
      if (dto.isActive !== true) {
        throw new NotFoundException('Presupuesto no encontrado');
      }
      if (hasContent) {
        throw new BadRequestException(
          'Solo se puede reactivar el presupuesto; edite el borrador después de reactivarlo',
        );
      }

      const reactivated = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.quote.update({
          where: { id },
          data: { isActive: true },
          include: QUOTE_INCLUDE,
        });

        await this.auditService.record(
          {
            entity: 'Quote',
            entityId: updated.id,
            action: AuditAction.UPDATE,
            metadata: { fields: ['isActive'], isActive: true },
            userId,
            clinicId,
          },
          tx,
        );

        return updated;
      });

      return writeResponse('Presupuesto reactivado exitosamente', reactivated);
    }

    if (existing.supersededAt) {
      throw new ConflictException(
        'Esta versión fue reemplazada por una versión más reciente',
      );
    }

    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new ConflictException(
        'Solo se pueden editar presupuestos en borrador; use /revise para crear una nueva versión',
      );
    }

    const date = dto.date ? new Date(dto.date) : existing.date;
    const validUntil =
      dto.validUntil !== undefined
        ? dto.validUntil
          ? new Date(dto.validUntil)
          : null
        : existing.validUntil;
    this.assertValidDates(date, validUntil);

    const dolar = dto.dolarId
      ? await this.resolveDolar(dto.dolarId)
      : await this.resolveDolar(existing.dolarId);

    let paymentMethodId = existing.paymentMethodId;
    if (Object.prototype.hasOwnProperty.call(dto, 'paymentMethodId')) {
      paymentMethodId = dto.paymentMethodId
        ? (await this.resolvePaymentMethod(dto.paymentMethodId, clinicId)).id
        : null;
    }

    const items = dto.items
      ? await this.resolveItems(dto.items, clinicId)
      : existing.items.map((item) => ({
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          sortOrder: item.sortOrder,
          serviceCostId: item.serviceCostId,
          providerServiceId: item.providerServiceId,
        }));

    const totals = calculateQuoteTotals({
      items,
      discount: dto.discount ?? existing.discount,
      tax: dto.tax ?? existing.tax,
    });
    this.assertAdjustments(totals.subtotal, totals.discount, totals.tax);

    const quote = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id },
        data: {
          title: dto.title ?? existing.title,
          description: dto.description ?? existing.description,
          date,
          validUntil,
          dolarId: dolar.id,
          currency: dto.currency ?? existing.currency,
          exchangeRate: dolar.value,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          paymentMethodId,
          ...(dto.items
            ? {
                items: {
                  deleteMany: {},
                  create: totals.items.map((item) => ({
                    name: item.name,
                    description: item.description,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    total: item.total,
                    sortOrder: item.sortOrder,
                    serviceCostId: item.serviceCostId,
                    providerServiceId: item.providerServiceId,
                  })),
                },
              }
            : {}),
        },
        include: QUOTE_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Quote',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: {
            fields: Object.keys(dto),
            version: updated.version,
            total: updated.total.toString(),
          },
          userId,
          clinicId,
        },
        tx,
      );

      return updated;
    });

    return writeResponse('Presupuesto actualizado exitosamente', quote);
  }

  async revise(id: string, clinicId: string, userId: string) {
    const existing = await this.findOne(id, clinicId);

    if (existing.supersededAt) {
      throw new ConflictException(
        'Esta versión ya fue reemplazada por una versión más reciente',
      );
    }

    const totals = calculateQuoteTotals({
      items: existing.items.map((item) => ({
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
      discount: existing.discount,
      tax: existing.tax,
    });

    const newId = randomUUID();
    const now = new Date();

    const quote = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          id: newId,
          title: existing.title,
          description: existing.description,
          date: existing.date,
          validUntil: existing.validUntil,
          dolarId: existing.dolarId,
          currency: existing.currency,
          exchangeRate: existing.exchangeRate,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          status: QuoteStatus.DRAFT,
          version: existing.version + 1,
          rootQuoteId: existing.rootQuoteId ?? existing.id,
          supersedesId: existing.id,
          clinicId,
          patientId: existing.patientId,
          createdById: userId,
          paymentMethodId: existing.paymentMethodId,
          items: {
            create: existing.items.map((item) => ({
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.total,
              sortOrder: item.sortOrder,
              serviceCostId: item.serviceCostId,
              providerServiceId: item.providerServiceId,
            })),
          },
        },
        include: QUOTE_INCLUDE,
      });

      await tx.quote.update({
        where: { id: existing.id },
        data: { supersededAt: now },
      });

      await this.auditService.record(
        {
          entity: 'Quote',
          entityId: created.id,
          action: AuditAction.CREATE,
          metadata: {
            fields: ['version', 'supersedesId', 'rootQuoteId'],
            version: created.version,
            supersedesId: existing.id,
            rootQuoteId: created.rootQuoteId,
          },
          userId,
          clinicId,
        },
        tx,
      );

      await this.auditService.record(
        {
          entity: 'Quote',
          entityId: existing.id,
          action: AuditAction.UPDATE,
          metadata: { fields: ['supersededAt'], supersededBy: created.id },
          userId,
          clinicId,
        },
        tx,
      );

      return created;
    });

    return writeResponse(
      'Nueva versión del presupuesto creada exitosamente',
      quote,
    );
  }

  async remove(id: string, clinicId: string, userId: string) {
    const existing = await this.findOne(id, clinicId);

    if (existing.supersededAt) {
      throw new ConflictException(
        'Solo se puede eliminar la última versión del presupuesto',
      );
    }

    const quote = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.quote.update({
        where: { id },
        // Al dar de baja la última versión se libera el vinculo con la anterior
        // para que esta pueda volver a ser la vigente y ser revisada de nuevo.
        data: { isActive: false, supersedesId: null },
        include: QUOTE_INCLUDE,
      });

      if (existing.supersedesId) {
        await tx.quote.updateMany({
          where: {
            id: existing.supersedesId,
            clinicId,
            isActive: true,
          },
          data: { supersededAt: null },
        });
      }

      await this.auditService.record(
        {
          entity: 'Quote',
          entityId: deleted.id,
          action: AuditAction.DELETE,
          metadata: { softDelete: true, version: deleted.version },
          userId,
          clinicId,
        },
        tx,
      );

      return deleted;
    });

    return writeResponse('Presupuesto eliminado exitosamente', quote);
  }

  async send(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      QuoteStatus.SENT,
      [QuoteStatus.DRAFT],
      {
        issuedAt: new Date(),
      },
    );
  }

  async approve(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      QuoteStatus.APPROVED,
      [QuoteStatus.SENT],
      {
        approvedAt: new Date(),
      },
    );
  }

  async reject(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      QuoteStatus.REJECTED,
      [QuoteStatus.SENT],
      {
        rejectedAt: new Date(),
      },
    );
  }

  async cancel(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      QuoteStatus.CANCELLED,
      [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.APPROVED],
      {},
    );
  }

  async expire(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      QuoteStatus.EXPIRED,
      [QuoteStatus.SENT, QuoteStatus.APPROVED],
      {},
    );
  }

  private async transition(
    id: string,
    clinicId: string,
    userId: string,
    target: QuoteStatus,
    allowedFrom: QuoteStatus[],
    timestamps: Prisma.QuoteUpdateInput,
  ) {
    const existing = await this.findOne(id, clinicId);

    if (existing.supersededAt) {
      throw new ConflictException(
        'Esta versión fue reemplazada por una versión más reciente',
      );
    }

    if (!allowedFrom.includes(existing.status)) {
      throw new ConflictException(
        `No se puede pasar el presupuesto de ${existing.status} a ${target}`,
      );
    }

    const quote = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.quote.update({
        where: { id },
        data: { ...timestamps, status: target },
        include: QUOTE_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Quote',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: { status: target, previousStatus: existing.status },
          userId,
          clinicId,
        },
        tx,
      );

      return updated;
    });

    return writeResponse(
      `Presupuesto actualizado a ${target} exitosamente`,
      quote,
    );
  }

  private async resolveDolar(dolarId: string) {
    const dolar = await this.prisma.dolar.findUnique({
      where: { id: dolarId },
    });
    if (!dolar) {
      throw new NotFoundException('Tasa de dólar no encontrada');
    }
    return dolar;
  }

  private async resolvePaymentMethod(
    paymentMethodId: string,
    clinicId: string,
  ) {
    const paymentMethod = await this.prisma.paymentMethod.findFirst({
      where: { id: paymentMethodId, clinicId, isActive: true },
      select: { id: true },
    });
    if (!paymentMethod) {
      throw new NotFoundException('Método de pago no encontrado');
    }
    return paymentMethod;
  }

  private async resolveItems(
    items: QuoteItemDto[],
    clinicId: string,
  ): Promise<ResolvedQuoteItem[]> {
    const serviceCostIds = [
      ...new Set(items.map((item) => item.serviceCostId).filter(Boolean)),
    ] as string[];
    const providerServiceIds = [
      ...new Set(items.map((item) => item.providerServiceId).filter(Boolean)),
    ] as string[];

    const serviceCosts = serviceCostIds.length
      ? await this.prisma.serviceCost.findMany({
          where: { id: { in: serviceCostIds }, clinicId, isActive: true },
        })
      : [];
    const providerServices = providerServiceIds.length
      ? await this.prisma.providerService.findMany({
          where: {
            id: { in: providerServiceIds },
            isActive: true,
            provider: { clinicId },
          },
        })
      : [];

    const serviceCostById = new Map(
      serviceCosts.map((cost) => [cost.id, cost]),
    );
    const providerServiceById = new Map(
      providerServices.map((service) => [service.id, service]),
    );

    return items.map((item, index) => {
      if (item.serviceCostId && item.providerServiceId) {
        throw new BadRequestException(
          'Un ítem no puede referenciar un costo de servicio y un servicio de proveedor a la vez',
        );
      }

      const sortOrder = item.sortOrder ?? index;

      if (item.serviceCostId) {
        const cost = serviceCostById.get(item.serviceCostId);
        if (!cost) {
          throw new NotFoundException('Costo de servicio no encontrado');
        }

        return {
          name: cost.name,
          description: cost.description,
          quantity: item.quantity ?? 1,
          unitPrice: cost.price,
          sortOrder,
          serviceCostId: cost.id,
          providerServiceId: null,
        };
      }

      if (item.providerServiceId) {
        const service = providerServiceById.get(item.providerServiceId);
        if (!service) {
          throw new NotFoundException('Servicio de proveedor no encontrado');
        }

        return {
          name: service.name,
          description: service.description,
          quantity: item.quantity ?? 1,
          unitPrice: service.price,
          sortOrder,
          serviceCostId: null,
          providerServiceId: service.id,
        };
      }

      if (!item.name || item.unitPrice === undefined) {
        throw new BadRequestException(
          'Los ítems libres requieren name y unitPrice',
        );
      }

      return {
        name: item.name,
        description: item.description ?? null,
        quantity: item.quantity ?? 1,
        unitPrice: new Prisma.Decimal(item.unitPrice),
        sortOrder,
        serviceCostId: null,
        providerServiceId: null,
      };
    });
  }

  private assertValidDates(date: Date, validUntil: Date | null) {
    if (!validUntil) {
      return;
    }

    if (validUntil.getTime() < date.getTime()) {
      throw new BadRequestException(
        'La fecha de vencimiento no puede ser anterior a la fecha del presupuesto',
      );
    }
  }

  private assertAdjustments(
    subtotal: Prisma.Decimal,
    discount: Prisma.Decimal,
    tax: Prisma.Decimal,
  ) {
    if (discount.greaterThan(subtotal)) {
      throw new BadRequestException(
        'El descuento no puede superar el subtotal',
      );
    }

    if (tax.isNegative() || discount.isNegative()) {
      throw new BadRequestException(
        'El descuento y el impuesto no pueden ser negativos',
      );
    }
  }
}
