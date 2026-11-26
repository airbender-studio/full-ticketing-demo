import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api, type Seat, type TicketPreview, type Venue } from "../api/client";
import { SeatMap3D, layoutForSlug } from "../components/SeatMap3D";
import { TicketPhone } from "../components/TicketPhone";

function formatRemain(ms: number) {
  // floor = stable seconds (ceil flickers 1:01 ↔ 1:00 near boundaries)
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const as = [...a].sort();
  const bs = [...b].sort();
  return as.every((id, i) => id === bs[i]);
}

export function VenuePage() {
  const { slug = "" } = useParams();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [event, setEvent] = useState<Venue["events"][0] | null>(null);
  const [seats, setSeats] = useState<Seat[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [email, setEmail] = useState("patron@example.com");
  const [busy, setBusy] = useState(false);
  const [locking, setLocking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [holdUntil, setHoldUntil] = useState<number | null>(null);
  const [holdSeconds, setHoldSeconds] = useState(60);
  const [holdWarnSeconds, setHoldWarnSeconds] = useState(30);
  const [now, setNow] = useState(Date.now());
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnAck, setWarnAck] = useState(false);
  const [ticket, setTicket] = useState<TicketPreview | null>(null);
  const lockedIds = useRef<string[]>([]);
  const holdTokenRef = useRef<string | null>(null);
  const holdTimer = useRef<number | null>(null);

  const load = async () => {
    const data = await api.venueSeats(slug);
    setVenue(data.venue);
    setEvent(data.event);
    setSeats(data.seats);
  };

  useEffect(() => {
    api.holdConfig().then((c) => {
      setHoldSeconds(c.holdSeconds);
      setHoldWarnSeconds(c.holdWarnSeconds);
    });
    load().catch((e) => setErr(String(e.message ?? e)));
  }, [slug]);

  useEffect(() => {
    // 1s tick — matches displayed seconds, no sub-second jitter
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingMs = holdUntil ? holdUntil - now : 0;
  const locked = Boolean(holdUntil && remainingMs > 0 && selected.length > 0);
  const eventId = event?.id;

  const expireHold = useCallback(async () => {
    if (eventId && lockedIds.current.length) {
      await api.release(eventId, lockedIds.current).catch(() => undefined);
    }
    lockedIds.current = [];
    holdTokenRef.current = null;
    setSelected([]);
    setHoldUntil(null);
    setWarnOpen(false);
    setErr("Seat lock expired — seats are available again.");
    await load();
  }, [eventId]);

  useEffect(() => {
    if (!locked) {
      setWarnOpen(false);
      setWarnAck(false);
      return;
    }
    if (remainingMs <= holdWarnSeconds * 1000 && !warnAck) {
      setWarnOpen(true);
    }
    if (remainingMs <= 0) {
      void expireHold();
    }
  }, [remainingMs, locked, holdWarnSeconds, warnAck, expireHold]);

  const applyHold = useCallback(
    async (ids: string[]) => {
      if (!eventId) return;

      // Already locked exactly these seats — do NOT refresh (that resets the clock)
      if (ids.length > 0 && sameIds(ids, lockedIds.current) && holdUntil && holdUntil > Date.now()) {
        return;
      }

      if (ids.length === 0) {
        if (lockedIds.current.length) {
          await api.release(eventId, lockedIds.current).catch(() => undefined);
        }
        lockedIds.current = [];
        holdTokenRef.current = null;
        setHoldUntil(null);
        await load();
        return;
      }

      setLocking(true);
      setErr(null);
      try {
        const prev = lockedIds.current;
        if (prev.length && !sameIds(prev, ids)) {
          await api.release(eventId, prev).catch(() => undefined);
          holdTokenRef.current = null;
        }

        const result = await api.hold(eventId, ids, false);
        lockedIds.current = ids;
        holdTokenRef.current = result.holdToken;
        setHoldUntil(new Date(result.holdUntil).getTime());
        setHoldSeconds(result.holdSeconds);
        setHoldWarnSeconds(result.holdWarnSeconds);
        setWarnAck(false);
        setNow(Date.now());
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not lock seats");
        setSelected([]);
        lockedIds.current = [];
        holdTokenRef.current = null;
        setHoldUntil(null);
        await load();
      } finally {
        setLocking(false);
      }
    },
    [eventId, holdUntil]
  );

  // Debounced lock only when the seat selection changes
  useEffect(() => {
    if (!eventId) return;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      void applyHold(selected);
    }, 350);
    return () => {
      if (holdTimer.current) window.clearTimeout(holdTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only selection / eventId
  }, [selected, eventId]);

  const selectedSeats = useMemo(
    () => seats.filter((s) => selected.includes(s.id)),
    [seats, selected]
  );

  const total = event ? selected.length * event.priceCents : 0;
  const progress =
    holdUntil && holdSeconds
      ? Math.min(100, Math.max(0, (remainingMs / (holdSeconds * 1000)) * 100))
      : 0;

  const toggle = (id: string) => {
    const seat = seats.find((s) => s.id === id);
    if (!seat || seat.status === "SOLD") return;
    // allow selecting AVAILABLE, or HELD that we already own
    if (seat.status === "HELD" && !selected.includes(id) && !lockedIds.current.includes(id)) {
      return;
    }
    setTicket(null);
    setMsg(null);
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  };

  const buy = async () => {
    if (!event || selected.length === 0 || !locked || !holdTokenRef.current) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const order = await api.checkout(event.id, selected, email, holdTokenRef.current);
      setTicket(order.ticket);
      setMsg(`Tickets ready — order ${order.id.slice(-8)}`);
      lockedIds.current = [];
      holdTokenRef.current = null;
      setSelected([]);
      setHoldUntil(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Checkout failed");
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!venue || !event) {
    return (
      <Stack alignItems="center" py={8}>
        <CircularProgress />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Chip label={venue.city} sx={{ mb: 1.5 }} />
        <Typography variant="h3">{venue.name}</Typography>
        <Typography color="text.secondary">
          {event.title} · {new Date(event.startsAt).toLocaleString()} · $
          {(event.priceCents / 100).toFixed(0)} / seat
        </Typography>
      </Box>

      {locked && (
        <Box data-testid="hold-timer" className="glass" sx={{ p: 2, borderRadius: 3 }}>
          <Stack direction="row" justifyContent="space-between" mb={1}>
            <Typography fontWeight={700}>Seats locked for you</Typography>
            <Typography
              fontWeight={800}
              color={remainingMs <= holdWarnSeconds * 1000 ? "error.main" : "primary.main"}
              data-testid="hold-countdown"
            >
              {formatRemain(remainingMs)}
            </Typography>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={progress}
            color={remainingMs <= holdWarnSeconds * 1000 ? "error" : "primary"}
            sx={{ height: 8, borderRadius: 99 }}
          />
          <Typography variant="caption" color="text.secondary">
            Complete checkout before the timer hits zero or these seats open back up.
          </Typography>
        </Box>
      )}

      <SeatMap3D
        seats={seats}
        selected={selected}
        onToggle={toggle}
        rows={venue.rows}
        cols={venue.cols}
        layout={layoutForSlug(venue.slug)}
      />

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap flexGrow={1}>
          <Chip size="small" label="Available" color="primary" />
          <Chip size="small" label="Selected / locked" color="secondary" />
          <Chip size="small" label="Sold" />
          <Chip
            size="small"
            variant="outlined"
            label="Quick pick 2"
            data-testid="quick-pick"
            onClick={() => {
              const picks = seats
                .filter((s) => s.status === "AVAILABLE")
                .slice(0, 2)
                .map((s) => s.id);
              setTicket(null);
              setSelected(picks);
            }}
          />
          {locking && <Chip size="small" label="Locking…" />}
          {selectedSeats.map((s) => (
            <Chip key={s.id} label={s.label} onDelete={() => toggle(s.id)} />
          ))}
        </Stack>
        <TextField
          size="small"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          sx={{ minWidth: 240 }}
          inputProps={{ "data-testid": "email" }}
        />
        <Button
          variant="contained"
          disabled={busy || !locked || selected.length === 0}
          onClick={buy}
          size="large"
          data-testid="buy"
        >
          {busy ? "Processing…" : `Buy ${selected.length || ""} · $${(total / 100).toFixed(2)}`}
        </Button>
      </Stack>

      {msg && (
        <Alert severity="success" data-testid="checkout-success">
          {msg}
        </Alert>
      )}
      {err && <Alert severity="error" data-testid="checkout-error">{err}</Alert>}

      <Dialog
        open={Boolean(ticket)}
        onClose={() => setTicket(null)}
        maxWidth="xs"
        fullWidth
        data-testid="ticket-preview"
        PaperProps={{
          sx: {
            maxHeight: "92vh",
            m: 1.5,
          },
        }}
      >
        <DialogTitle sx={{ pb: 0.5 }}>Tickets ready</DialogTitle>
        <DialogContent
          sx={{
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pt: 1,
            pb: 0,
          }}
        >
          <Typography color="text.secondary" mb={1} textAlign="center" fontSize={14}>
            Phone wallet preview — what the patron sees after checkout.
          </Typography>
          {/* Scale phone to fit modal frame (layout box matches visual size) */}
          <Box
            sx={{
              width: 320 * 0.72,
              height: 680 * 0.72,
              display: "flex",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            <Box sx={{ transform: "scale(0.72)", transformOrigin: "top center" }}>
              {ticket && <TicketPhone ticket={ticket} />}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ pt: 0.5 }}>
          <Button onClick={() => setTicket(null)} data-testid="ticket-dismiss">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={warnOpen} onClose={() => { setWarnOpen(false); setWarnAck(true); }}>
        <DialogTitle>Hurry — {formatRemain(remainingMs)} left</DialogTitle>
        <DialogContent>
          <Typography>
            Your seat lock expires in under {holdWarnSeconds} seconds. Finish checkout now or the
            seats go back on sale.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setWarnOpen(false);
              setWarnAck(true);
            }}
            data-testid="warn-dismiss"
          >
            Keep going
          </Button>
          <Button variant="contained" onClick={buy} disabled={busy || !locked}>
            Buy now
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
