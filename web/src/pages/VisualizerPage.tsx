import { useEffect, useState } from "react";
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

  const refreshStats = () => api.stats().then(setStats).catch(console.error);

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
                min={5}
                max={120}
                value={toggles.rateLimitPerMinute}
                onChangeCommitted={(_, v) => patch({ rateLimitPerMinute: v as number })}
              />

              <Typography variant="caption" color="text.secondary">
                ERP fail chaos: {toggles.erpFailPercent}%
              </Typography>
              <Slider
                min={0}
                max={80}
                value={toggles.erpFailPercent}
                onChangeCommitted={(_, v) => patch({ erpFailPercent: v as number })}
              />

              <Typography variant="caption" color="text.secondary">
                Seat lock window: {toggles.holdSeconds}s
              </Typography>
              <Slider
                min={15}
                max={180}
                value={toggles.holdSeconds}
                onChangeCommitted={(_, v) => patch({ holdSeconds: v as number })}
              />

              <Typography variant="caption" color="text.secondary">
                Warn popup at: {toggles.holdWarnSeconds}s left
              </Typography>
              <Slider
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
