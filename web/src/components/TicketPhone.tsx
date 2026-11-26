import { Box, Stack, Typography } from "@mui/material";
import type { TicketPreview } from "../api/client";
import { useBranding } from "../theme/BrandingProvider";

function FakeQr({ seed, color }: { seed: string; color: string }) {
  // Deterministic mini QR-ish grid from ticket code
  const cells: boolean[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < 121; i++) {
    h = (h * 1664525 + 1013904223) >>> 0;
    const r = Math.floor(i / 11);
    const c = i % 11;
    const finder =
      (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
    cells.push(finder || h % 3 !== 0);
  }
  return (
    <Box
      sx={{
        width: 108,
        height: 108,
        display: "grid",
        gridTemplateColumns: "repeat(11, 1fr)",
        gap: "1.5px",
        p: 1,
        bgcolor: "#fff",
        borderRadius: 1.5,
        border: "1px solid #e5e7eb",
      }}
    >
      {cells.map((on, i) => (
        <Box key={i} sx={{ bgcolor: on ? color : "#fff", borderRadius: 0.3 }} />
      ))}
    </Box>
  );
}

export function TicketPhone({ ticket }: { ticket: TicketPreview }) {
  const { branding } = useBranding();
  const starts = new Date(ticket.startsAt);
  const dateLine = starts.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLine = starts.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const seatLine = ticket.seats.map((s) => s.label).join(" · ");

  return (
    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
      {/* Device shell */}
      <Box
        data-testid="ticket-phone"
        sx={{
          width: 320,
          borderRadius: "44px",
          background: "linear-gradient(160deg, #2a2f3a 0%, #0b0d12 40%, #151922 100%)",
          p: "11px",
          boxShadow:
            "0 40px 80px rgba(15,23,42,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
          position: "relative",
        }}
      >
        {/* Side buttons */}
        <Box sx={{ position: "absolute", left: -2, top: 110, width: 3, height: 28, bgcolor: "#3b4150", borderRadius: 1 }} />
        <Box sx={{ position: "absolute", left: -2, top: 150, width: 3, height: 52, bgcolor: "#3b4150", borderRadius: 1 }} />
        <Box sx={{ position: "absolute", right: -2, top: 140, width: 3, height: 64, bgcolor: "#3b4150", borderRadius: 1 }} />

        {/* Screen */}
        <Box
          sx={{
            borderRadius: "34px",
            overflow: "hidden",
            bgcolor: "#07090f",
            minHeight: 640,
            position: "relative",
            backgroundImage: `
              radial-gradient(ellipse at 20% 0%, ${branding.primary}55, transparent 55%),
              radial-gradient(ellipse at 90% 10%, ${branding.secondary}40, transparent 45%),
              linear-gradient(180deg, #121722 0%, #07090f 55%)
            `,
          }}
        >
          {/* Dynamic Island */}
          <Box sx={{ display: "flex", justifyContent: "center", pt: 1.1, pb: 0.5 }}>
            <Box
              sx={{
                width: 96,
                height: 26,
                borderRadius: 99,
                bgcolor: "#000",
                border: "1px solid #1f2430",
              }}
            />
          </Box>

          <Box sx={{ px: 2, pt: 1, pb: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography sx={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>
                WALLET
              </Typography>
              <Box
                sx={{
                  px: 1.1,
                  py: 0.35,
                  borderRadius: 99,
                  bgcolor: "rgba(34,197,94,0.18)",
                  border: "1px solid rgba(34,197,94,0.35)",
                  color: "#86efac",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                }}
              >
                READY
              </Box>
            </Stack>

            {/* Pass card */}
            <Box
              sx={{
                borderRadius: "22px",
                overflow: "hidden",
                bgcolor: "#fff",
                boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
              }}
            >
              <Box
                sx={{
                  background: `linear-gradient(135deg, ${branding.primary} 0%, ${branding.secondary} 100%)`,
                  color: "#fff",
                  px: 2.25,
                  pt: 2.25,
                  pb: 2.5,
                  position: "relative",
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, opacity: 0.85 }}>
                  {branding.brandName.toUpperCase()}
                </Typography>
                <Typography sx={{ mt: 0.8, fontSize: 26, fontWeight: 780, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                  {ticket.eventTitle}
                </Typography>
                <Typography sx={{ mt: 0.8, fontSize: 13, opacity: 0.92 }}>
                  {ticket.venueName}
                </Typography>
                <Typography sx={{ fontSize: 12, opacity: 0.8 }}>{ticket.venueCity}</Typography>
              </Box>

              {/* Ticket stub perforation */}
              <Box
                sx={{
                  position: "relative",
                  height: 18,
                  bgcolor: "#fff",
                  "&::before, &::after": {
                    content: '""',
                    position: "absolute",
                    top: "50%",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    bgcolor: "#07090f",
                    transform: "translateY(-50%)",
                  },
                  "&::before": { left: -9 },
                  "&::after": { right: -9 },
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: 14,
                    right: 14,
                    top: "50%",
                    borderTop: "2px dashed #d1d5db",
                    transform: "translateY(-50%)",
                  }}
                />
              </Box>

              <Box sx={{ px: 2.25, pb: 2.25 }}>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  <Meta label="Date" value={dateLine} />
                  <Meta label="Doors" value={timeLine} />
                  <Meta label="Section" value={ticket.seats[0]?.section ?? "General"} />
                  <Meta label="Seats" value={seatLine} />
                </Box>

                <Stack direction="row" spacing={2} alignItems="center">
                  <FakeQr seed={ticket.code} color={branding.primary} />
                  <Box flex={1}>
                    <Typography sx={{ fontSize: 10, color: "#6b7280", fontWeight: 700, letterSpacing: 0.8 }}>
                      CONFIRMATION
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.4,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: 18,
                        fontWeight: 750,
                        letterSpacing: 1.5,
                        color: "#111827",
                      }}
                    >
                      {ticket.code}
                    </Typography>
                    <Typography sx={{ mt: 1, fontSize: 12, color: "#374151" }}>
                      {ticket.email}
                    </Typography>
                    <Typography sx={{ mt: 0.4, fontSize: 13, fontWeight: 700, color: branding.primary }}>
                      ${(ticket.totalCents / 100).toFixed(2)} {ticket.currency}
                    </Typography>
                  </Box>
                </Stack>

                <Typography
                  sx={{
                    mt: 2,
                    pt: 1.5,
                    borderTop: "1px solid #f3f4f6",
                    fontSize: 10,
                    color: "#9ca3af",
                    textAlign: "center",
                  }}
                >
                  Present QR at entry · demo delivery preview
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Home indicator */}
          <Box sx={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <Box sx={{ width: 108, height: 4, borderRadius: 99, bgcolor: "rgba(255,255,255,0.35)" }} />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.7, color: "#9ca3af" }}>
        {label.toUpperCase()}
      </Typography>
      <Typography sx={{ mt: 0.35, fontSize: 13.5, fontWeight: 650, color: "#111827", lineHeight: 1.25 }}>
        {value}
      </Typography>
    </Box>
  );
}
