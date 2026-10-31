import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MedicalHistoryWriterService } from '../medical-histories/medical-history-writer.service';
import { AuditService } from '../audit/audit.service';
import { toPaginatedResult } from '../common/pagination';
import { detailResponse, writeResponse } from '../common/api-response';
import { AppointmentStatus, AuditAction, Prisma } from '../generated/prisma/client';
import {
  AppointmentListQueryDto,
  AttendAppointmentDto,
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  UpdateAppointmentDto,
} from './appointments.dto';
import {
  DEFAULT_APPOINTMENT_DURATION_MIN,
  MAX_APPOINTMENT_DURATION_MIN,
} from './appointments.constants';

const SLOT_OCCUPYING_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ATTENDED,
];

const EDITABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

const NOTIFIABLE_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
];

const APPOINTMENT_LIST_SELECT = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  type: true,
  channel: true,
  reason: true,
  notes: true,
  confirmedAt: true,
  attendedAt: true,
  cancelledAt: true,
  rescheduledAt: true,
  noShowAt: true,
  medicalHistoryId: true,
  rescheduledFromId: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      name: true,
      lastName: true,
      identify: true,
      phone: true,
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      lastName: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

const APPOINTMENT_DETAIL_INCLUDE = {
  patient: {
    select: {
      id: true,
      name: true,
      lastName: true,
      identify: true,
      email: true,
      phone: true,
      birthDate: true,
      gender: true,
    },
  },
  user: {
    select: {
      id: true,
      name: true,
      lastName: true,
    },
  },
  medicalHistory: {
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      status: true,
      signedAt: true,
      createdAt: true,
    },
  },
  rescheduledFrom: {
    select: {
      id: true,
      scheduledAt: true,
      status: true,
    },
  },
  rescheduledTo: {
    select: {
      id: true,
      scheduledAt: true,
      status: true,
    },
  },
} satisfies Prisma.AppointmentInclude;

const RESCHEDULE_CHAIN_SELECT = {
  id: true,
  scheduledAt: true,
  durationMin: true,
  status: true,
  type: true,
  channel: true,
  rescheduledFromId: true,
  rescheduledTo: {
    select: {
      id: true,
    },
  },
  patient: {
    select: {
      id: true,
      name: true,
      lastName: true,
      identify: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

interface OverlapCheck {
  clinicId: string;
  userId: string;
  patientId: string;
  start: Date;
  durationMin: number;
  excludeId?: string;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalHistoryWriter: MedicalHistoryWriterService,
    private readonly auditService: AuditService,
  ) {}

  async getAllAppointments(clinicId: string, query: AppointmentListQueryDto) {
    const where: Prisma.AppointmentWhereInput = {
      clinicId,
      deleted: false,
      ...(query.status ? { status: query.status } : {}),
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.dateStart || query.dateTo
        ? {
            scheduledAt: {
              ...(query.dateStart ? { gte: new Date(query.dateStart) } : {}),
              ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                patient: {
                  is: {
                    name: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              },
              {
                patient: {
                  is: {
                    lastName: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              },
              {
                patient: {
                  is: {
                    identify: { contains: query.search, mode: 'insensitive' as const },
                  },
                },
              },
              { reason: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [appointments, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { scheduledAt: query.order ?? 'asc' },
        select: APPOINTMENT_LIST_SELECT,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return toPaginatedResult(appointments, total, query.page, query.limit);
  }

  async findOne(id: string, clinicId: string) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, clinicId, deleted: false },
      include: APPOINTMENT_DETAIL_INCLUDE,
    });

    if (!appointment) {
      throw new NotFoundException('Cita no encontrada');
    }

    return appointment;
  }

  async getOne(id: string, clinicId: string) {
    return detailResponse(await this.findOne(id, clinicId));
  }

  async create(dto: CreateAppointmentDto, clinicId: string, userId: string) {
    await this.assertPatient(dto.patientId, clinicId);

    const assignedUserId = dto.userId ?? userId;
    await this.assertClinicMember(assignedUserId, clinicId);

    if (dto.medicalHistoryId) {
      await this.assertHistoryLinkable(dto.medicalHistoryId, dto.patientId, clinicId);
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const durationMin = dto.durationMin ?? DEFAULT_APPOINTMENT_DURATION_MIN;

    await this.assertNoOverlap({
      clinicId,
      userId: assignedUserId,
      patientId: dto.patientId,
      start: scheduledAt,
      durationMin,
    });

    const appointment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appointment.create({
        data: {
          patientId: dto.patientId,
          clinicId,
          userId: assignedUserId,
          scheduledAt,
          durationMin,
          type: dto.type ?? 'GENERAL_CONSULT',
          channel: dto.channel ?? 'IN_PERSON',
          reason: dto.reason,
          notes: dto.notes,
          status: AppointmentStatus.SCHEDULED,
          medicalHistoryId: dto.medicalHistoryId ?? null,
        },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: created.id,
          action: AuditAction.CREATE,
          metadata: {
            fields: [
              'patientId',
              'userId',
              'scheduledAt',
              'durationMin',
              'type',
              'channel',
              'medicalHistoryId',
            ],
            status: created.status,
          },
          userId,
          clinicId,
        },
        tx,
      );

      return created;
    });

    return writeResponse('Cita agregada exitosamente', appointment);
  }

  async update(
    id: string,
    dto: UpdateAppointmentDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.findOne(id, clinicId);

    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `No se puede editar una cita en estado ${existing.status}`,
      );
    }

    const assignedUserId = dto.userId ?? existing.userId;
    if (dto.userId && dto.userId !== existing.userId) {
      await this.assertClinicMember(assignedUserId, clinicId);
    }

    const scheduledAt = dto.scheduledAt
      ? new Date(dto.scheduledAt)
      : existing.scheduledAt;
    const durationMin = dto.durationMin ?? existing.durationMin;

    if (
      dto.scheduledAt !== undefined
      || dto.durationMin !== undefined
      || (dto.userId !== undefined && dto.userId !== existing.userId)
    ) {
      await this.assertNoOverlap({
        clinicId,
        userId: assignedUserId,
        patientId: existing.patientId,
        start: scheduledAt,
        durationMin,
        excludeId: existing.id,
      });
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: {
          scheduledAt,
          durationMin,
          userId: assignedUserId,
          type: dto.type ?? existing.type,
          channel: dto.channel ?? existing.channel,
          reason: dto.reason ?? existing.reason,
          notes: dto.notes ?? existing.notes,
        },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: { fields: Object.keys(dto) },
          userId,
          clinicId,
        },
        tx,
      );

      return updated;
    });

    return writeResponse('Cita actualizada exitosamente', appointment);
  }

  async remove(id: string, clinicId: string, userId: string) {
    await this.findOne(id, clinicId);

    const appointment = await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.appointment.update({
        where: { id },
        data: { deleted: true, deletedAt: new Date() },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: deleted.id,
          action: AuditAction.DELETE,
          metadata: { softDelete: true },
          userId,
          clinicId,
        },
        tx,
      );

      return deleted;
    });

    return writeResponse('Cita eliminada exitosamente', appointment);
  }

  async confirm(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      AppointmentStatus.CONFIRMED,
      [AppointmentStatus.SCHEDULED],
      { confirmedAt: new Date() },
    );
  }

  async attend(
    id: string,
    dto: AttendAppointmentDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.findOne(id, clinicId);

    if (!NOTIFIABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `No se puede pasar la cita de ${existing.status} a ${AppointmentStatus.ATTENDED}`,
      );
    }

    if (dto.medicalHistoryId && dto.history) {
      throw new BadRequestException(
        'Envíe medicalHistoryId o history, pero no ambos',
      );
    }

    if (existing.medicalHistoryId && (dto.medicalHistoryId || dto.history)) {
      throw new BadRequestException('La cita ya tiene una historia vinculada');
    }

    if (!existing.medicalHistoryId && !dto.medicalHistoryId && !dto.history) {
      throw new BadRequestException(
        'Para marcar la cita como ATTENDED debe asociar o crear una historia clínica',
      );
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      let medicalHistoryId = existing.medicalHistoryId;

      if (dto.medicalHistoryId) {
        await this.assertHistoryLinkable(
          dto.medicalHistoryId,
          existing.patientId,
          clinicId,
          existing.id,
          tx,
        );
        medicalHistoryId = dto.medicalHistoryId;
      } else if (dto.history) {
        const created = await this.medicalHistoryWriter.createHistoryInTransaction(
          tx,
          dto.history,
          existing.patientId,
          clinicId,
          userId,
          existing.id,
        );
        medicalHistoryId = created.id;
      }

      const updated = await tx.appointment.update({
        where: { id },
        data: {
          status: AppointmentStatus.ATTENDED,
          attendedAt: new Date(),
          medicalHistoryId: medicalHistoryId ?? null,
        },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: {
            status: AppointmentStatus.ATTENDED,
            previousStatus: existing.status,
          },
          userId,
          clinicId,
        },
        tx,
      );

      return updated;
    });

    return writeResponse('Cita marcada como atendida exitosamente', appointment);
  }

  async noShow(id: string, clinicId: string, userId: string) {
    const existing = await this.findOne(id, clinicId);

    if (!NOTIFIABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `No se puede pasar la cita de ${existing.status} a ${AppointmentStatus.NO_SHOW}`,
      );
    }

    if (existing.medicalHistoryId) {
      throw new BadRequestException(
        'No se puede marcar como NO_SHOW una cita vinculada a una historia clínica',
      );
    }

    return this.transition(
      id,
      clinicId,
      userId,
      AppointmentStatus.NO_SHOW,
      NOTIFIABLE_STATUSES,
      { noShowAt: new Date() },
    );
  }

  async cancel(id: string, clinicId: string, userId: string) {
    return this.transition(
      id,
      clinicId,
      userId,
      AppointmentStatus.CANCELLED,
      NOTIFIABLE_STATUSES,
      { cancelledAt: new Date() },
    );
  }

  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.findOne(id, clinicId);

    if (!EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        `No se puede reagendar una cita en estado ${existing.status}`,
      );
    }

    const assignedUserId = dto.userId ?? existing.userId;
    if (dto.userId && dto.userId !== existing.userId) {
      await this.assertClinicMember(assignedUserId, clinicId);
    }

    const scheduledAt = new Date(dto.scheduledAt);
    const durationMin = dto.durationMin ?? existing.durationMin;

    await this.assertNoOverlap({
      clinicId,
      userId: assignedUserId,
      patientId: existing.patientId,
      start: scheduledAt,
      durationMin,
      excludeId: existing.id,
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      if (existing.medicalHistoryId) {
        await tx.appointment.update({
          where: { id: existing.id },
          data: { medicalHistoryId: null },
        });
      }

      const newAppointment = await tx.appointment.create({
        data: {
          patientId: existing.patientId,
          clinicId,
          userId: assignedUserId,
          scheduledAt,
          durationMin,
          type: dto.type ?? existing.type,
          channel: dto.channel ?? existing.channel,
          reason: dto.reason ?? existing.reason,
          notes: dto.notes ?? existing.notes,
          status: AppointmentStatus.SCHEDULED,
          medicalHistoryId: existing.medicalHistoryId,
          rescheduledFromId: existing.id,
        },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      const original = await tx.appointment.update({
        where: { id: existing.id },
        data: {
          status: AppointmentStatus.RESCHEDULED,
          rescheduledAt: now,
        },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: original.id,
          action: AuditAction.UPDATE,
          metadata: {
            status: AppointmentStatus.RESCHEDULED,
            previousStatus: existing.status,
            rescheduledToId: newAppointment.id,
          },
          userId,
          clinicId,
        },
        tx,
      );

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: newAppointment.id,
          action: AuditAction.CREATE,
          metadata: {
            status: newAppointment.status,
            rescheduledFromId: original.id,
          },
          userId,
          clinicId,
        },
        tx,
      );

      return { original, newAppointment };
    });

    return writeResponse('Cita reagendada exitosamente', result);
  }

  async getRescheduleHistory(id: string, clinicId: string) {
    const current = await this.prisma.appointment.findFirst({
      where: { id, clinicId, deleted: false },
      select: { id: true, rescheduledFromId: true },
    });

    if (!current) {
      throw new NotFoundException('Cita no encontrada');
    }

    let rootId = current.id;
    let parentId = current.rescheduledFromId;
    const visited = new Set<string>([rootId]);

    while (parentId && !visited.has(parentId)) {
      const parent = await this.prisma.appointment.findFirst({
        where: { id: parentId, clinicId, deleted: false },
        select: { id: true, rescheduledFromId: true },
      });

      if (!parent) {
        break;
      }

      visited.add(parent.id);
      rootId = parent.id;
      parentId = parent.rescheduledFromId;
    }

    const chain: Array<{ id: string; rescheduledTo: { id: string } | null }> = [];
    let node = await this.prisma.appointment.findFirst({
      where: { id: rootId, clinicId, deleted: false },
      select: RESCHEDULE_CHAIN_SELECT,
    });

    while (node) {
      chain.push(node);
      const nextId = node.rescheduledTo?.id;
      if (!nextId) {
        break;
      }
      node = await this.prisma.appointment.findFirst({
        where: { id: nextId, clinicId, deleted: false },
        select: RESCHEDULE_CHAIN_SELECT,
      });
    }

    return detailResponse({ appointmentId: id, rootId, chain });
  }

  private async transition(
    id: string,
    clinicId: string,
    userId: string,
    target: AppointmentStatus,
    allowedFrom: AppointmentStatus[],
    data: Prisma.AppointmentUpdateInput,
  ) {
    const existing = await this.findOne(id, clinicId);

    if (!allowedFrom.includes(existing.status)) {
      throw new BadRequestException(
        `No se puede pasar la cita de ${existing.status} a ${target}`,
      );
    }

    const appointment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { ...data, status: target },
        include: APPOINTMENT_DETAIL_INCLUDE,
      });

      await this.auditService.record(
        {
          entity: 'Appointment',
          entityId: updated.id,
          action: AuditAction.UPDATE,
          metadata: { status: target, previousStatus: existing.status },
          userId,
          clinicId,
        },
        tx,
      );

      return updated;
    });

    return writeResponse(`Cita actualizada a ${target} exitosamente`, appointment);
  }

  private async assertPatient(patientId: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId, isActive: true },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
  }

  private async assertClinicMember(userId: string, clinicId: string) {
    const membership = await this.prisma.clinicUser.findFirst({
      where: {
        userId,
        clinicId,
        isActive: true,
        user: { isActive: true },
      },
      select: { userId: true },
    });

    if (!membership) {
      throw new NotFoundException('Médico no encontrado en la clínica');
    }
  }

  private async assertHistoryLinkable(
    medicalHistoryId: string,
    patientId: string,
    clinicId: string,
    currentAppointmentId?: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const history = await client.medicalHistory.findFirst({
      where: { id: medicalHistoryId, clinicId, deleted: false },
      select: {
        id: true,
        patientId: true,
        appointment: { select: { id: true } },
      },
    });

    if (!history) {
      throw new NotFoundException('Historia clínica no encontrada');
    }

    if (history.patientId !== patientId) {
      throw new BadRequestException(
        'La historia clínica pertenece a otro paciente',
      );
    }

    if (
      history.appointment
      && history.appointment.id !== currentAppointmentId
    ) {
      throw new ConflictException(
        'La historia clínica ya está vinculada a otra cita',
      );
    }

    return history;
  }

  private async assertNoOverlap({
    clinicId,
    userId,
    patientId,
    start,
    durationMin,
    excludeId,
  }: OverlapCheck) {
    const end = new Date(start.getTime() + durationMin * 60_000);
    const windowStart = new Date(
      start.getTime() - MAX_APPOINTMENT_DURATION_MIN * 60_000,
    );

    const candidates = await this.prisma.appointment.findMany({
      where: {
        clinicId,
        deleted: false,
        status: { in: SLOT_OCCUPYING_STATUSES },
        scheduledAt: { gte: windowStart, lt: end },
        OR: [{ userId }, { patientId }],
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: {
        id: true,
        userId: true,
        patientId: true,
        scheduledAt: true,
        durationMin: true,
      },
    });

    const conflicts = candidates.filter((candidate) => {
      const candidateEnd = new Date(
        candidate.scheduledAt.getTime() + candidate.durationMin * 60_000,
      );
      return candidate.scheduledAt < end && candidateEnd > start;
    });

    if (conflicts.some((candidate) => candidate.userId === userId)) {
      throw new ConflictException(
        `El médico ya tiene otra cita en ese horario (${start.toISOString()})`,
      );
    }

    if (conflicts.some((candidate) => candidate.patientId === patientId)) {
      throw new ConflictException(
        `El paciente ya tiene otra cita en ese horario (${start.toISOString()})`,
      );
    }
  }
}
