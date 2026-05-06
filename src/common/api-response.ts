import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiResponse<T> {
  constructor(private prisma: PrismaService) {}

  static success<T>(message: string, data?: T): { status: boolean; message: string; data?: T } {
    return {
      status: true,
      message,
      data,
    };
  }

  static error(message: string): { status: boolean; message: string; data: null } {
    return {
      status: false,
      message,
      data: null,
    };
  }

  static notFound(message: string = 'Elemento no encontrado'): { status: boolean; message: string; data: null } {
    return this.error(message);
  }

  static unauthorized(message: string = 'No autorizado'): { status: boolean; message: string; data: null } {
    return this.error(message);
  }

  static badRequest(message: string): { status: boolean; message: string; data: null } {
    return this.error(message);
  }
}