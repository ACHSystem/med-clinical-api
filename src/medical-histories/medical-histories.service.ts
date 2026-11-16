import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  MedicalHistoryStatus,
  Prisma,
} from '../generated/prisma/client';
import {
  AmendMedicalHistoryDto,
  CancelMedicalHistoryDto,
  CreateMedicalHistoryDto,
  MedicalHistoryListQueryDto,
  UpdateMedicalHistoryDto,
} from './medical-histories.dto';
import { MedicalHistoryWriterService } from './medical-history-writer.service';
import {
  canEditHistory,
  historyAllowedActions,
} from './medical-history-status';
import {
  buildTreatmentsCreateData,
  loadMedicationSnapshots,
} from './medical-history-treatments';
import { normalizeStoredVitalSigns, prepareVitalSigns } from './vital-signs';

interface GetHistoryByPatientIdParams {
  patientId: string;
  clinicId: string;
  query: PaginationQueryDto;
}

const HISTORY_DETAIL_INCLUDE = {
  patient: true,
  template: true,
  createdBy: { select: { id: true, name: true, lastName: true } },
  signedBy: { select: { id: true, name: true, lastName: true } },
  cancelledBy: { select: { id: true, name: true, lastName: true } },
  amends: { select: { id: true, title: true, date: true, status: true } },
  amendments: {
    select: { id: true, title: true, date: true, status: true, signedAt: true },
    orderBy: { date: 'asc' as const },
  },
  sourceConditions: { select: { id: true, kind: true, label: true, isActive: true } },
  medicalTreatments: {
    include: {
      treatmentMedications: {
        include: { medication: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.MedicalHistoryInclude;

type HistoryDetail = Prisma.MedicalHistoryGetPayload<{
  include: typeof HISTORY_DETAIL_INCLUDE;
}>;

@Injectable()
export class MedicalHistoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly medicalHistoryWriter: MedicalHistoryWriterService,
  ) {}

  private presentHistory(history: HistoryDetail) {
    const status = history.status as MedicalHistoryStatus;

    return {
      ...history,
      vitalSigns: normalizeStoredVitalSigns(history.vitalSigns),
      canEdit: canEditHistory(status),
      allowedActions: historyAllowedActions(status),
    };
  }

  async getAllHistories(clinicId: string, query: MedicalHistoryListQueryDto) {
    const where: Prisma.MedicalHistoryWhereInput = {
      deleted: false,
      clinicId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
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
              { diagnosis: { contains: query.search, mode: 'insensitive' as const } },
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
          status: true,
          signedAt: true,
          amendsId: true,
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

    return toPaginatedResult(
      histories.map((history) => ({
        ...history,
        canEdit: canEditHistory(history.status),
      })),
      total,
      query.page,
      query.limit,
    );
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

  private async getHistoryOrThrow(id: string, clinicId: string) {
    const history = await this.prisma.medicalHistory.findFirst({
      where: { id, clinicId, deleted: false },
    });
    if (!history) {
      throw new NotFoundException('Historia no encontrada');
    }
    return history;
  }

  private async getDetailOrThrow(id: string, clinicId: string) {
    const history = await this.prisma.medicalHistory.findFirst({
      where: { id, clinicId, deleted: false },
      include: HISTORY_DETAIL_INCLUDE,
    });
    if (!history) {
      throw new NotFoundException('Historia no encontrada');
    }
    return this.presentHistory(history);
  }

  async findOne(id: string, clinicId: string) {
    return this.getDetailOrThrow(id, clinicId);
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
        include: HISTORY_DETAIL_INCLUDE,
      }),
      this.prisma.medicalHistory.count({ where }),
    ]);

    return toPaginatedResult(
      histories.map((history) => this.presentHistory(history)),
      total,
      query.page,
      query.limit,
    );
  }

  async createMedicalHistory(dto: CreateMedicalHistoryDto, clinicId: string, userId: string) {
    const created = await this.prisma.$transaction((tx) =>
      this.medicalHistoryWriter.createHistoryInTransaction(
        tx,
        dto,
        dto.patientId,
        clinicId,
        userId,
      ),
    );

    const history = await this.getDetailOrThrow(created.id, clinicId);
    return writeResponse('Historia médica agregada exitosamente', history);
  }

  private async assertTemplate(templateId: string | null | undefined, clinicId: string) {
    if (!templateId) return;

    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, clinicId, isActive: true },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }
  }

  async updateMedicalHistory(
    id: string,
    dto: UpdateMedicalHistoryDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.getHistoryOrThrow(id, clinicId);

    if (!canEditHistory(existing.status)) {
      throw new ConflictException(
        `Solo se puede editar una historia en estado ${MedicalHistoryStatus.DRAFT}`,
      );
    }

    await this.assertTemplate(dto.templateId, clinicId);

    const vitalSigns =
      dto.vitalSigns !== undefined ? prepareVitalSigns(dto.vitalSigns) : undefined;

    const history = await this.prisma.$transaction(async (tx) => {
      if (dto.medicalTreatments !== undefined) {
        await tx.medicalTreatments.deleteMany({
          where: { medicalHistoryId: id, clinicId },
        });
      }

      const snapshots = dto.medicalTreatments
        ? await loadMedicationSnapshots(tx, dto.medicalTreatments, clinicId)
        : new Map();

      const data: Prisma.MedicalHistoryUpdateInput = {};

      if (dto.title !== undefined) data.title = dto.title;
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.reason !== undefined) data.reason = dto.reason;
      if (dto.symptoms !== undefined) data.symptoms = dto.symptoms;
      if (dto.notes !== undefined) data.notes = dto.notes;
      if (dto.observations !== undefined) data.observations = dto.observations;
      if (dto.diagnosis !== undefined) data.diagnosis = dto.diagnosis;
      if (dto.evaluation !== undefined) data.evaluation = dto.evaluation;
      if (dto.date !== undefined) data.date = new Date(dto.date);
      if (vitalSigns !== undefined) {
        data.vitalSigns =
          vitalSigns === null
            ? Prisma.DbNull
            : (vitalSigns as unknown as Prisma.InputJsonValue);
      }
      if (dto.data !== undefined) {
        data.data = dto.data === null ? Prisma.DbNull : dto.data;
      }
      if (dto.templateSnapshot !== undefined) {
        data.templateSnapshot =
          dto.templateSnapshot === null ? Prisma.DbNull : dto.templateSnapshot;
      }
      if (dto.templateId !== undefined) {
        data.template = dto.templateId
          ? { connect: { id: dto.templateId } }
          : { disconnect: true };
      }

      await tx.medicalHistory.update({ where: { id }, data });

      if (dto.medicalTreatments !== undefined) {
        const treatments = buildTreatmentsCreateData(
          dto.medicalTreatments,
          clinicId,
          snapshots,
        );

        for (const treatment of treatments) {
          await tx.medicalTreatments.create({
            data: {
              ...treatment,
              medicalHistory: { connect: { id } },
            } as Prisma.MedicalTreatmentsCreateInput,
          });
        }
      }

      const updated = await tx.medicalHistory.findFirst({
        where: { id, clinicId },
        include: HISTORY_DETAIL_INCLUDE,
      });

      if (!updated) {
        throw new NotFoundException('Historia no encontrada');
      }

      await this.auditService.record(
        {
          entity: 'MedicalHistory',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: { fields: Object.keys(dto), status: updated.status },
          userId,
          clinicId,
        },
        tx,
      );

      return this.presentHistory(updated);
    });

    return writeResponse('Historia médica actualizada exitosamente', history);
  }

  async completeMedicalHistory(id: string, clinicId: string, userId: string) {
    const existing = await this.getHistoryOrThrow(id, clinicId);

    if (existing.status === MedicalHistoryStatus.COMPLETED && existing.signedAt) {
      throw new ConflictException('La historia médica ya está firmada');
    }

    if (
      existing.status !== MedicalHistoryStatus.DRAFT
      && existing.status !== MedicalHistoryStatus.COMPLETED
    ) {
      throw new ConflictException(
        `No se puede completar una historia en estado ${existing.status}`,
      );
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      await tx.medicalHistory.update({
        where: { id },
        data: {
          status: MedicalHistoryStatus.COMPLETED,
          signedAt: new Date(),
          signedById: userId,
        },
      });

      const updated = await tx.medicalHistory.findFirst({
        where: { id, clinicId },
        include: HISTORY_DETAIL_INCLUDE,
      });

      if (!updated) {
        throw new NotFoundException('Historia no encontrada');
      }

      await this.auditService.record(
        {
          entity: 'MedicalHistory',
          entityId: updated.id,
          action: AuditAction.SIGN,
          metadata: {
            status: updated.status,
            signedAt: updated.signedAt?.toISOString(),
          },
          userId,
          clinicId,
        },
        tx,
      );

      return this.presentHistory(updated);
    });

    return writeResponse('Historia médica completada y firmada exitosamente', completed);
  }

  /** Alias heredado de POST /medical-histories/:id/sign. */
  async signMedicalHistory(id: string, clinicId: string, userId: string) {
    return this.completeMedicalHistory(id, clinicId, userId);
  }

  private copyTreatmentsForAmendment(history: HistoryDetail) {
    return history.medicalTreatments.map((treatment) => ({
      title: treatment.title,
      plan: treatment.plan,
      recommendations: treatment.recommendations,
      notes: treatment.notes,
      startDate: treatment.startDate,
      endDate: treatment.endDate,
      isActive: treatment.isActive,
      ...(treatment.medicationId
        ? { medication: { connect: { id: treatment.medicationId } } }
        : {}),
      clinic: { connect: { id: history.clinicId } },
      treatmentMedications: {
        create: treatment.treatmentMedications.map((medication) => ({
          ...(medication.medicationId
            ? { medication: { connect: { id: medication.medicationId } } }
            : {}),
          medicationName: medication.medicationName,
          activeIngredient: medication.activeIngredient,
          presentation: medication.presentation,
          concentration: medication.concentration,
          dose: medication.dose,
          frequency: medication.frequency,
          route: medication.route,
          duration: medication.duration,
          quantity: medication.quantity,
          instructions: medication.instructions,
          notes: medication.notes,
          startDate: medication.startDate,
          endDate: medication.endDate,
          sortOrder: medication.sortOrder,
          clinic: { connect: { id: history.clinicId } },
        })),
      },
    }));
  }

  async amendMedicalHistory(
    id: string,
    dto: AmendMedicalHistoryDto,
    clinicId: string,
    userId: string,
  ) {
    const original = await this.prisma.medicalHistory.findFirst({
      where: { id, clinicId, deleted: false },
      include: HISTORY_DETAIL_INCLUDE,
    });

    if (!original) {
      throw new NotFoundException('Historia no encontrada');
    }

    if (original.status !== MedicalHistoryStatus.COMPLETED) {
      throw new ConflictException(
        `Solo una historia en estado ${MedicalHistoryStatus.COMPLETED} puede enmendarse`,
      );
    }

    if (dto.templateId !== undefined) {
      await this.assertTemplate(dto.templateId, clinicId);
    }

    const vitalSigns =
      dto.vitalSigns !== undefined
        ? prepareVitalSigns(dto.vitalSigns)
        : normalizeStoredVitalSigns(original.vitalSigns);

    const amendment = await this.prisma.$transaction(async (tx) => {
      const snapshots = dto.medicalTreatments
        ? await loadMedicationSnapshots(tx, dto.medicalTreatments, clinicId)
        : new Map();

      const treatments = dto.medicalTreatments
        ? buildTreatmentsCreateData(dto.medicalTreatments, clinicId, snapshots)
        : this.copyTreatmentsForAmendment(original);

      const created = await tx.medicalHistory.create({
        data: {
          title: dto.title ?? `Addendum: ${original.title}`,
          type: dto.type ?? original.type,
          reason: dto.reason ?? original.reason,
          symptoms: dto.symptoms ?? original.symptoms,
          notes: dto.notes ?? original.notes,
          observations: dto.observations ?? original.observations,
          diagnosis: dto.diagnosis ?? original.diagnosis,
          evaluation: dto.evaluation ?? original.evaluation,
          date: dto.date ? new Date(dto.date) : new Date(),
          status: MedicalHistoryStatus.AMENDED,
          vitalSigns:
            vitalSigns === null
              ? Prisma.DbNull
              : (vitalSigns as Prisma.InputJsonValue),
          data:
            dto.data !== undefined
              ? dto.data === null
                ? Prisma.DbNull
                : dto.data
              : original.data === null
                ? Prisma.DbNull
                : (original.data as Prisma.InputJsonValue),
          templateSnapshot:
            dto.templateSnapshot !== undefined
              ? dto.templateSnapshot === null
                ? Prisma.DbNull
                : dto.templateSnapshot
              : original.templateSnapshot === null
                ? Prisma.DbNull
                : (original.templateSnapshot as Prisma.InputJsonValue),
          patientId: original.patientId,
          clinicId,
          createdById: userId,
          signedAt: new Date(),
          signedById: userId,
          amendsId: original.id,
          amendReason: dto.amendReason,
          templateId:
            dto.templateId !== undefined ? dto.templateId : original.templateId,
          medicalTreatments: { create: treatments },
        },
      });

      await tx.medicalHistory.update({
        where: { id: original.id },
        data: { amendedAt: new Date() },
      });

      await this.auditService.record(
        {
          entity: 'MedicalHistory',
          entityId: created.id,
          action: AuditAction.CREATE,
          metadata: {
            fields: Object.keys(dto),
            status: created.status,
            amendsId: original.id,
          },
          userId,
          clinicId,
        },
        tx,
      );

      return created;
    });

    const history = await this.getDetailOrThrow(amendment.id, clinicId);
    return writeResponse('Addendum agregado exitosamente', history);
  }

  async cancelMedicalHistory(
    id: string,
    dto: CancelMedicalHistoryDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.getHistoryOrThrow(id, clinicId);

    if (
      existing.status !== MedicalHistoryStatus.DRAFT
      && existing.status !== MedicalHistoryStatus.COMPLETED
    ) {
      throw new ConflictException(
        `No se puede cancelar una historia en estado ${existing.status}`,
      );
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      await tx.medicalHistory.update({
        where: { id },
        data: {
          status: MedicalHistoryStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: dto.reason ?? null,
        },
      });

      const updated = await tx.medicalHistory.findFirst({
        where: { id, clinicId },
        include: HISTORY_DETAIL_INCLUDE,
      });

      if (!updated) {
        throw new NotFoundException('Historia no encontrada');
      }

      await this.auditService.record(
        {
          entity: 'MedicalHistory',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: {
            status: updated.status,
            previousStatus: existing.status,
            hasReason: Boolean(dto.reason),
          },
          userId,
          clinicId,
        },
        tx,
      );

      return this.presentHistory(updated);
    });

    return writeResponse('Historia médica cancelada exitosamente', cancelled);
  }

  async deleteMedicalHistory(id: string, clinicId: string, userId: string) {
    const existing = await this.getHistoryOrThrow(id, clinicId);

    if (!canEditHistory(existing.status)) {
      throw new ConflictException(
        `Solo se puede borrar una historia en estado ${MedicalHistoryStatus.DRAFT}`,
      );
    }

    const history = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.medicalHistory.update({
        where: { id },
        data: { deleted: true, deletedAt: new Date() },
      });

      await this.auditService.record(
        {
          entity: 'MedicalHistory',
          entityId: deleted.id,
          action: AuditAction.DELETE,
          metadata: { softDelete: true, status: deleted.status },
          userId,
          clinicId,
        },
        tx,
      );

      return deleted;
    });

    return writeResponse('Historia médica eliminada exitosamente', history);
  }
}
