import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicalHistoryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';

@Injectable()
export class MedicalHistoriesService {
  constructor(private prisma: PrismaService) {}

  async findAllByPatient(patientId: string, userId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, userId } });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return this.prisma.medicalHistory.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const history = await this.prisma.medicalHistory.findFirst({
      where: { id, user: { id: userId } },
    });
    if (!history) {
      throw new NotFoundException('Historia no encontrada');
    }
    return history;
  }

  async create(dto: CreateMedicalHistoryDto, userId: string) {
    const history = await this.prisma.medicalHistory.create({
      data: {
        title: dto.title || '',
        data: dto.data,
        notes: dto.notes || '',
        patientId: dto.patientId,
        userId,
      },
    });
    return {
      status: true,
      message: 'Historia médica agregada exitosamente',
      data: history,
    };
  }

  async update(id: string, dto: UpdateMedicalHistoryDto, userId: string) {
    await this.findOne(id, userId);
    const history = await this.prisma.medicalHistory.update({
      where: { id },
      data: dto,
    });
    return {
      status: true,
      message: 'Historia médica actualizada exitosamente',
      data: history,
    };
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);
    const history = await this.prisma.medicalHistory.delete({ where: { id } });
    return {
      status: true,
      message: 'Historia médica eliminada exitosamente',
      data: history,
    };
  }
}