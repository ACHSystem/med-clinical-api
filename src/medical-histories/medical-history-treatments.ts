import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  CreateMedicalTreatmentDto,
  CreateTreatmentMedicationDto,
} from './medical-histories.dto';

type MedicationReader = Pick<Prisma.TransactionClient, 'medication'>;

interface MedicationSnapshot {
  id: string;
  name: string;
  activeIngredient: string | null;
  presentation: string | null;
  concentration: string | null;
}

function medicationIdsOf(treatments: CreateMedicalTreatmentDto[]): string[] {
  const ids = treatments.flatMap((treatment) => [
    ...(treatment.medicationId ? [treatment.medicationId] : []),
    ...(treatment.treatmentMedications ?? []).flatMap((medication) =>
      medication.medicationId ? [medication.medicationId] : [],
    ),
  ]);

  return [...new Set(ids)];
}

export async function loadMedicationSnapshots(
  tx: MedicationReader,
  treatments: CreateMedicalTreatmentDto[],
  clinicId: string,
): Promise<Map<string, MedicationSnapshot>> {
  const ids = medicationIdsOf(treatments);
  if (ids.length === 0) return new Map();

  const medications = await tx.medication.findMany({
    where: { id: { in: ids }, clinicId },
    select: {
      id: true,
      name: true,
      activeIngredient: true,
      presentation: true,
      concentration: true,
    },
  });

  if (medications.length !== ids.length) {
    throw new NotFoundException('Medicamento no encontrado');
  }

  return new Map(medications.map((medication) => [medication.id, medication]));
}

function buildMedicationCreate(
  medication: CreateTreatmentMedicationDto,
  clinicId: string,
  snapshots: Map<string, MedicationSnapshot>,
  index: number,
) {
  const catalog = medication.medicationId
    ? snapshots.get(medication.medicationId)
    : undefined;

  return {
    ...(medication.medicationId
      ? { medication: { connect: { id: medication.medicationId } } }
      : {}),
    medicationName: catalog?.name ?? medication.medicationName,
    activeIngredient: catalog?.activeIngredient ?? medication.activeIngredient ?? null,
    presentation: catalog?.presentation ?? medication.presentation ?? null,
    concentration: catalog?.concentration ?? medication.concentration ?? null,
    dose: medication.dose,
    frequency: medication.frequency,
    route: medication.route ?? null,
    duration: medication.duration ?? null,
    quantity: medication.quantity ?? null,
    instructions: medication.instructions ?? null,
    notes: medication.notes ?? null,
    startDate: medication.startDate ? new Date(medication.startDate) : null,
    endDate: medication.endDate ? new Date(medication.endDate) : null,
    sortOrder: medication.sortOrder ?? index,
    clinic: { connect: { id: clinicId } },
  };
}

/**
 * Datos de creación reutilizados por el alta y por el reemplazo transaccional
 * del PUT. El snapshot se congela desde el catálogo cuando hay medicationId.
 */
export function buildTreatmentsCreateData(
  treatments: CreateMedicalTreatmentDto[],
  clinicId: string,
  snapshots: Map<string, MedicationSnapshot>,
) {
  return treatments.map((treatment) => {
    const {
      treatmentMedications,
      startDate,
      endDate,
      medicationId,
      ...rest
    } = treatment;

    return {
      ...rest,
      ...(medicationId ? { medication: { connect: { id: medicationId } } } : {}),
      clinic: { connect: { id: clinicId } },
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      isActive: treatment.isActive ?? true,
      treatmentMedications: {
        create: (treatmentMedications ?? []).map((medication, index) =>
          buildMedicationCreate(medication, clinicId, snapshots, index),
        ),
      },
    };
  });
}
