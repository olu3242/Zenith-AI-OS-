export type Success<T> = { success: true; data: T; metadata?: Record<string, unknown> };
export type Failure = { success: false; error: string; code: string; details?: unknown };
export type Result<T> = Success<T> | Failure;
export const ok = <T>(data: T, metadata?: Record<string, unknown>): Success<T> => ({ success: true, data, metadata });
export const fail = (error: string, code: string, details?: unknown): Failure => ({ success: false, error, code, details });
export const isOk = <T>(r: Result<T>): r is Success<T> => r.success === true;
export const isFail = <T>(r: Result<T>): r is Failure => r.success === false;
