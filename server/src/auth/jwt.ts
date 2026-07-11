import jwt, { type SignOptions } from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";

export type PlayerRole = "user" | "admin";

export interface JoinTokenPayload {
  playerId: string;
  displayName: string;
  role: PlayerRole;
  guest: boolean;
  characterId: string;
  shipId: string;
}

export function signJoinToken(payload: JoinTokenPayload, expiresIn: SignOptions["expiresIn"] = "12h"): string {
  return jwt.sign(payload, SECRET, { expiresIn });
}

export function verifyJoinToken(token: string): JoinTokenPayload | null {
  try {
    return jwt.verify(token, SECRET) as JoinTokenPayload;
  } catch {
    return null;
  }
}

export function signGuestToken(displayName = "Guest"): string {
  const playerId = `guest-${Date.now().toString(36)}`;
  return signJoinToken({
    playerId,
    displayName,
    role: "user",
    guest: true,
    characterId: "barbara",
    shipId: "barbara",
  });
}

export function signAdminDevToken(): string {
  return signJoinToken({
    playerId: "admin-dev",
    displayName: "Admin",
    role: "admin",
    guest: false,
    characterId: "barbara",
    shipId: "barbara",
  });
}
