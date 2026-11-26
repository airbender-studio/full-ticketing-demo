import crypto from "crypto";

export type HoldSession = {
  token: string;
  eventId: string;
  seatIds: string[];
  emailHint?: string;
  expiresAt: number;
};

const sessions = new Map<string, HoldSession>();

export function createHoldSession(opts: {
  eventId: string;
  seatIds: string[];
  ttlMs: number;
  emailHint?: string;
}): HoldSession {
  const token = crypto.randomBytes(24).toString("hex");
  const session: HoldSession = {
    token,
    eventId: opts.eventId,
    seatIds: [...opts.seatIds].sort(),
    emailHint: opts.emailHint,
    expiresAt: Date.now() + opts.ttlMs,
  };
  sessions.set(token, session);
  return session;
}

export function getHoldSession(token: string | undefined): HoldSession | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

export function consumeHoldSession(token: string) {
  sessions.delete(token);
}

export function assertHoldOwnsSeats(
  session: HoldSession,
  eventId: string,
  seatIds: string[]
): boolean {
  if (session.eventId !== eventId) return false;
  if (session.seatIds.length !== seatIds.length) return false;
  const wanted = [...seatIds].sort();
  return session.seatIds.every((id, i) => id === wanted[i]);
}

/** Test helper */
export function resetHoldSessions() {
  sessions.clear();
}
