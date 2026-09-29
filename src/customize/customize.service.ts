import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './customize.dto';

@Injectable()
export class CustomizeService {
  constructor(private prisma: PrismaService) {}

  async findAll(clinicId: string) {
    return this.prisma.customField.findMany({
      where: { isActive: true, template: { clinicId, isActive: true } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string, clinicId: string) {
    const field = await this.prisma.customField.findFirst({
      where: { id, template: { clinicId } },
    });
    if (!field) {
      throw new NotFoundException('Campo no encontrado');
    }
    return field;
  }

  async create(dto: CreateCustomFieldDto, clinicId: string) {
    const template = await this.prisma.formTemplate.upsert({
      where: { clinicId_name: { clinicId, name: 'General' } },
      update: { isActive: true },
      create: {
        name: 'General',
        description: 'Campos personalizados generales',
        clinicId,
      },
    });
    const field = await this.prisma.customField.create({
      data: { ...dto, options: dto.options ?? [], templateId: template.id },
    });
    return {
      status: true,
      message: 'Campo personalizado agregado exitosamente',
      data: field,
    };
  }

  async update(id: string, dto: UpdateCustomFieldDto, clinicId: string) {
    await this.findOne(id, clinicId);
    const field = await this.prisma.customField.update({ where: { id }, data: dto });
    return {
      status: true,
      message: 'Campo personalizado actualizado exitosamente',
      data: field,
    };
  }

  async remove(id: string, clinicId: string) {
    await this.findOne(id, clinicId);
    const field = await this.prisma.customField.update({ where: { id }, data: { isActive: false } });
    return {
      status: true,
      message: 'Campo personalizado eliminado exitosamente',
      data: field,
    };
  }

  async reorder(fields: { id: string; sortOrder: number; step: number }[], clinicId: string) {
    const fieldIds = fields.map(field => field.id);
    const clinicFields = await this.prisma.customField.findMany({
      where: { id: { in: fieldIds }, template: { clinicId } },
      select: { id: true },
    });
    if (clinicFields.length !== fieldIds.length) {
      throw new NotFoundException('Campo no encontrado');
    }

    const updates = fields.map(f =>
      this.prisma.customField.update({
        where: { id: f.id },
        data: { sortOrder: f.sortOrder, step: f.step },
      })
    );
    const result = await this.prisma.$transaction(updates);
    return {
      status: true,
      message: 'Campos reordenados exitosamente',
      data: result,
    };
  }
}