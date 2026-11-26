import { useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Container,
  MenuItem,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { Link as RouterLink, Outlet, useLocation } from "react-router-dom";
import { api, type ClientBrand } from "../api/client";
import { useBranding } from "../theme/BrandingProvider";

const links = [
  { to: "/", label: "Venues" },
  { to: "/customers", label: "Customers" },
  { to: "/ticket", label: "Ticket" },
  { to: "/visualizer", label: "API Visualizer" },
  { to: "/branding", label: "Branding" },
  { to: "http://localhost:4000/docs", label: "API Docs", external: true },
];

export function Shell() {
  const { branding, setBranding } = useBranding();
  const loc = useLocation();
  const [clients, setClients] = useState<ClientBrand[]>([]);
  const [activeSlug, setActiveSlug] = useState("bluebox");

  useEffect(() => {
    api.clients().then((r) => {
      setClients(r.clients);
      setActiveSlug(r.activeSlug);
    });
  }, [branding.brandName]);

  const switchClient = async (slug: string) => {
    const result = await api.activateClient(slug);
    setBranding(result.branding);
    setActiveSlug(slug);
  };

  return (
    <Box minHeight="100vh" className="hero-grid">
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{
          bgcolor: "color-mix(in srgb, var(--paper) 72%, transparent)",
          backdropFilter: "blur(14px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          color: "text.primary",
        }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Typography
            component={RouterLink}
            to="/"
            variant="h6"
            color="text.primary"
            data-testid="brand-name"
            sx={{ fontWeight: 750, letterSpacing: "-0.03em", mr: { md: 2 } }}
          >
            {branding.brandName}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ display: { xs: "none", md: "flex" }, flexGrow: 1 }}>
            {links.map((l) =>
              l.external ? (
                <Button
                  key={l.to}
                  href={l.to}
                  target="_blank"
                  rel="noreferrer"
                  sx={{ color: "text.secondary" }}
                >
                  {l.label}
                </Button>
              ) : (
                <Button
                  key={l.to}
                  component={RouterLink}
                  to={l.to}
                  sx={{
                    color: loc.pathname === l.to ? "primary.main" : "text.secondary",
                    fontWeight: loc.pathname === l.to ? 700 : 500,
                  }}
                >
                  {l.label}
                </Button>
              )
            )}
          </Stack>
          <TextField
            select
            size="small"
            label="Client"
            value={activeSlug}
            onChange={(e) => void switchClient(e.target.value)}
            sx={{ minWidth: 160 }}
            // Visible Select (combobox) — not inputProps (hidden native input hangs Playwright).
            slotProps={{ select: { "data-testid": "client-switch" } }}
          >
            {clients.map((c) => (
              <MenuItem
                key={c.slug}
                value={c.slug}
                // Explicit click — Select onChange alone is flaky under Playwright headed.
                onClick={() => {
                  if (c.slug !== activeSlug) void switchClient(c.slug);
                }}
              >
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Button component={RouterLink} to="/visualizer" variant="contained" size="small">
            Live pipeline
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
