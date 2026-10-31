import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, MedicalHistory, Prisma } from '../generated/prisma/client';
import { MedicalHistoryPayloadDto } from './medical-histories.dto';

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

    const medicationIds = [
      ...(dto.medicalTreatments?.flatMap((treatment) => [
        ...(treatment.medicationId ? [treatment.medicationId] : []),
        ...(treatment.treatmentMedications?.flatMap((medication) => medication.medicationId ? [medication.medicationId] : []) ?? []),
      ]) ?? []),
    ];
    if (medicationIds.length > 0) {
      const medications = await tx.medication.findMany({
        where: { id: { in: [...new Set(medicationIds)] }, clinicId },
        select: { id: true },
      });
      if (medications.length !== new Set(medicationIds).size) {
        throw new NotFoundException('Medicamento no encontrado');
      }
    }

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
        patientId,
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
        appointment: appointmentId
          ? { connect: { id: appointmentId } }
          : undefined,
        clinicId,
        createdById: userId,
      },
    });

    await this.auditService.record({
      entity: 'MedicalHistory',
      entityId: created.id,
      action: AuditAction.CREATE,
      metadata: {
        fields: ['title', 'type', 'status', 'templateId'],
        ...(appointmentId ? { appointmentId } : {}),
      },
      userId,
      clinicId,
    }, tx);

    return created;
  }
}
