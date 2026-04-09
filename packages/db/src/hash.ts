import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashSync(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifySync(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(candidate, "hex"),
  );
}
