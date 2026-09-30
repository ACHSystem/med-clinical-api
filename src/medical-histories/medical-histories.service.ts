import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { CreateMedicalHistoryDto, MedicalHistoryListQueryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';

@Injectable()
export class MedicalHistoriesService {
  constructor(private prisma: PrismaService) {}

  async findAllByPatient(patientId: string, clinicId: string, query: MedicalHistoryListQueryDto) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, clinicId } });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    const where = {
      patientId,
      clinicId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
              ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' as const } },
              { notes: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [histories, total] = await Promise.all([
      this.prisma.medicalHistory.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.medicalHistory.count({ where }),
    ]);
    return toPaginatedResult(histories, total, query.page, query.limit);
  }

  /** Impide escribir una historia sobre un paciente de otra clinica (IDOR). */
  private async assertOwnsPatient(patientId: string, clinicId: string) {
    const patient = await this.prisma.patient.findFirst({ where: { id: patientId, clinicId } });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return patient;
  }

  async findOne(id: string, clinicId: string) {
    const history = await this.prisma.medicalHistory.findFirst({
      where: { id, clinicId },
    });
    if (!history) {
      throw new NotFoundException('Historia no encontrada');
    }
    return history;
  }

  async create(dto: CreateMedicalHistoryDto, clinicId: string, userId: string) {
    await this.assertOwnsPatient(dto.patientId, clinicId);
    const history = await this.prisma.medicalHistory.create({
      data: {
        title: dto.title || '',
        data: dto.data,
        notes: dto.notes || '',
        patientId: dto.patientId,
        clinicId,
        createdById: userId,
      },
    });
    return {
      status: true,
      message: 'Historia médica agregada exitosamente',
      data: history,
    };
  }

  async update(id: string, dto: UpdateMedicalHistoryDto, clinicId: string) {
    await this.findOne(id, clinicId);
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

  async remove(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const history = await this.prisma.medicalHistory.delete({ where: { id } });
    return {
      status: true,
      message: 'Historia médica eliminada exitosamente',
      data: history,
    };
  }
}