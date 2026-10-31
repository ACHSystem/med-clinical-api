export const APPOINTMENT_TYPES = [
  'GENERAL_CONSULT',
  'FOLLOW_UP',
  'SPECIALIST_CONSULT',
  'INTERCONSULT',
  'EMERGENCY',
  'PROCEDURE',
  'TELEMEDICINE',
  'POST_OP_FOLLOW_UP',
  'LAB_REVIEW',
] as const;

export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_CHANNELS = [
  'IN_PERSON',
  'TELEMEDICINE',
  'PHONE',
] as const;

export type AppointmentChannel = (typeof APPOINTMENT_CHANNELS)[number];

export const DEFAULT_APPOINTMENT_DURATION_MIN = 30;
export const MIN_APPOINTMENT_DURATION_MIN = 5;
export const MAX_APPOINTMENT_DURATION_MIN = 480;
