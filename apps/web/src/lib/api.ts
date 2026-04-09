const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface ApiOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function api<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { method = "GET", body, token } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = "";

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { error?: string };
        message = parsed.error ?? raw.trim();
      } catch {
        message = raw.trim();
      }
    }

    throw new Error(message || `Request failed (${res.status})`);
  }

  return res.json();
}
