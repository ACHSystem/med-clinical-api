import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { PatientDto, PatientListQueryDto } from './patients.dto';
import { MedicalHistoriesService } from '../medical-histories/medical-histories.service';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../generated/prisma/client';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly medicalHistoryService: MedicalHistoriesService,
    private readonly auditService: AuditService,
  ) { }

  async getPatients(clinicId: string, query: PatientListQueryDto) {
    const where = {
      clinicId,
      isActive: true,
      ...(query.gender ? { gender: query.gender } : {}),
      ...(query.search
        ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { identify: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [patients, total] = await Promise.all([
      this.prismaService.patient.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaService.patient.count({ where }),
    ]);
    return toPaginatedResult(patients, total, query.page, query.limit);
  }

  async getPatientSimple(clinicId: string, query: PaginationQueryDto) {
    const where = {
      clinicId,
      isActive: true,
      ...(query.search
        ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { lastName: { contains: query.search, mode: 'insensitive' as const } },
            { identify: { contains: query.search, mode: 'insensitive' as const } },
            { email: { contains: query.search, mode: 'insensitive' as const } },
            { phone: { contains: query.search, mode: 'insensitive' as const } },
          ],
        }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [patients, total] = await Promise.all([
      this.prismaService.patient.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          lastName: true,
          phone: true,
          email: true,
          identify: true
        }
      }),
      this.prismaService.patient.count({ where }),
    ]);
    return toPaginatedResult(patients, total, query.page, query.limit);
  }

  async getPatientMedicalHistories(
    patientId: string,
    clinicId: string,
    query: PaginationQueryDto,
  ) {
    await this.findOne(patientId, clinicId);
    return this.medicalHistoryService.getHistoryByPatientId({ patientId, clinicId, query });
  }

  async findOne(id: string, clinicId: string) {
    const patient = await this.prismaService.patient.findFirst({
      where: { id, clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }

  async createPatient(dto: PatientDto, clinicId: string, userId: string) {
    const findPatient = await this.prismaService.patient.findFirst({
      where: {
        identify: dto.identify,
      }
    });

    if (findPatient) {
      throw new NotFoundException('Ya existe un Paciente con esta cedula');
    }

    const patient = await this.prismaService.$transaction(async (tx) => {
      const created = await tx.patient.create({
        data: {
          name: dto.name,
          lastName: dto.lastName,
          identify: dto.identify,
          email: dto.email,
          phone: dto.phone,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          gender: dto.gender,
          address: dto.address,
          notes: dto.notes || '',
          clinicId,
        },
      });

      await this.auditService.record({
        entity: 'Patient',
        entityId: created.id,
        action: AuditAction.CREATE,
        metadata: { fields: Object.keys(dto) },
        userId,
        clinicId,
      }, tx);

      return created;
    });

    return writeResponse('Paciente agregado exitosamente', patient);
  }

  async updatePatient(id: string, dto: PatientDto, clinicId: string, userId: string) {
    await this.findOne(id, clinicId);
    const patient = await this.prismaService.$transaction(async (tx) => {
      const updated = await tx.patient.update({
        where: { id },
        data: {
          name: dto.name,
          lastName: dto.lastName,
          identify: dto.identify,
          email: dto.email,
          phone: dto.phone,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          gender: dto.gender,
          address: dto.address,
          notes: dto.notes || '',
        },
      });

      await this.auditService.record({
        entity: 'Patient',
        entityId: updated.id,
        action: AuditAction.UPDATE,
        metadata: { fields: Object.keys(dto) },
        userId,
        clinicId,
      }, tx);

      return updated;
    });

    return writeResponse('Paciente actualizado exitosamente', patient);
  }

  async deletePatient(id: string, clinicId: string, userId: string) {
    await this.findOne(id, clinicId);
    const patient = await this.prismaService.$transaction(async (tx) => {
      const deleted = await tx.patient.update({
        where: { id },
        data: { isActive: false },
      });

      await this.auditService.record({
        entity: 'Patient',
        entityId: deleted.id,
        action: AuditAction.DELETE,
        metadata: { softDelete: true },
        userId,
        clinicId,
      }, tx);

      return deleted;
    });

    return writeResponse('Paciente eliminado exitosamente', patient);
  }
}