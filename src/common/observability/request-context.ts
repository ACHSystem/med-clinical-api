import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export interface RequestContext {
  requestId: string;
  ip?: string;
  method?: string;
  path?: string;
  userId?: string;
  clinicId?: string;
  role?: string;
  metricsRecorded?: boolean;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  res.setHeader('x-request-id', requestId);

  requestContextStorage.run(
    {
      requestId,
      ip: req.ip,
      method: req.method,
      path: req.originalUrl?.split('?')[0] ?? req.url,
    },
    next,
  );
}

@Injectable()
export class RequestContextService {
  get(): RequestContext | undefined {
    return requestContextStorage.getStore();
  }

  setUser(user: { userId: string; clinicId: string; role: string }): void {
    const context = this.get();

    if (!context) {
      return;
    }

    context.userId = user.userId;
    context.clinicId = user.clinicId;
    context.role = user.role;
  }

  get requestId(): string | undefined {
    return this.get()?.requestId;
  }
}
