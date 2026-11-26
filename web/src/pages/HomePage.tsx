import { useEffect, useState } from "react";
import { Box, Button, Chip, Skeleton, Stack, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Link as RouterLink } from "react-router-dom";
import { api, type Venue } from "../api/client";
import { useBranding } from "../theme/BrandingProvider";

export function HomePage() {
  const { branding } = useBranding();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    api.venues().then(setVenues).catch(console.error);
  }, []);

  return (
    <Stack spacing={4}>
      <Box>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Chip label="Performing arts · live inventory" color="primary" variant="outlined" sx={{ mb: 2 }} />
          <Typography variant="h2" sx={{ maxWidth: 720, mb: 1.5 }}>
            {branding.brandName}
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 560, fontSize: 18 }}>
            Pick a house, choose seats on a live 3D map, and watch every sale hit the ERP pipeline —
            HMAC, queue, rate limits, and idempotency included.
          </Typography>
        </motion.div>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" },
        }}
      >
        {!venues &&
          [0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={280} sx={{ borderRadius: 4 }} />)}
        {venues?.map((v, i) => {
          const event = v.events[0];
          return (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              <Box
                className="glass"
                sx={{
                  p: 3,
                  borderRadius: 4,
                  height: "100%",
                  minHeight: 280,
                  display: "flex",
                  flexDirection: "column",
                  background: `linear-gradient(160deg, color-mix(in srgb, ${v.accent} 22%, transparent), transparent 58%)`,
                }}
              >
<Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                    <Stack direction="row" spacing={0.75}>
                      <Chip size="small" label={`${v.capacity} seats`} color="primary" />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          v.slug === "arena-1000"
                            ? "Oval bowl"
                            : v.slug === "hall-500"
                              ? "Theater rake"
                              : "Square grid"
                        }
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {v.city}
                    </Typography>
                  </Stack>
                <Typography variant="h4" sx={{ mb: 1 }}>
                  {v.name}
                </Typography>
                <Typography color="text.secondary" sx={{ flexGrow: 1, mb: 2 }}>
                  {v.description}
                </Typography>
                {event && (
                  <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>
                    {event.title} · ${(event.priceCents / 100).toFixed(0)}
                    {v.availableSeats != null && ` · ${v.availableSeats} open`}
                  </Typography>
                )}
                <Button component={RouterLink} to={`/venues/${v.slug}`} variant="contained" fullWidth>
                  View seat map
                </Button>
              </Box>
            </motion.div>
          );
        })}
      </Box>
    </Stack>
  );
}
