import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { api, type Branding, type ClientBrand } from "../api/client";
import { useBranding } from "../theme/BrandingProvider";

const FONTS: Array<{ id: Branding["font"]; label: string; sample: string }> = [
  { id: "dm-sans", label: "DM Sans", sample: "Clean geometric sans" },
  { id: "space-grotesk", label: "Space Grotesk", sample: "Techy display sans" },
  { id: "source-serif", label: "Source Serif", sample: "Editorial serif" },
];

export function BrandingPage() {
  const { branding, setBranding } = useBranding();
  const [draft, setDraft] = useState<Branding>(branding);
  const [clients, setClients] = useState<ClientBrand[]>([]);
  const [activeSlug, setActiveSlug] = useState("bluebox");
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setDraft(branding);
  }, [branding]);

  useEffect(() => {
    api.clients().then((r) => {
      setClients(r.clients);
      setActiveSlug(r.activeSlug);
    });
  }, []);

  const patch = (p: Partial<Branding>) => setDraft((d) => ({ ...d, ...p }));

  const activate = async (slug: string) => {
    const result = await api.activateClient(slug);
    setBranding(result.branding);
    setDraft(result.branding);
    setActiveSlug(slug);
  };

  const save = async () => {
    setErr(null);
    try {
      const next = await api.patchBranding(draft);
      setBranding(next);
      setDraft(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <Stack spacing={3} maxWidth={760}>
      <Box>
        <Typography variant="h3" gutterBottom>
          White-label branding
        </Typography>
        <Typography color="text.secondary">
          Two demo clients share the same venues with different skins. Switch client, tweak colors/fonts, save.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        }}
      >
        {clients.map((c) => (
          <Box
            key={c.slug}
            className="glass"
            data-testid={`client-card-${c.slug}`}
            onClick={() => void activate(c.slug)}
            sx={{
              p: 2.5,
              borderRadius: 3,
              cursor: "pointer",
              border: activeSlug === c.slug ? "2px solid" : "1px solid",
              borderColor: activeSlug === c.slug ? "primary.main" : "divider",
              background: `linear-gradient(135deg, ${c.branding.primary}33, ${c.branding.secondary}22)`,
            }}
          >
            <Typography variant="h6">{c.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              {c.tagline}
            </Typography>
            <Typography variant="caption" display="block" mt={1}>
              {c.branding.mode} · {c.branding.font}
            </Typography>
          </Box>
        ))}
      </Box>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Box className="glass" sx={{ p: 3, borderRadius: 4 }}>
          <Stack spacing={2.5}>
            <TextField
              label="Brand name"
              value={draft.brandName}
              onChange={(e) => patch({ brandName: e.target.value })}
              fullWidth
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Box flex={1}>
                <Typography variant="subtitle2" gutterBottom>
                  Primary
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    component="input"
                    type="color"
                    value={draft.primary}
                    onChange={(e) => patch({ primary: (e.target as HTMLInputElement).value })}
                    sx={{ width: 56, height: 40, border: 0, bgcolor: "transparent", cursor: "pointer" }}
                  />
                  <TextField
                    size="small"
                    value={draft.primary}
                    onChange={(e) => patch({ primary: e.target.value })}
                    fullWidth
                  />
                </Stack>
              </Box>
              <Box flex={1}>
                <Typography variant="subtitle2" gutterBottom>
                  Secondary
                </Typography>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Box
                    component="input"
                    type="color"
                    value={draft.secondary}
                    onChange={(e) => patch({ secondary: (e.target as HTMLInputElement).value })}
                    sx={{ width: 56, height: 40, border: 0, bgcolor: "transparent", cursor: "pointer" }}
                  />
                  <TextField
                    size="small"
                    value={draft.secondary}
                    onChange={(e) => patch({ secondary: e.target.value })}
                    fullWidth
                  />
                </Stack>
              </Box>
            </Stack>

            <FormControl fullWidth>
              <InputLabel id="font-label">Font</InputLabel>
              <Select
                labelId="font-label"
                label="Font"
                value={draft.font}
                onChange={(e) => patch({ font: e.target.value as Branding["font"] })}
              >
                {FONTS.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {f.label} — {f.sample}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControlLabel
              control={
                <Switch
                  checked={draft.mode === "dark"}
                  onChange={(_, checked) => patch({ mode: checked ? "dark" : "light" })}
                />
              }
              label="Dark mode"
            />

            <Box
              sx={{
                p: 2.5,
                borderRadius: 3,
                border: "1px solid",
                borderColor: "divider",
                background: `linear-gradient(135deg, ${draft.primary}, ${draft.secondary})`,
                color: "#fff",
              }}
            >
              <Typography variant="h5">{draft.brandName}</Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Preview strip — venue cards and seat highlights use these colors.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5}>
              <Button variant="contained" onClick={save}>
                Save branding
              </Button>
              <Button variant="outlined" onClick={() => void activate("bluebox")}>
                Reset to Bluebox Arts
              </Button>
            </Stack>

            {saved && <Alert severity="success">Branding saved</Alert>}
            {err && <Alert severity="error">{err}</Alert>}
          </Stack>
        </Box>
      </motion.div>
    </Stack>
  );
}
