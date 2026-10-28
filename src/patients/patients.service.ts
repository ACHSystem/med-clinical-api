import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { writeResponse } from '../common/api-response';
import { PatientDto, PatientListQueryDto, UpdatePatientDto } from './patients.dto';
import { MedicalHistoriesService } from '../medical-histories/medical-histories.service';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, Prisma } from '../generated/prisma/client';

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
      isActive: query.isActive ?? true,
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

  async findOne(id: string, clinicId: string, includeInactive = false) {
    const patient = await this.prismaService.patient.findFirst({
      where: {
        id,
        clinicId,
        ...(includeInactive ? {} : { isActive: true }),
      },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }

  async createPatient(dto: PatientDto, clinicId: string, userId: string) {
    const findPatient = await this.prismaService.patient.findFirst({
      where: { clinicId, identify: dto.identify },
      select: { id: true },
    });

    if (findPatient) {
      throw new ConflictException('Ya existe un paciente con esta cédula en la clínica');
    }

    try {
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
    } catch (error) {
      this.handleDuplicate(error);
      throw error;
    }
  }

  async updatePatient(
    id: string,
    dto: UpdatePatientDto,
    clinicId: string,
    userId: string,
  ) {
    const existing = await this.findOne(id, clinicId, true);

    if (!existing.isActive && dto.isActive !== true) {
      throw new NotFoundException('Paciente no encontrado');
    }

    if (dto.identify && dto.identify !== existing.identify) {
      const duplicate = await this.prismaService.patient.findFirst({
        where: { clinicId, identify: dto.identify, id: { not: id } },
        select: { id: true },
      });

      if (duplicate) {
        throw new ConflictException('Ya existe un paciente con esta cédula en la clínica');
      }
    }

    const data: Prisma.PatientUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.identify !== undefined) data.identify = dto.identify;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.birthDate !== undefined) data.birthDate = new Date(dto.birthDate);
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.address !== undefined) data.address = dto.address;
    if (dto.notes !== undefined) data.notes = dto.notes || '';
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    try {
      const patient = await this.prismaService.$transaction(async (tx) => {
        const updated = await tx.patient.update({ where: { id }, data });

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
    } catch (error) {
      this.handleDuplicate(error);
      throw error;
    }
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

  private handleDuplicate(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe un paciente con esta cédula en la clínica');
    }
  }
}
