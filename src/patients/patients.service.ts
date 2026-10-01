import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { CreatePatientDto, PatientListQueryDto, UpdatePatientDto } from './patients.dto';
import { MedicalHistoriesService } from 'src/medical-histories/medical-histories.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalHistoryService: MedicalHistoriesService,
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
      this.prisma.patient.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.patient.count({ where }),
    ]);
    return toPaginatedResult(patients, total, query.page, query.limit);
  }

  async getPatientMedicalHistories(patientId: string, clinicId: string) {
    await this.findOne(patientId, clinicId);
    return this.medicalHistoryService.getHistoryByPatientId({ patientId, clinicId });
  }

  async findOne(id: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }

  async createPatient(dto: CreatePatientDto, clinicId: string) {
    const findPatient = await this.prisma.patient.findFirst({
      where: {
        identify: dto.identify,
      }
    });

    if (findPatient) {
      throw new NotFoundException('Ya existe un Paciente con esta cedula');
    }

    const patient = await this.prisma.patient.create({
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

    return {
      status: true,
      message: 'Paciente agregado exitosamente',
      data: patient,
    };
  }

  async updatePatient(id: string, dto: UpdatePatientDto, clinicId: string) {
    await this.findOne(id, clinicId);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });

    return {
      status: true,
      message: 'Paciente actualizado exitosamente',
      data: patient,
    };
  }

  async deletePatient(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const patient = await this.prisma.patient.update({
      where: { id },
      data: { isActive: false },
    });
    return {
      status: true,
      message: 'Paciente eliminado exitosamente',
      data: patient,
    };
  }
}