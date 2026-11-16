/**
 * Signos vitales estructurados.
 *
 * Forma canónica guardada en MedicalHistory.vitalSigns:
 * { ta: "120/80", fc, fr, temp, peso, talla, imc, spo2 }
 *
 * Las historias viejas pueden traer { signos: "texto libre" }; se conservan y
 * se devuelven tal cual para no romper el detalle.
 */
import { BadRequestException } from '@nestjs/common';

export interface VitalSigns {
  ta?: string;
  fc?: number;
  fr?: number;
  temp?: number;
  peso?: number;
  talla?: number;
  imc?: number;
  spo2?: number;
  signos?: string;
}

export interface BloodPressure {
  systolic: number;
  diastolic: number;
}

const FIELD_ALIASES: Record<string, keyof VitalSigns> = {
  ta: 'ta',
  tension: 'ta',
  'tension arterial': 'ta',
  presion: 'ta',
  'presion arterial': 'ta',
  fc: 'fc',
  pulso: 'fc',
  'frecuencia cardiaca': 'fc',
  frecuenciacardiaca: 'fc',
  fr: 'fr',
  'frecuencia respiratoria': 'fr',
  frecuenciarespiratoria: 'fr',
  temp: 'temp',
  temperatura: 'temp',
  peso: 'peso',
  weight: 'peso',
  talla: 'talla',
  altura: 'talla',
  height: 'talla',
  spo2: 'spo2',
  saturacion: 'spo2',
  'saturacion de oxigeno': 'spo2',
  sato2: 'spo2',
  signos: 'signos',
  signosvitales: 'signos',
};

const NUMERIC_RANGES: Record<
  Exclude<keyof VitalSigns, 'ta' | 'imc' | 'signos'>,
  { min: number; max: number; label: string }
> = {
  fc: { min: 20, max: 250, label: 'fc' },
  fr: { min: 4, max: 80, label: 'fr' },
  temp: { min: 30, max: 45, label: 'temp' },
  peso: { min: 0.5, max: 500, label: 'peso' },
  talla: { min: 0.3, max: 2.5, label: 'talla' },
  spo2: { min: 50, max: 100, label: 'spo2' },
};

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(',', '.');
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function calculateImc(peso?: number, talla?: number): number | undefined {
  if (peso === undefined || talla === undefined || talla <= 0) {
    return undefined;
  }
  return Math.round((peso / (talla * talla)) * 100) / 100;
}

export function parseBloodPressure(ta?: string): BloodPressure | null {
  if (typeof ta !== 'string') return null;

  const match = ta.trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) return null;

  return {
    systolic: Number(match[1]),
    diastolic: Number(match[2]),
  };
}

/** Normaliza y valida la entrada de escritura; lanza 400 si hay rangos inválidos. */
export function prepareVitalSigns(input: unknown): VitalSigns | null {
  const normalized = normalizeVitalSigns(input);
  if (!normalized) return null;

  const errors = validateVitalSigns(normalized);
  if (errors.length > 0) {
    throw new BadRequestException(errors.join('. '));
  }

  return normalized;
}

/**
 * Normaliza la entrada de escritura. Ignora claves desconocidas e ignora el
 * imc enviado por el cliente: siempre se recalcula desde peso y talla.
 */
export function normalizeVitalSigns(input: unknown): VitalSigns | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const result: VitalSigns = {};
  const raw = input as Record<string, unknown>;

  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = FIELD_ALIASES[stripAccents(rawKey).toLowerCase()];
    if (!key) continue;

    if (key === 'ta') {
      const ta = typeof rawValue === 'string' ? rawValue.trim().replace(/\s*\/\s*/, '/') : undefined;
      if (ta) result.ta = ta;
      continue;
    }

    if (key === 'signos') {
      const signos = typeof rawValue === 'string' ? rawValue.trim() : undefined;
      if (signos) result.signos = signos;
      continue;
    }

    if (key === 'imc') {
      // Campo calculado: no se confía en el valor del cliente.
      continue;
    }

    const numeric = toNumber(rawValue);
    if (numeric !== undefined) {
      result[key] = numeric;
    }
  }

  const imc = calculateImc(result.peso, result.talla);
  if (imc !== undefined) {
    result.imc = imc;
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Normaliza datos ya guardados sin descartar claves legacy desconocidas. */
export function normalizeStoredVitalSigns(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input ?? null;
  }

  const normalized = normalizeVitalSigns(input);
  if (!normalized) {
    return input;
  }

  return { ...(input as Record<string, unknown>), ...normalized };
}

export function validateVitalSigns(vitalSigns: VitalSigns): string[] {
  const errors: string[] = [];

  if (vitalSigns.ta !== undefined) {
    const bloodPressure = parseBloodPressure(vitalSigns.ta);
    if (!bloodPressure) {
      errors.push('ta debe tener el formato sistólica/diastólica (ej. 120/80)');
    } else {
      if (bloodPressure.systolic < 50 || bloodPressure.systolic > 300) {
        errors.push('ta sistólica debe estar entre 50 y 300');
      }
      if (bloodPressure.diastolic < 30 || bloodPressure.diastolic > 200) {
        errors.push('ta diastólica debe estar entre 30 y 200');
      }
      if (bloodPressure.systolic <= bloodPressure.diastolic) {
        errors.push('ta sistólica debe ser mayor que la diastólica');
      }
    }
  }

  for (const [key, range] of Object.entries(NUMERIC_RANGES)) {
    const value = vitalSigns[key as keyof VitalSigns] as number | undefined;
    if (value !== undefined && (value < range.min || value > range.max)) {
      errors.push(`${range.label} debe estar entre ${range.min} y ${range.max}`);
    }
  }

  return errors;
}
