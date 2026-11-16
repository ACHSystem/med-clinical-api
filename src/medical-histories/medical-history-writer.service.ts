import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  MedicalHistory,
  MedicalHistoryStatus,
  Prisma,
} from '../generated/prisma/client';
import { MedicalHistoryPayloadDto } from './medical-histories.dto';
import { buildTreatmentsCreateData, loadMedicationSnapshots } from './medical-history-treatments';
import { prepareVitalSigns } from './vital-signs';

/**
 * Escritura de historias reutilizable por MedicalHistoriesModule y
 * AppointmentsModule. Vive en un modulo sin controladores para que la agenda
 * pueda crear la historia inline sin arrastrar las rutas de /medical-histories.
 */
@Injectable()
export class MedicalHistoryWriterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createHistoryInTransaction(
    tx: Prisma.TransactionClient,
    dto: MedicalHistoryPayloadDto,
    patientId: string,
    clinicId: string,
    userId: string,
    appointmentId?: string,
  ): Promise<MedicalHistory> {
    const patient = await tx.patient.findFirst({
      where: { id: patientId, clinicId, isActive: true },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }

    if (dto.templateId) {
      const template = await tx.formTemplate.findFirst({
        where: { id: dto.templateId, clinicId },
        select: { id: true },
      });
      if (!template) {
        throw new NotFoundException('Plantilla no encontrada');
      }
    }

    const treatments = dto.medicalTreatments ?? [];
    const snapshots = await loadMedicationSnapshots(tx, treatments, clinicId);
    const status = dto.status ?? MedicalHistoryStatus.DRAFT;
    const completedAt = status === MedicalHistoryStatus.COMPLETED ? new Date() : null;

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
        status,
        vitalSigns: (prepareVitalSigns(dto.vitalSigns) ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        data: dto.data,
        notes: dto.notes,
        patientId,
        templateId: dto.templateId || null,
        templateSnapshot: dto.templateSnapshot,
        medicalTreatments:
          dto.medicalTreatments !== undefined
            ? { create: buildTreatmentsCreateData(treatments, clinicId, snapshots) }
            : undefined,
        appointment: appointmentId
          ? { connect: { id: appointmentId } }
          : undefined,
        clinicId,
        createdById: userId,
        signedAt: completedAt,
        signedById: completedAt ? userId : null,
      },
    });

    await this.auditService.record({
      entity: 'MedicalHistory',
      entityId: created.id,
      action: AuditAction.CREATE,
      metadata: {
        fields: ['title', 'type', 'status', 'templateId'],
        status,
        ...(appointmentId ? { appointmentId } : {}),
      },
      userId,
      clinicId,
    }, tx);

    return created;
  }
}
