import { useEffect, useState } from "react";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { motion } from "framer-motion";
import { api, type CustomerProfile } from "../api/client";
import { useBranding } from "../theme/BrandingProvider";

export function CustomersPage() {
  const { setBranding } = useBranding();
  const [activeSlug, setActiveSlug] = useState("bluebox");
  const [clients, setClients] = useState<CustomerProfile[]>([]);

  useEffect(() => {
    api.clients().then((r) => {
      setClients(r.clients);
      setActiveSlug(r.activeSlug);
    });
  }, []);

  const activate = async (slug: string) => {
    const r = await api.activateClient(slug);
    setBranding(r.branding);
    setActiveSlug(slug);
  };

  return (
    <Stack spacing={4}>
      <Box>
        <Chip label="Integration customers" color="primary" variant="outlined" sx={{ mb: 2 }} />
        <Typography variant="h3" gutterBottom>
          Customer profiles
        </Typography>
        <Typography color="text.secondary" maxWidth={640}>
          Two real-feeling finance customers on the same vivenu bridge. One maps cleanly. The other
          needs a payload recipe — same SOS-style mapping engine idea, glossed for the demo.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        {clients.map((c, i) => (
          <motion.div
            key={c.slug}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Box
              className="glass"
              data-testid={`customer-${c.slug}`}
              sx={{
                p: 3,
                borderRadius: 4,
                height: "100%",
                border: activeSlug === c.slug ? "2px solid" : "1px solid",
                borderColor: activeSlug === c.slug ? "primary.main" : "divider",
                background: `linear-gradient(160deg, ${c.branding.primary}22, transparent 55%)`,
                display: "flex",
                flexDirection: "column",
                gap: 1.5,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Chip
                  size="small"
                  color={c.mapping.style === "clean" ? "success" : "warning"}
                  label={c.mapping.style === "clean" ? "Clean map" : "Legacy / messy"}
                />
                {activeSlug === c.slug && <Chip size="small" label="Active" color="primary" />}
              </Stack>
              <Typography variant="h4">{c.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {c.story.industry} · {c.story.hq}
              </Typography>
              <Typography sx={{ flexGrow: 1 }}>{c.story.summary}</Typography>
              <Typography variant="caption" color="text.secondary">
                ERP: {c.story.erpName}
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} mt={1}>
                <Button
                  variant={activeSlug === c.slug ? "outlined" : "contained"}
                  onClick={() => void activate(c.slug)}
                >
                  {activeSlug === c.slug ? "Active skin" : "Activate"}
                </Button>
                <Button component={RouterLink} to={`/customers/${c.slug}`} variant="text">
                  Profile
                </Button>
                <Button component={RouterLink} to={`/customers/${c.slug}/mapping`} variant="text">
                  JSON mapping
                </Button>
              </Stack>
            </Box>
          </motion.div>
        ))}
      </Box>
    </Stack>
  );
}
