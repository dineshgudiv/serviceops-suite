export type BffResult<T> = {
  ok: boolean;
  data: T | null;
  status: number;
  requestId: string | null;
  rawText: string;
};
