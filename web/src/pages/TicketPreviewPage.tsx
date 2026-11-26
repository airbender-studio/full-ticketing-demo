import { Box, Button, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { TicketPhone } from "../components/TicketPhone";
import { useBranding } from "../theme/BrandingProvider";
import type { TicketPreview } from "../api/client";

const SAMPLE: TicketPreview = {
  orderId: "demo_ticket_preview",
  email: "patron@example.com",
  totalCents: 9000,
  currency: "USD",
  eventTitle: "Night Songs",
  venueName: "Bluebox Studio",
  venueCity: "Brooklyn",
  startsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
  seats: [
    { label: "C4", section: "Orchestra" },
    { label: "C5", section: "Orchestra" },
  ],
  code: "BX9K2M",
};

export function TicketPreviewPage() {
  const { branding } = useBranding();

  return (
    <Stack spacing={2.5} alignItems="center">
      <Box textAlign="center" maxWidth={480}>
        <Typography variant="h3" gutterBottom sx={{ letterSpacing: "-0.03em" }}>
          Ticket on phone
        </Typography>
        <Typography color="text.secondary">
          Wallet pass preview for {branding.brandName}. No email provider — this is what lands on the phone after checkout.
        </Typography>
      </Box>

      <TicketPhone ticket={SAMPLE} />

      <Button component={RouterLink} to="/venues/studio-100" variant="contained">
        Buy a real seat to generate yours
      </Button>
    </Stack>
  );
}
