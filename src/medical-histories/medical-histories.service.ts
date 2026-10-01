import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import { CreateMedicalHistoryDto, MedicalHistoryListQueryDto, UpdateMedicalHistoryDto } from './medical-histories.dto';

@Injectable()
export class MedicalHistoriesService {
  constructor(private prisma: PrismaService) { }

  async getAllHistories(clinicId: string, query: MedicalHistoryListQueryDto) {
    const where = {
      deleted: false,
      clinicId,
      ...(query.patientId ? { patientId: query.patientId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.dateStart || query.dateTo
        ? {
          date: {
            ...(query.dateStart ? { gte: new Date(query.dateStart) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
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
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          createdAt: true,
          patient: {
            select: {
              id: true,
              name: true,
              lastName: true,
              identify: true,
            },
          },
        },
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

  async getHistoryByPatientId(patientId: string, clinicId: string) {
    await this.assertOwnsPatient(patientId, clinicId);
    const histories = await this.prisma.medicalHistory.findMany({
      where: { patientId, clinicId, deleted: false },
      include: {
        patient: true,
        medicalTreatments: {
          include: {
            treatmentMedications: {
              include: {
                medication: true,
              }
            }
          },
          template: true,
        }
      }
    });
    return histories;
  }

  async createMedicalHistory(dto: CreateMedicalHistoryDto, clinicId: string, userId: string) {
    await this.assertOwnsPatient(dto.patientId, clinicId);
    const history = await this.prisma.medicalHistory.create({
      data: {
        title: dto.title,
        type: dto.type,
        reason: dto.reason,
        symptoms: dto.symptoms,
        observations: dto.observations,
        diagnosis: dto.diagnosis,
        evaluation: dto.evaluation,
        date: new Date(dto.date),
        status: dto.status,
        vitalSigns: dto.vitalSigns,
        data: dto.data,
        notes: dto.notes,
        patientId: dto.patientId,
        templateId: dto.templateId || null,
        templateSnapshot: dto.templateSnapshot,
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

  async updateMedicalHistory(id: string, dto: UpdateMedicalHistoryDto, clinicId: string) {
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

  async deleteMedicalHistory(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const history = await this.prisma.medicalHistory.update({ where: { id }, data: { deleted: true, deletedAt: new Date() } });
    return {
      status: true,
      message: 'Historia médica eliminada exitosamente',
      data: history,
    };
  }
}