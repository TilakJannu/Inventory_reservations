export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
};

export type ApiSuccessBody<T> = {
  data: T;
  requestId: string;
};

export class ClientApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, code: string, status: number, requestId?: string) {
    super(message);
    this.name = "ClientApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });

  const payload = (await response.json()) as ApiSuccessBody<T> | ApiErrorBody;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorBody;
    throw new ClientApiError(
      errorPayload.error.message,
      errorPayload.error.code,
      response.status,
      errorPayload.requestId
    );
  }

  return (payload as ApiSuccessBody<T>).data;
}
