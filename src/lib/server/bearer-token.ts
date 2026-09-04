export type BearerHeader =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "valid"; token: string };

export function parseBearerHeader(header: string | null): BearerHeader {
  if (header === null) return { kind: "absent" };
  if (header.length > 32_775 || header.includes(",")) return { kind: "invalid" };
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  return match ? { kind: "valid", token: match[1] } : { kind: "invalid" };
}

export function bearerClientOptions(token: string) {
  return {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  } as const;
}
