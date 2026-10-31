import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../generated/prisma/client';
import { CreateMedicalHistoryDto, MedicalHistoryListQueryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';
import { MedicalHistoryWriterService } from './medical-history-writer.service';

interface GetHistoryByPatientIdParams {
  patientId: string;
  clinicId: string;
  query: PaginationQueryDto;
}

@Injectable()
export class MedicalHistoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly medicalHistoryWriter: MedicalHistoryWriterService,
  ) { }

  async getAllHistories(clinicId: string, query: MedicalHistoryListQueryDto) {
    const where = {
      deleted: false,
      clinicId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateStart || query.dateTo
        ? {
          date: {
            ...(query.dateStart ? { gte: new Date(query.dateStart) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          },
        }
        : {}),
      ...(query.search
        ? {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' as const } },
            { notes: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [histories, total] = await Promise.all([
      this.prisma.medicalHistory.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          type: true,
          reason: true,
          diagnosis: true,
          date: true,
          createdAt: true,
          patient: {
            select: {
              id: true,
              name: true,
              lastName: true,
              identify: true,
            },
          },
        },
      }),
      this.prisma.medicalHistory.count({ where }),
    ]);
    return toPaginatedResult(histories, total, query.page, query.limit);
  }

  /** Impide escribir una historia sobre un paciente inactivo o de otra clinica (IDOR). */
  private async assertOwnsPatient(patientId: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId, isActive: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }

  async findOne(id: string, clinicId: string) {
    const history = await this.prisma.medicalHistory.findFirst({
      where: { id, clinicId, deleted: false },
      include: {
        patient: true,
        template: true,
        medicalTreatments: {
          include: {
            treatmentMedications: {
              include: {
                medication: true,
              },
            },
          },
        },
      },
    });
    if (!history) {
      throw new NotFoundException('Historia no encontrada');
    }
    return history;
  }

  async getHistoryByPatientId({ patientId, clinicId, query }: GetHistoryByPatientIdParams) {
    await this.assertOwnsPatient(patientId, clinicId);
    const where = { patientId, clinicId, deleted: false };
    const [histories, total] = await Promise.all([
      this.prisma.medicalHistory.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: true,
          template: true,
          medicalTreatments: {
            include: {
              treatmentMedications: {
                include: {
                  medication: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.medicalHistory.count({ where }),
    ]);
    return toPaginatedResult(histories, total, query.page, query.limit);
  }

  async createMedicalHistory(dto: CreateMedicalHistoryDto, clinicId: string, userId: string) {
    const history = await this.prisma.$transaction((tx) =>
      this.medicalHistoryWriter.createHistoryInTransaction(
        tx,
        dto,
        dto.patientId,
        clinicId,
        userId,
      ),
    );

    return writeResponse('Historia médica agregada exitosamente', history);
  }

  async updateMedicalHistory(
    id: string,
    dto: UpdateMedicalHistoryDto,
    clinicId: string,
    userId: string,
  ) {
    await this.findOne(id, clinicId);

    if (dto.templateId) {
      const template = await this.prisma.formTemplate.findFirst({
        where: { id: dto.templateId, clinicId, isActive: true },
        select: { id: true },
      });

      if (!template) {
        throw new NotFoundException('Plantilla no encontrada');
      }
    }

    const history = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.medicalHistory.update({
        where: { id },
        data: dto,
      });

      await this.auditService.record({
        entity: 'MedicalHistory',
        entityId: updated.id,
        action: AuditAction.UPDATE,
        metadata: { fields: Object.keys(dto) },
        userId,
        clinicId,
      }, tx);

      return updated;
    });

    return writeResponse('Historia médica actualizada exitosamente', history);
  }

  async deleteMedicalHistory(id: string, clinicId: string, userId: string) {
    await this.findOne(id, clinicId);
    const history = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.medicalHistory.update({
        where: { id },
        data: { deleted: true, deletedAt: new Date() },
      });

      await this.auditService.record({
        entity: 'MedicalHistory',
        entityId: deleted.id,
        action: AuditAction.DELETE,
        metadata: { softDelete: true },
        userId,
        clinicId,
      }, tx);

      return deleted;
    });

    return writeResponse('Historia médica eliminada exitosamente', history);
  }

  async signMedicalHistory(id: string, clinicId: string, userId: string) {
    const history = await this.findOne(id, clinicId);

    if (history.signedAt) {
      throw new ConflictException('La historia médica ya está firmada');
    }

    const signed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.medicalHistory.update({
        where: { id },
        data: { signedAt: new Date(), signedById: userId },
      });

      await this.auditService.record({
        entity: 'MedicalHistory',
        entityId: updated.id,
        action: AuditAction.SIGN,
        metadata: { signedAt: updated.signedAt?.toISOString() },
        userId,
        clinicId,
      }, tx);

      return updated;
    });

    return writeResponse('Historia médica firmada exitosamente', signed);
  }
}
