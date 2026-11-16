import { MedicalHistoryStatus } from '../generated/prisma/client';

const LEGACY_STATUS_MAP: Record<string, MedicalHistoryStatus> = {
  draft: MedicalHistoryStatus.DRAFT,
  borrador: MedicalHistoryStatus.DRAFT,
  completed: MedicalHistoryStatus.COMPLETED,
  completada: MedicalHistoryStatus.COMPLETED,
  completa: MedicalHistoryStatus.COMPLETED,
  asistida: MedicalHistoryStatus.COMPLETED,
  atendida: MedicalHistoryStatus.COMPLETED,
  finalizada: MedicalHistoryStatus.COMPLETED,
  amended: MedicalHistoryStatus.AMENDED,
  enmendada: MedicalHistoryStatus.AMENDED,
  cancelled: MedicalHistoryStatus.CANCELLED,
  canceled: MedicalHistoryStatus.CANCELLED,
  cancelada: MedicalHistoryStatus.CANCELLED,
  anulada: MedicalHistoryStatus.CANCELLED,
  archived: MedicalHistoryStatus.ARCHIVED,
  archivada: MedicalHistoryStatus.ARCHIVED,
};

export const HISTORY_STATUS_VALUES: MedicalHistoryStatus[] = [
  MedicalHistoryStatus.DRAFT,
  MedicalHistoryStatus.COMPLETED,
  MedicalHistoryStatus.AMENDED,
  MedicalHistoryStatus.CANCELLED,
  MedicalHistoryStatus.ARCHIVED,
];

/** Acepta los estados nuevos y los valores legacy que envía el frontend. */
export function normalizeMedicalHistoryStatus(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  const upper = trimmed.toUpperCase();
  if ((HISTORY_STATUS_VALUES as string[]).includes(upper)) {
    return upper;
  }

  return LEGACY_STATUS_MAP[trimmed.toLowerCase()] ?? value;
}

export interface HistoryAllowedActions {
  edit: boolean;
  complete: boolean;
  amend: boolean;
  cancel: boolean;
  delete: boolean;
}

export function historyAllowedActions(status: MedicalHistoryStatus): HistoryAllowedActions {
  return {
    edit: status === MedicalHistoryStatus.DRAFT,
    complete: status === MedicalHistoryStatus.DRAFT,
    amend: status === MedicalHistoryStatus.COMPLETED,
    cancel:
      status === MedicalHistoryStatus.DRAFT || status === MedicalHistoryStatus.COMPLETED,
    delete: status === MedicalHistoryStatus.DRAFT,
  };
}

export function canEditHistory(status: MedicalHistoryStatus): boolean {
  return status === MedicalHistoryStatus.DRAFT;
}
