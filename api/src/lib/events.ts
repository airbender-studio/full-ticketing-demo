import { prisma } from "./prisma.js";

type Listener = (event: LiveEvent) => void;

export type LiveEvent = {
  id: string;
  kind: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
  meta?: Record<string, unknown>;
  createdAt: string;
};

const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function emit(
  kind: string,
  message: string,
  opts: { level?: LiveEvent["level"]; meta?: Record<string, unknown> } = {}
) {
  const level = opts.level ?? "info";
  const row = await prisma.apiEventLog.create({
    data: {
      kind,
      level,
      message,
      meta: opts.meta ?? undefined,
    },
  });

  const event: LiveEvent = {
    id: row.id,
    kind,
    level,
    message,
    meta: (row.meta as Record<string, unknown>) ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };

  for (const fn of listeners) fn(event);
  return event;
}
