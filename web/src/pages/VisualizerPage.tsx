import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  FormControlLabel,
  Paper,
  Slider,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import { api, type Toggles } from "../api/client";

type Log = {
  id: string;
  kind: string;
  level: string;
  message: string;
  createdAt: string;
  meta?: unknown;
};

const levelColor: Record<string, "default" | "success" | "warning" | "error" | "info"> = {
  info: "info",
  success: "success",
  warn: "warning",
  error: "error",
};

declare global {
  interface Window {
    /** Playwright: move all sliders together to peaks, then restore start values. */
    __demoSliderTour?: (opts?: { durationMs?: number }) => Promise<void>;
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

type SliderKeys = "rateLimitPerMinute" | "erpFailPercent" | "holdSeconds" | "holdWarnSeconds";

export function VisualizerPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [toggles, setToggles] = useState<Toggles | null>(null);
  const [stats, setStats] = useState<{
    orders: number;
    synced: number;
    failed: number;
    queued: number;
    erpQueueDepth: number;
  } | null>(null);
  const togglesRef = useRef<Toggles | null>(null);

  const refreshStats = () => api.stats().then(setStats).catch(console.error);

  useEffect(() => {
    togglesRef.current = toggles;
  }, [toggles]);

  useEffect(() => {
    api.toggles().then(setToggles).catch(console.error);
    api.events().then(setLogs).catch(console.error);
    refreshStats();

    const es = new EventSource("/api/admin/events/stream");
    es.addEventListener("log", (ev) => {
      const row = JSON.parse((ev as MessageEvent).data) as Log;
      setLogs((prev) => [...prev.slice(-120), row]);
      refreshStats();
    });
    const poll = setInterval(refreshStats, 4000);
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, []);

  const patch = async (p: Partial<Toggles>) => {
    const next = await api.patchToggles(p);
    setToggles(next);
  };

  // Choreographed multi-slider tour: all move at once → different peaks → home.
  useEffect(() => {
    let cancel = false;
    let raf = 0;

    window.__demoSliderTour = (opts) =>
      new Promise((resolve) => {
        const start = togglesRef.current;
        if (!start) {
          resolve();
          return;
        }

        const startVals: Record<SliderKeys, number> = {
          rateLimitPerMinute: start.rateLimitPerMinute,
          erpFailPercent: start.erpFailPercent,
          holdSeconds: start.holdSeconds,
          holdWarnSeconds: start.holdWarnSeconds,
        };

        // Each slider goes somewhere different (and visible)
        const peakVals: Record<SliderKeys, number> = {
          rateLimitPerMinute: clamp(Math.round(start.rateLimitPerMinute * 0.35), 8, 40),
          erpFailPercent: clamp(start.erpFailPercent + 45, 25, 70),
          holdSeconds: clamp(start.holdSeconds + 70, 90, 160),
          holdWarnSeconds: clamp(Math.round(start.holdWarnSeconds * 0.45), 8, 20),
        };

        const duration = Math.max(1600, opts?.durationMs ?? 2400);
        const holdMs = 500;
        const t0 = performance.now();

        const applyLocal = (u: number, from: Record<SliderKeys, number>, to: Record<SliderKeys, number>) => {
          const p = easeInOut(u);
          setToggles((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              rateLimitPerMinute: Math.round(from.rateLimitPerMinute + (to.rateLimitPerMinute - from.rateLimitPerMinute) * p),
              erpFailPercent: Math.round(from.erpFailPercent + (to.erpFailPercent - from.erpFailPercent) * p),
              holdSeconds: Math.round(from.holdSeconds + (to.holdSeconds - from.holdSeconds) * p),
              holdWarnSeconds: Math.round(
                from.holdWarnSeconds + (to.holdWarnSeconds - from.holdWarnSeconds) * p
              ),
            };
          });
        };

        const phaseOut = (now: number) => {
          if (cancel) {
            resolve();
            return;
          }
          const u = Math.min(1, (now - t0) / duration);
          applyLocal(u, startVals, peakVals);
          if (u < 1) {
            raf = requestAnimationFrame(phaseOut);
          } else {
            // Brief hold at peaks, then commit peak to API once
            void api
              .patchToggles(peakVals)
              .then((next) => {
                if (!cancel) setToggles(next);
              })
              .catch(() => undefined);

            const t1 = performance.now() + holdMs;
            const waitHold = (n: number) => {
              if (cancel) {
                resolve();
                return;
              }
              if (n < t1) {
                raf = requestAnimationFrame(waitHold);
                return;
              }
              const tReturn = performance.now();
              const phaseBack = (n2: number) => {
                if (cancel) {
                  resolve();
                  return;
                }
                const u2 = Math.min(1, (n2 - tReturn) / duration);
                applyLocal(u2, peakVals, startVals);
                if (u2 < 1) {
                  raf = requestAnimationFrame(phaseBack);
                } else {
                  void api
                    .patchToggles(startVals)
                    .then((next) => {
                      if (!cancel) setToggles(next);
                    })
                    .finally(() => resolve());
                }
              };
              raf = requestAnimationFrame(phaseBack);
            };
            raf = requestAnimationFrame(waitHold);
          }
        };

        raf = requestAnimationFrame(phaseOut);
      });

    return () => {
      cancel = true;
      cancelAnimationFrame(raf);
      delete window.__demoSliderTour;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h3" gutterBottom>
          API Visualizer
        </Typography>
        <Typography color="text.secondary">
          Live webhook → inbox → ERP worker. Flip toggles to demo HMAC, async accept, rate limits, and chaos failures.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" },
        }}
      >
        {[
          ["Orders", stats?.orders],
          ["ERP synced", stats?.synced],
          ["ERP failed", stats?.failed],
          ["Queue depth", stats?.erpQueueDepth],
        ].map(([label, value]) => (
          <Paper key={label as string} sx={{ p: 2.5, borderRadius: 3 }} className="glass" elevation={0}>
            <Typography variant="overline" color="text.secondary">
              {label}
            </Typography>
            <Typography variant="h4">{value ?? "—"}</Typography>
          </Paper>
        ))}
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "5fr 7fr" },
        }}
      >
        <Paper sx={{ p: 3, borderRadius: 3 }} className="glass" elevation={0}>
          <Typography variant="h6" gutterBottom>
            Integration toggles
          </Typography>
          {toggles && (
            <Stack spacing={1}>
              {(
                [
                  ["requireHmac", "Require HMAC"],
                  ["asyncProcessing", "Async processing"],
                  ["rateLimitEnabled", "ERP rate limit"],
                  ["idempotencyEnabled", "Idempotency"],
                  ["trustWebhookBody", "Trust webhook body (bad)"],
                  ["reconcilerEnabled", "Reconciler"],
                ] as const
              ).map(([key, label]) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Switch
                      checked={Boolean(toggles[key])}
                      onChange={(_, checked) => patch({ [key]: checked })}
                    />
                  }
                  label={label}
                />
              ))}

              <Typography variant="caption" color="text.secondary">
                Rate limit / min: {toggles.rateLimitPerMinute}
              </Typography>
              <Slider
                data-testid="slider-rate-limit"
                min={5}
                max={120}
                value={toggles.rateLimitPerMinute}
                onChangeCommitted={(_, v) => patch({ rateLimitPerMinute: v as number })}
              />

              <Typography variant="caption" color="text.secondary">
                ERP fail chaos: {toggles.erpFailPercent}%
              </Typography>
              <Slider
                data-testid="slider-erp-chaos"
                min={0}
                max={80}
                value={toggles.erpFailPercent}
                onChangeCommitted={(_, v) => patch({ erpFailPercent: v as number })}
              />

              <Typography variant="caption" color="text.secondary">
                Seat lock window: {toggles.holdSeconds}s
              </Typography>
              <Slider
                data-testid="slider-hold-seconds"
                min={15}
                max={180}
                value={toggles.holdSeconds}
                onChangeCommitted={(_, v) => patch({ holdSeconds: v as number })}
              />

              <Typography variant="caption" color="text.secondary">
                Warn popup at: {toggles.holdWarnSeconds}s left
              </Typography>
              <Slider
                data-testid="slider-hold-warn"
                min={5}
                max={Math.max(10, toggles.holdSeconds - 5)}
                value={toggles.holdWarnSeconds}
                onChangeCommitted={(_, v) => patch({ holdWarnSeconds: v as number })}
              />

              <Button variant="outlined" onClick={() => api.reconcile()}>
                Run reconciler now
              </Button>
            </Stack>
          )}
        </Paper>

        <Paper
          sx={{ p: 2, borderRadius: 3, maxHeight: 560, overflow: "auto" }}
          className="glass"
          elevation={0}
        >
          <Typography variant="h6" gutterBottom>
            Event stream
          </Typography>
          <Stack spacing={1}>
            {logs.length === 0 && (
              <Typography color="text.secondary">Buy a ticket to see the pipeline light up.</Typography>
            )}
            {[...logs].reverse().map((l) => (
              <Box
                key={l.id}
                className="log-row"
                sx={{
                  display: "flex",
                  gap: 1,
                  alignItems: "flex-start",
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  pb: 0.75,
                }}
              >
                <Chip size="small" label={l.kind} color={levelColor[l.level] ?? "default"} />
                <Box flex={1}>
                  <div>{l.message}</div>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(l.createdAt).toLocaleTimeString()}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </Stack>
  );
}
