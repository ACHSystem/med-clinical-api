import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '../generated/prisma/client';
import { RequestContextService } from '../common/observability/request-context';
import { toPaginatedResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogListQueryDto } from './audit.dto';

export interface AuditInput {
  entity: string;
  entityId: string;
  action: AuditAction;
  metadata?: Record<string, unknown>;
  userId?: string | null;
  clinicId?: string | null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'authorization',
  'data',
  'vitalSigns',
  'notes',
  'diagnosis',
  'symptoms',
  'observations',
  'evaluation',
  'reason',
  'email',
  'phone',
  'address',
  'identify',
  'account',
]);

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
  ) {}

  async findAll(clinicId: string, query: AuditLogListQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      clinicId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.dateFrom || query.dateTo
        ? {
            createdAt: {
              ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return toPaginatedResult(logs, total, query.page, query.limit);
  }

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma;
    const context = this.requestContext.get();

    await client.auditLog.create({
      data: {
        entity: input.entity,
        entityId: input.entityId,
        action: input.action,
        metadata: input.metadata
          ? (this.sanitize(input.metadata) as Prisma.InputJsonValue)
          : undefined,
        userId: input.userId ?? context?.userId ?? null,
        clinicId: input.clinicId ?? context?.clinicId ?? null,
        ipAddress: context?.ip,
        requestId: context?.requestId,
      },
    });
  }

  private sanitize(metadata: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(metadata)) {
      if (SENSITIVE_KEYS.has(key)) {
        continue;
      }

      if (key === 'fields' && Array.isArray(value)) {
        result.fields = value.filter(
          (field): field is string => typeof field === 'string' && !SENSITIVE_KEYS.has(field),
        );
        continue;
      }

      if (
        value === null
        || typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
      ) {
        result[key] = value;
      }
    }

    return result;
  }
}
