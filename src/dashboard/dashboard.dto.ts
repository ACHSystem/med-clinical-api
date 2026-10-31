import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { QuoteStatus } from '../generated/prisma/client';

export const DASHBOARD_TIMEZONE = 'America/Caracas';
export const UPCOMING_APPOINTMENT_DAYS = 7;
export const DASHBOARD_AGENDA_LIMIT = 20;
export const DASHBOARD_AGENDA_MAX_DAYS = 31;
export const DASHBOARD_AGENDA_MAX_LIMIT = 100;
export const QUOTE_PENDING_STATUSES: QuoteStatus[] = [
  QuoteStatus.DRAFT,
  QuoteStatus.SENT,
];

export class DashboardAgendaQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_AGENDA_MAX_DAYS)
  @IsOptional()
  days: number = UPCOMING_APPOINTMENT_DAYS;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(DASHBOARD_AGENDA_MAX_LIMIT)
  @IsOptional()
  limit: number = DASHBOARD_AGENDA_LIMIT;
}

export interface CurrencyTotal {
  currency: string;
  amount: string;
}

export interface QuoteSummary {
  count: number;
  totalsByCurrency: CurrencyTotal[];
}

export interface DashboardSummary {
  // clinicId: string;
  generatedAt: string;
  timezone: string;
  patients: {
    active: number;
  };
  appointments: {
    today: number;
    upcoming: number;
  };
  consultations: {
    month: number;
  };
  quotes: {
    pending: QuoteSummary;
    approved: QuoteSummary;
    total: QuoteSummary;
  };
}

export interface DashboardAgendaPatient {
  id: string;
  name: string;
  lastName: string;
  identify: string;
  phone: string | null;
}

export interface DashboardAgendaAppointment {
  id: string;
  scheduledAt: Date;
  durationMin: number;
  status: string;
  type: string;
  channel: string;
  reason: string | null;
  confirmedAt: Date | null;
  attendedAt: Date | null;
  patient: DashboardAgendaPatient;
}

export interface DashboardAgenda {
  // clinicId: string;
  generatedAt: string;
  timezone: string;
  today: {
    date: string;
    count: number;
    appointments: DashboardAgendaAppointment[];
  };
  upcoming: {
    from: string;
    to: string;
    count: number;
    limit: number;
    hasMore: boolean;
    appointments: DashboardAgendaAppointment[];
  };
}
