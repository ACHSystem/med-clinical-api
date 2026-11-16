import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  PatientConditionKind,
  Prisma,
} from '../generated/prisma/client';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import {
  ClinicalSummaryQueryDto,
  CreatePatientConditionDto,
  PatientConditionListQueryDto,
  UpdatePatientConditionDto,
} from './patient-conditions.dto';
import { calculateAge, normalizeConditionLabel } from './patient-conditions.utils';
import { normalizeStoredVitalSigns } from '../medical-histories/vital-signs';

const CONDITION_INCLUDE = {
  sourceMedicalHistory: {
    select: { id: true, title: true, date: true, status: true },
  },
} satisfies Prisma.PatientConditionInclude;

@Injectable()
export class PatientConditionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async getPatient(patientId: string, clinicId: string, requireActive = false) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        clinicId,
        ...(requireActive ? { isActive: true } : {}),
      },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    return patient;
  }

  private async getConditionOrThrow(patientId: string, conditionId: string, clinicId: string) {
    await this.getPatient(patientId, clinicId);

    const condition = await this.prisma.patientCondition.findFirst({
      where: { id: conditionId, patientId, clinicId },
      include: CONDITION_INCLUDE,
    });

    if (!condition) {
      throw new NotFoundException('Antecedente no encontrado');
    }

    return condition;
  }

  private async assertSourceHistory(
    patientId: string,
    clinicId: string,
    sourceMedicalHistoryId: string,
  ) {
    const history = await this.prisma.medicalHistory.findFirst({
      where: {
        id: sourceMedicalHistoryId,
        patientId,
        clinicId,
        deleted: false,
      },
      select: { id: true },
    });

    if (!history) {
      throw new NotFoundException('Historia de origen no encontrada');
    }
  }

  async findAll(patientId: string, clinicId: string, query: PatientConditionListQueryDto) {
    await this.getPatient(patientId, clinicId);

    const where: Prisma.PatientConditionWhereInput = {
      patientId,
      clinicId,
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { label: { contains: query.search, mode: 'insensitive' as const } },
              { notes: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [conditions, total] = await Promise.all([
      this.prisma.patientCondition.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: CONDITION_INCLUDE,
        orderBy: [
          { isActive: 'desc' },
          { diagnosedAt: { sort: 'desc', nulls: 'last' } },
          { label: 'asc' },
        ],
      }),
      this.prisma.patientCondition.count({ where }),
    ]);

    return toPaginatedResult(conditions, total, query.page, query.limit);
  }

  async findOne(patientId: string, conditionId: string, clinicId: string) {
    return this.getConditionOrThrow(patientId, conditionId, clinicId);
  }

  async create(
    patientId: string,
    dto: CreatePatientConditionDto,
    clinicId: string,
    userId: string,
  ) {
    await this.getPatient(patientId, clinicId, true);

    if (dto.sourceMedicalHistoryId) {
      await this.assertSourceHistory(patientId, clinicId, dto.sourceMedicalHistoryId);
    }

    const normalizedLabel = normalizeConditionLabel(dto.label);
    if (!normalizedLabel) {
      throw new ConflictException('La etiqueta del antecedente no es válida');
    }

    const existing = await this.prisma.patientCondition.findUnique({
      where: {
        patientId_kind_normalizedLabel: {
          patientId,
          kind: dto.kind,
          normalizedLabel,
        },
      },
      include: CONDITION_INCLUDE,
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException(
          'Ya existe un antecedente equivalente para este paciente',
        );
      }

      const nextActive = dto.isActive ?? true;

      const reactivated = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.patientCondition.update({
          where: { id: existing.id },
          data: {
            label: dto.label,
            notes: dto.notes !== undefined ? dto.notes : existing.notes,
            diagnosedAt:
              dto.diagnosedAt !== undefined
                ? dto.diagnosedAt
                  ? new Date(dto.diagnosedAt)
                  : null
                : existing.diagnosedAt,
            sourceMedicalHistoryId:
              dto.sourceMedicalHistoryId ?? existing.sourceMedicalHistoryId,
            isActive: nextActive,
          },
          include: CONDITION_INCLUDE,
        });

        await this.auditService.record(
          {
            entity: 'PatientCondition',
            entityId: updated.id,
            action: AuditAction.UPDATE,
            metadata: {
              fields: Object.keys(dto),
              reactivated: nextActive,
            },
            userId,
            clinicId,
          },
          tx,
        );

        return updated;
      });

      return writeResponse(
        nextActive
          ? 'Antecedente reactivado exitosamente'
          : 'Antecedente actualizado exitosamente',
        reactivated,
      );
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const condition = await tx.patientCondition.create({
          data: {
            patientId,
            clinicId,
            kind: dto.kind,
            label: dto.label,
            normalizedLabel,
            notes: dto.notes,
            diagnosedAt: dto.diagnosedAt ? new Date(dto.diagnosedAt) : null,
            isActive: dto.isActive ?? true,
            sourceMedicalHistoryId: dto.sourceMedicalHistoryId ?? null,
          },
          include: CONDITION_INCLUDE,
        });

        await this.auditService.record(
          {
            entity: 'PatientCondition',
            entityId: condition.id,
            action: AuditAction.CREATE,
            metadata: { fields: Object.keys(dto), kind: condition.kind },
            userId,
            clinicId,
          },
          tx,
        );

        return condition;
      });

      return writeResponse('Antecedente agregado exitosamente', created);
    } catch (error) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async update(
    patientId: string,
    conditionId: string,
    dto: UpdatePatientConditionDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.getConditionOrThrow(patientId, conditionId, clinicId);

    if (!existing.isActive && dto.isActive !== true) {
      throw new NotFoundException('Antecedente no encontrado');
    }

    const kind = dto.kind ?? existing.kind;
    const label = dto.label ?? existing.label;
    const normalizedLabel = normalizeConditionLabel(label);

    if (!normalizedLabel) {
      throw new ConflictException('La etiqueta del antecedente no es válida');
    }

    const duplicate = await this.prisma.patientCondition.findFirst({
      where: {
        patientId,
        kind,
        normalizedLabel,
        id: { not: conditionId },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException('Ya existe un antecedente equivalente para este paciente');
    }

    const data: Prisma.PatientConditionUpdateInput = {};

    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.label !== undefined) {
      data.label = dto.label;
      data.normalizedLabel = normalizedLabel;
    }
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.diagnosedAt !== undefined) {
      data.diagnosedAt = dto.diagnosedAt ? new Date(dto.diagnosedAt) : null;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const condition = await tx.patientCondition.update({
          where: { id: conditionId },
          data,
          include: CONDITION_INCLUDE,
        });

        await this.auditService.record(
          {
            entity: 'PatientCondition',
            entityId: condition.id,
            action: AuditAction.UPDATE,
            metadata: { fields: Object.keys(dto), kind: condition.kind },
            userId,
            clinicId,
          },
          tx,
        );

        return condition;
      });

      return writeResponse('Antecedente actualizado exitosamente', updated);
    } catch (error) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async deactivate(
    patientId: string,
    conditionId: string,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.getConditionOrThrow(patientId, conditionId, clinicId);

    if (!existing.isActive) {
      throw new NotFoundException('Antecedente no encontrado');
    }

    const deactivated = await this.prisma.$transaction(async (tx) => {
      const condition = await tx.patientCondition.update({
        where: { id: conditionId },
        data: { isActive: false },
        include: CONDITION_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'PatientCondition',
          entityId: condition.id,
          action: AuditAction.DELETE,
          metadata: { softDelete: true, kind: condition.kind },
          userId,
          clinicId,
        },
        tx,
      );

      return condition;
    });

    return writeResponse('Antecedente desactivado exitosamente', deactivated);
  }

  async getClinicalSummary(
    patientId: string,
    clinicId: string,
    query: ClinicalSummaryQueryDto,
  ) {
    const patient = await this.getPatient(patientId, clinicId);

    const [conditions, histories] = await Promise.all([
      this.prisma.patientCondition.findMany({
        where: { patientId, clinicId },
        include: CONDITION_INCLUDE,
        orderBy: [
          { isActive: 'desc' },
          { diagnosedAt: { sort: 'desc', nulls: 'last' } },
          { label: 'asc' },
        ],
      }),
      this.prisma.medicalHistory.findMany({
        where: { patientId, clinicId, deleted: false },
        orderBy: { date: 'desc' },
        take: query.timelineLimit,
        select: {
          id: true,
          title: true,
          type: true,
          reason: true,
          diagnosis: true,
          date: true,
          status: true,
          amendsId: true,
          signedAt: true,
          vitalSigns: true,
          _count: { select: { medicalTreatments: true } },
        },
      }),
    ]);

    const timeline = histories.map((history) => ({
      id: history.id,
      eventType: history.amendsId ? 'ADDENDUM' : 'CONSULTATION',
      date: history.date,
      title: history.title,
      type: history.type,
      status: history.status,
      reason: history.reason,
      diagnosis: history.diagnosis,
      amendsId: history.amendsId,
      signedAt: history.signedAt,
      treatments: history._count.medicalTreatments,
      vitalSigns: normalizeStoredVitalSigns(history.vitalSigns),
    }));

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        lastName: patient.lastName,
        identify: patient.identify,
        birthDate: patient.birthDate,
        gender: patient.gender,
        email: patient.email,
        phone: patient.phone,
        notes: patient.notes,
        isActive: patient.isActive,
      },
      age: calculateAge(patient.birthDate),
      conditions,
      activeAllergies: conditions.filter(
        (condition) =>
          condition.kind === PatientConditionKind.ALLERGY && condition.isActive,
      ),
      timeline,
      latestVitalSigns:
        timeline.find((event) => event.eventType === 'CONSULTATION' && event.vitalSigns)
          ?.vitalSigns ?? null,
    };
  }

  private handleDuplicate(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un antecedente equivalente para este paciente');
    }
  }
}
