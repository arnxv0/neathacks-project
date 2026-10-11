export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8200";

/** A non-2xx answer. `code` and `detail` are set when the API answered `{"detail": {"code", "message"}}` (the targets endpoints). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly detail?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    let code: string | undefined, detail: string | undefined;
    try {
      const d = JSON.parse(text)?.detail;
      if (d && typeof d === "object" && !Array.isArray(d)) { code = typeof d.code === "string" ? d.code : undefined; detail = typeof d.message === "string" ? d.message : undefined; }
      else if (typeof d === "string") detail = d;
    } catch { /* not JSON */ }
    throw new ApiError(`${res.status} ${res.statusText}: ${text}`, res.status, code, detail);
  }
  return res.json() as Promise<T>;
}
export const post = <T,>(path: string, body?: unknown) => api<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
export const del = <T,>(path: string) => api<T>(path, { method: "DELETE" });
