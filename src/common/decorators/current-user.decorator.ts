import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type Roles = 'ADMIN' | 'DOCTOR' | 'ASSISTANT';

export interface CurrentUserData {
    userId: string;
    email: string;
    /** Rol dentro del consultorio activo (NO el de la cuenta). */
    role: Roles;
    /** Consultorio activo: el tenant usado para filtrar todos los datos. */
    clinicId: string;
}

export const CurrentUser = createParamDecorator(
    (data: unknown, ctx: ExecutionContext): CurrentUserData => {
        const request = ctx.switchToHttp().getRequest();
        return request.user;
    },
);
