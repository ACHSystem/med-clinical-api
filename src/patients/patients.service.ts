import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto, UpdatePatientDto } from './patients.dto';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async getPatients(clinicId: string) {
    const patients = await this.prisma.patient.findMany({
      where: { clinicId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    return patients;
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

  async update(id: string, dto: UpdatePatientDto, clinicId: string) {
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

  async remove(id: string, clinicId: string) {
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