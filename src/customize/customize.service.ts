import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './customize.dto';

@Injectable()
export class CustomizeService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.customField.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findOne(id: string) {
    const field = await this.prisma.customField.findUnique({ where: { id } });
    if (!field) {
      throw new NotFoundException('Campo no encontrado');
    }
    return field;
  }

  async create(dto: CreateCustomFieldDto) {
    const field = await this.prisma.customField.create({ data: dto });
    return {
      status: true,
      message: 'Campo personalizado agregado exitosamente',
      data: field,
    };
  }

  async update(id: string, dto: UpdateCustomFieldDto) {
    await this.findOne(id);
    const field = await this.prisma.customField.update({ where: { id }, data: dto });
    return {
      status: true,
      message: 'Campo personalizado actualizado exitosamente',
      data: field,
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    const field = await this.prisma.customField.update({ where: { id }, data: { isActive: false } });
    return {
      status: true,
      message: 'Campo personalizado eliminado exitosamente',
      data: field,
    };
  }

  async reorder(fields: { id: string; sortOrder: number; step: number }[]) {
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