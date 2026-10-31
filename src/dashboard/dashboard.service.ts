import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, QuoteStatus } from '../generated/prisma/client';
import {
  CurrencyTotal,
  DASHBOARD_TIMEZONE,
  DashboardAgenda,
  DashboardAgendaQueryDto,
  DashboardSummary,
  QUOTE_PENDING_STATUSES,
  QuoteSummary,
  UPCOMING_APPOINTMENT_DAYS,
} from './dashboard.dto';

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
}

interface ZonedDateTimeParts extends ZonedDateParts {
  hour: number;
  minute: number;
  second: number;
}

interface QuoteGroup {
  status: QuoteStatus;
  currency: string;
  _count: { _all: number };
  _sum: { total: Prisma.Decimal | null };
}

const AGENDA_APPOINTMENT_SELECT = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  type: true,
  channel: true,
  reason: true,
  confirmedAt: true,
  attendedAt: true,
  patient: {
    select: {
      id: true,
      name: true,
      lastName: true,
      identify: true,
      phone: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(clinicId: string): Promise<DashboardSummary> {
    const now = new Date();
    const todayParts = getZonedDateTimeParts(now, DASHBOARD_TIMEZONE);
    const today = {
      year: todayParts.year,
      month: todayParts.month,
      day: todayParts.day,
    };

    const todayStart = startOfZonedDay(today, DASHBOARD_TIMEZONE);
    const tomorrowStart = startOfZonedDay(
      addDays(today, 1),
      DASHBOARD_TIMEZONE,
    );
    const upcomingEnd = startOfZonedDay(
      addDays(today, UPCOMING_APPOINTMENT_DAYS + 1),
      DASHBOARD_TIMEZONE,
    );

    const monthStart = startOfZonedDay(
      { year: today.year, month: today.month, day: 1 },
      DASHBOARD_TIMEZONE,
    );
    const monthEnd = startOfZonedDay(
      nextMonth({ year: today.year, month: today.month, day: 1 }),
      DASHBOARD_TIMEZONE,
    );

    const appointmentScope = validAppointmentScope(clinicId);

    const [
      activePatients,
      todayAppointments,
      upcomingAppointments,
      monthConsultations,
      quoteGroups,
    ] = await Promise.all([
      this.prisma.patient.count({
        where: { clinicId, isActive: true },
      }),
      this.prisma.appointment.count({
        where: {
          ...appointmentScope,
          scheduledAt: { gte: todayStart, lt: tomorrowStart },
        },
      }),
      this.prisma.appointment.count({
        where: {
          ...appointmentScope,
          scheduledAt: { gte: tomorrowStart, lt: upcomingEnd },
        },
      }),
      this.prisma.medicalHistory.count({
        where: {
          clinicId,
          deleted: false,
          date: { gte: monthStart, lt: monthEnd },
        },
      }),
      this.prisma.quote.groupBy({
        by: ['status', 'currency'],
        where: {
          clinicId,
          isActive: true,
          supersededAt: null,
          status: {
            in: [...QUOTE_PENDING_STATUSES, QuoteStatus.APPROVED],
          },
        },
        _count: { _all: true },
        _sum: { total: true },
      }),
    ]);

    const groups = quoteGroups as QuoteGroup[];
    const pendingGroups = groups.filter((group) =>
      QUOTE_PENDING_STATUSES.includes(group.status),
    );
    const approvedGroups = groups.filter(
      (group) => group.status === QuoteStatus.APPROVED,
    );

    return {
      clinicId,
      generatedAt: now.toISOString(),
      timezone: DASHBOARD_TIMEZONE,
      patients: {
        active: activePatients,
      },
      appointments: {
        today: todayAppointments,
        upcoming: upcomingAppointments,
      },
      consultations: {
        month: monthConsultations,
      },
      quotes: {
        pending: this.summarizeQuotes(pendingGroups),
        approved: this.summarizeQuotes(approvedGroups),
        total: this.summarizeQuotes([...pendingGroups, ...approvedGroups]),
      },
    };
  }

  async getAgenda(
    clinicId: string,
    query: DashboardAgendaQueryDto,
  ): Promise<DashboardAgenda> {
    const now = new Date();
    const todayParts = getZonedDateTimeParts(now, DASHBOARD_TIMEZONE);
    const today = {
      year: todayParts.year,
      month: todayParts.month,
      day: todayParts.day,
    };

    const todayStart = startOfZonedDay(today, DASHBOARD_TIMEZONE);
    const tomorrowStart = startOfZonedDay(
      addDays(today, 1),
      DASHBOARD_TIMEZONE,
    );
    const upcomingEnd = startOfZonedDay(
      addDays(today, query.days + 1),
      DASHBOARD_TIMEZONE,
    );
    const appointmentScope = validAppointmentScope(clinicId);

    const [todayAppointments, upcomingCount, upcomingAppointments] =
      await Promise.all([
        this.prisma.appointment.findMany({
          where: {
            ...appointmentScope,
            scheduledAt: { gte: todayStart, lt: tomorrowStart },
          },
          orderBy: { scheduledAt: 'asc' },
          select: AGENDA_APPOINTMENT_SELECT,
        }),
        this.prisma.appointment.count({
          where: {
            ...appointmentScope,
            scheduledAt: { gte: tomorrowStart, lt: upcomingEnd },
          },
        }),
        this.prisma.appointment.findMany({
          where: {
            ...appointmentScope,
            scheduledAt: { gte: tomorrowStart, lt: upcomingEnd },
          },
          orderBy: { scheduledAt: 'asc' },
          take: query.limit,
          select: AGENDA_APPOINTMENT_SELECT,
        }),
      ]);

    return {
      clinicId,
      generatedAt: now.toISOString(),
      timezone: DASHBOARD_TIMEZONE,
      today: {
        date: formatZonedDate(today),
        count: todayAppointments.length,
        appointments: todayAppointments,
      },
      upcoming: {
        from: formatZonedDate(addDays(today, 1)),
        to: formatZonedDate(addDays(today, query.days)),
        count: upcomingCount,
        limit: query.limit,
        hasMore: upcomingCount > upcomingAppointments.length,
        appointments: upcomingAppointments,
      },
    };
  }

  private summarizeQuotes(groups: QuoteGroup[]): QuoteSummary {
    const amounts = new Map<string, Prisma.Decimal>();
    let count = 0;

    for (const group of groups) {
      count += group._count._all;
      const current = amounts.get(group.currency) ?? new Prisma.Decimal(0);
      amounts.set(
        group.currency,
        current.plus(new Prisma.Decimal(group._sum.total ?? 0)),
      );
    }

    const totalsByCurrency: CurrencyTotal[] = Array.from(amounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([currency, amount]) => ({
        currency,
        amount: amount.toFixed(2),
      }));

    return { count, totalsByCurrency };
  }
}

function validAppointmentScope(clinicId: string) {
  return {
    clinicId,
    deleted: false,
    cancelledAt: null,
    status: { notIn: ['CANCELLED', 'NO_SHOW'] },
  };
}

function formatZonedDate(parts: ZonedDateParts): string {
  const year = parts.year.toString().padStart(4, '0');
  const month = parts.month.toString().padStart(2, '0');
  const day = parts.day.toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getZonedDateTimeParts(
  date: Date,
  timeZone: string,
): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const parts = getZonedDateTimeParts(date, timeZone);
  const wallTimeAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const timestamp = Math.floor(date.getTime() / 1000) * 1000;

  return wallTimeAsUtc - timestamp;
}

function zonedDateTimeToUtc(parts: ZonedDateTimeParts, timeZone: string): Date {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offset = getTimeZoneOffset(new Date(utcGuess), timeZone);
  let result = new Date(utcGuess - offset);
  const correctedOffset = getTimeZoneOffset(result, timeZone);

  if (correctedOffset !== offset) {
    result = new Date(utcGuess - correctedOffset);
  }

  return result;
}

function startOfZonedDay(parts: ZonedDateParts, timeZone: string): Date {
  return zonedDateTimeToUtc(
    { ...parts, hour: 0, minute: 0, second: 0 },
    timeZone,
  );
}

function addDays(parts: ZonedDateParts, days: number): ZonedDateParts {
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day + days),
  );

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function nextMonth(parts: ZonedDateParts): ZonedDateParts {
  if (parts.month === 12) {
    return { year: parts.year + 1, month: 1, day: 1 };
  }

  return { year: parts.year, month: parts.month + 1, day: 1 };
}
