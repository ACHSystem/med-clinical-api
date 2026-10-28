import { Injectable } from '@nestjs/common';
import { CurrentUserData } from 'src/common/decorators/current-user.decorator';
import { toPaginatedResult } from 'src/common/pagination';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class UsersService {

    constructor(private prisma: PrismaService) { }

    async getAllUsers(user: CurrentUserData) {
        const where: any = {};
        if (user.role !== 'ADMIN') {
            where.clinicId = user.clinicId;
        }
        try {
            const [users, total] = await Promise.all([
                this.prisma.clinicUser.findMany({
                    where,
                    select: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                lastName: true,
                                email: true,
                                username: true,
                                isActive: true,
                                role: true
                            }
                        }
                    }
                }),
                this.prisma.clinicUser.count({ where })
            ]);
            return toPaginatedResult(users, total, 1, 20);
        } catch (err) {
            throw err;
        }
    }
}
