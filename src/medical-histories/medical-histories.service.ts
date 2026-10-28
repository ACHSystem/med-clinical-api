import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../generated/prisma/client';
import { AppointmentsListQueryDto, CreateMedicalHistoryDto, MedicalHistoryListQueryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';

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

  async getAppointments(clinicId: string, query: AppointmentsListQueryDto) {
    const where = {
      deleted: false,
      clinicId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateStart || query.dateTo
        ? {
          scheduledAt: {
            ...(query.dateStart ? { gte: new Date(query.dateStart) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          },
        }
        : {}),
      ...(query.search
        ? {
          OR: [
            { reason: { contains: query.search, mode: 'insensitive' as const } },
            { notes: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          reason: true,
          notes: true,
          scheduledAt: true,
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
      this.prisma.appointment.count({ where }),
    ]);
    return toPaginatedResult(appointments, total, query.page, query.limit);
  }

  async getAppointmentsById(clinicId: string, id: string) {
    const where = {
      deleted: false,
      clinicId,
      id,
    };
    const appointment = await this.prisma.appointment.findFirst({
      where,
      include: {
        patient: true,
        medicalHistory: true,
      }
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }

    return appointment;
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
    await this.assertOwnsPatient(dto.patientId, clinicId);

    if (dto.templateId) {
      const template = await this.prisma.formTemplate.findFirst({
        where: { id: dto.templateId, clinicId },
        select: { id: true },
      });
      if (!template) {
        throw new NotFoundException('Plantilla no encontrada');
      }
    }

    const medicationIds = [
      ...(dto.medicalTreatments?.flatMap((treatment) => [
        ...(treatment.medicationId ? [treatment.medicationId] : []),
        ...(treatment.treatmentMedications?.flatMap((medication) => medication.medicationId ? [medication.medicationId] : []) ?? []),
      ]) ?? []),
    ];
    if (medicationIds.length > 0) {
      const medications = await this.prisma.medication.findMany({
        where: { id: { in: [...new Set(medicationIds)] }, clinicId },
        select: { id: true },
      });
      if (medications.length !== new Set(medicationIds).size) {
        throw new NotFoundException('Medicamento no encontrado');
      }
    }

    const history = await this.prisma.$transaction(async (tx) => {
      const created = await tx.medicalHistory.create({
        data: {
          title: dto.title,
          type: dto.type,
          reason: dto.reason,
          symptoms: dto.symptoms,
          observations: dto.observations,
          diagnosis: dto.diagnosis,
          evaluation: dto.evaluation,
          date: new Date(dto.date),
          status: dto.status,
          vitalSigns: dto.vitalSigns,
          data: dto.data,
          notes: dto.notes,
          patientId: dto.patientId,
          templateId: dto.templateId || null,
          templateSnapshot: dto.templateSnapshot,
          medicalTreatments: dto.medicalTreatments
            ? {
              create: dto.medicalTreatments.map(({ treatmentMedications, startDate, endDate, ...treatment }) => ({
                ...treatment,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
                clinicId,
                treatmentMedications: treatmentMedications
                  ? {
                    create: treatmentMedications.map(({ startDate, endDate, ...medication }) => ({
                      ...medication,
                      startDate: startDate ? new Date(startDate) : undefined,
                      endDate: endDate ? new Date(endDate) : undefined,
                      clinicId,
                    })),
                  }
                  : undefined,
              })),
            }
            : undefined,
          appointment: dto.appointment
            ? {
              create: {
                ...dto.appointment,
                scheduledAt: new Date(dto.appointment.scheduledAt),
                confirmedAt: dto.appointment.confirmedAt ? new Date(dto.appointment.confirmedAt) : undefined,
                attendedAt: dto.appointment.attendedAt ? new Date(dto.appointment.attendedAt) : undefined,
                cancelledAt: dto.appointment.cancelledAt ? new Date(dto.appointment.cancelledAt) : undefined,
                rescheduledAt: dto.appointment.rescheduledAt ? new Date(dto.appointment.rescheduledAt) : undefined,
                patientId: dto.patientId,
                clinicId,
                userId,
              },
            }
            : undefined,
          clinicId,
          createdById: userId,
        },
      });

      await this.auditService.record({
        entity: 'MedicalHistory',
        entityId: created.id,
        action: AuditAction.CREATE,
        metadata: { fields: ['title', 'type', 'status', 'templateId'] },
        userId,
        clinicId,
      }, tx);

      return created;
    });

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