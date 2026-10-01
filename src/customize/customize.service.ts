import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPaginatedResult } from '../common/pagination';
import {
  CustomFieldDto,
  FormTemplateDto,
  CustomFieldListQueryDto,
  FormTemplateListQueryDto,
  ReorderCustomFieldDto,
  UpdateCustomFieldDto,
  UpdateFormTemplateDto,
} from './customize.dto';

@Injectable()
export class CustomizeService {
  constructor(private readonly prisma: PrismaService) {}

  async getFormTemplates(clinicId: string, query: FormTemplateListQueryDto) {
    const where = {
      isActive: true,
      clinicId,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
      ...(query.condition ? { condition: { contains: query.condition, mode: 'insensitive' as const } } : {}),
      ...(query.type ? { type: { contains: query.type, mode: 'insensitive' as const } } : {}),
    };
    const skip = (query.page - 1) * query.limit;
    const [templates, total] = await Promise.all([
      this.prisma.formTemplate.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: [{ name: 'asc' }],
        include: {
          fields: {
            orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
          },
        },
      }),
      this.prisma.formTemplate.count({ where }),
    ]);
    return toPaginatedResult(templates, total, query.page, query.limit);
  }

  async findTemplate(id: string, clinicId: string, isActive?: boolean) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id, clinicId, ...(isActive === undefined ? {} : { isActive }) },
      include: {
        fields: {
          orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
        },
      },
    });
    if (!template) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    return template;
  }

  async createTemplate(dto: FormTemplateDto, clinicId: string) {
    const { fields = [], ...templateData } = dto;
    const template = await this.prisma.$transaction(async transaction => {
      const createdTemplate = await transaction.formTemplate.create({
        data: { ...templateData, clinicId },
      });

      await this.createORAssignCustomFieldToTemplate(
        transaction,
        createdTemplate.id,
        clinicId,
        fields,
      );

      return transaction.formTemplate.findFirstOrThrow({
        where: { id: createdTemplate.id, clinicId },
        include: {
          fields: {
            orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
          },
        },
      });
    });

    return { status: true, message: 'Plantilla creada exitosamente', data: template };
  }

  private async createORAssignCustomFieldToTemplate(
    transaction: Prisma.TransactionClient,
    templateId: string,
    clinicId: string,
    fields: CustomFieldDto[],
  ) {
    const assignedFieldIds = new Set<string>();

    for (const field of fields) {
      const data = {
        name: field.name,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        options: field.options ?? [],
        sortOrder: field.sortOrder,
        step: field.step,
        unit: field.unit,
        helpText: field.helpText,
        placeholder: field.placeholder,
        minValue: field.minValue,
        maxValue: field.maxValue,
        isActive: true,
        templateId,
      };

      const existingField = field.id
        ? await transaction.customField.findFirst({
            where: { id: field.id, template: { clinicId } },
          })
        : await transaction.customField.findFirst({
            where: {
              name: { equals: field.name, mode: 'insensitive' },
              template: { clinicId },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });

      if (field.id && !existingField) {
        throw new NotFoundException('Campo no encontrado');
      }

      const assignedField = existingField
        ? await transaction.customField.update({ where: { id: existingField.id }, data })
        : await transaction.customField.create({ data });

      if (assignedFieldIds.has(assignedField.id)) {
        throw new BadRequestException('No se puede asignar el mismo campo más de una vez');
      }
      assignedFieldIds.add(assignedField.id);
    }
  }

  async updateTemplate(id: string, dto: UpdateFormTemplateDto, clinicId: string) {
    await this.findTemplate(id, clinicId);
    const template = await this.prisma.formTemplate.update({ where: { id }, data: dto });
    return { status: true, message: 'Plantilla actualizada exitosamente', data: template };
  }

  async deactivateTemplate(id: string, clinicId: string) {
    await this.findTemplate(id, clinicId);
    const template = await this.prisma.formTemplate.update({ where: { id }, data: { isActive: false } });
    return { status: true, message: 'Plantilla desactivada exitosamente', data: template };
  }

  async getFields(clinicId: string, query: CustomFieldListQueryDto) {
    const where = {
      isActive: true,
      template: { clinicId },
      ...(query.templateId ? { templateId: query.templateId } : {}),
      ...(query.step !== undefined ? { step: query.step } : {}),
      ...(query.fieldType ? { fieldType: query.fieldType } : {}),
      ...(query.isRequired !== undefined ? { isRequired: query.isRequired } : {}),
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' as const } } : {}),
    };
    const [fields, total] = await Promise.all([
      this.prisma.customField.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: [{ step: 'asc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.customField.count({ where }),
    ]);
    return toPaginatedResult(fields, total, query.page, query.limit);
  }

  async findOne(id: string, clinicId: string, isActive?: boolean) {
    const field = await this.prisma.customField.findFirst({
      where: { id, template: { clinicId }, ...(isActive === undefined ? {} : { isActive }) },
    });
    if (!field) {
      throw new NotFoundException('Campo no encontrado');
    }
    return field;
  }

  async create(dto: CustomFieldDto, clinicId: string) {
    const template = dto.templateId
      ? await this.findTemplate(dto.templateId, clinicId, true)
      : await this.prisma.formTemplate.upsert({
          where: { clinicId_name: { clinicId, name: 'General' } },
          update: { isActive: true },
          create: { name: 'General', description: 'Campos personalizados generales', clinicId },
        });
    const field = await this.prisma.customField.create({
      data: {
        ...dto,
        options: dto.options ?? [],
        templateId: template.id,
        unit: dto.unit,
        helpText: dto.helpText,
        placeholder: dto.placeholder,
        minValue: dto.minValue,
        maxValue: dto.maxValue,
      },
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

  async reorder(fields: ReorderCustomFieldDto[], clinicId: string) {
    const fieldIds = fields.map(field => field.id);
    if (new Set(fieldIds).size !== fieldIds.length) {
      throw new BadRequestException('No se pueden repetir campos en el reordenamiento');
    }
    const clinicFields = await this.prisma.customField.findMany({
      where: { id: { in: fieldIds }, template: { clinicId } },
      select: { id: true, templateId: true },
    });
    if (clinicFields.length !== fieldIds.length) {
      throw new NotFoundException('Campo no encontrado');
    }
    if (new Set(clinicFields.map(field => field.templateId)).size > 1) {
      throw new BadRequestException('Los campos deben pertenecer a la misma plantilla');
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