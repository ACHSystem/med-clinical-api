export interface WriteResponse<T> {
  status: true;
  message: string;
  data: T;
}

export interface DetailResponse<T> {
  data: T;
}

export function writeResponse<T>(message: string, data: T): WriteResponse<T> {
  return { status: true, message, data };
}

export function detailResponse<T>(data: T): DetailResponse<T> {
  return { data };
}
