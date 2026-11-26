import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { api, type MappingRecipe } from "../api/client";

type Preview = {
  client: { slug: string; name: string; style: string; label: string };
  recipe: MappingRecipe;
  canonical: unknown;
  mapped: unknown;
};

function JsonPanel({
  title,
  subtitle,
  value,
  testId,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  value: unknown;
  testId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Box
      className="glass"
      data-testid={testId}
      sx={{ borderRadius: 3, overflow: "hidden" }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.25, cursor: "pointer" }}
        onClick={() => setOpen((o) => !o)}
        data-testid={`${testId}-toggle`}
      >
        <Box>
          <Typography variant="subtitle2">{title}</Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton size="small" aria-label={open ? "Collapse" : "Expand"}>
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Box
          component="pre"
          data-testid={`${testId}-body`}
          sx={{
            m: 0,
            px: 2,
            pb: 2,
            maxHeight: 440,
            overflow: "auto",
            fontSize: 12,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            borderTop: "1px solid",
            borderColor: "divider",
            pt: 1.5,
          }}
        >
          {JSON.stringify(value, null, 2)}
        </Box>
      </Collapse>
    </Box>
  );
}

export function MappingPage() {
  const { slug = "bluebox" } = useParams();
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    api.mappingPreview(slug).then(setPreview).catch(console.error);
  }, [slug]);

  if (!preview) {
    return (
      <Stack alignItems="center" py={8}>
        <CircularProgress />
      </Stack>
    );
  }

  const { client, recipe, canonical, mapped } = preview;
  const clean = client.style === "clean";

  return (
    <Stack spacing={3} data-testid="mapping-page">
      <Box>
        <Stack direction="row" spacing={1} mb={1.5} flexWrap="wrap" useFlexGap>
          <Chip label={client.name} />
          <Chip
            color={clean ? "success" : "warning"}
            label={clean ? "Clean recipe" : "Legacy recipe"}
          />
          <Chip variant="outlined" label="payload_config gloss" />
        </Stack>
        <Typography variant="h3" gutterBottom>
          Payload mapping
        </Typography>
        <Typography color="text.secondary" maxWidth={680}>
          Same SOS-style idea: one canonical sale, per-client{" "}
          <code>payload_config</code> recipe — field paths + transforms + statics —
          no hardcoded forks in the ERP worker. Bluebox maps clean; Harbor needs the
          messy legacy shape.
        </Typography>
      </Box>

      <Stack direction="row" spacing={1}>
        <Button
          component={RouterLink}
          to="/customers/bluebox/mapping"
          variant={slug === "bluebox" ? "contained" : "outlined"}
          size="small"
          data-testid="mapping-tab-bluebox"
        >
          Bluebox (clean)
        </Button>
        <Button
          component={RouterLink}
          to="/customers/harbor/mapping"
          variant={slug === "harbor" ? "contained" : "outlined"}
          size="small"
          data-testid="mapping-tab-harbor"
        >
          Harbor (legacy)
        </Button>
      </Stack>

      {/* Flow strip — before → recipe → after */}
      <Box
        className="glass"
        data-testid="mapping-flow"
        sx={{
          p: 2.5,
          borderRadius: 3,
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "1fr auto 1fr auto 1fr" },
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="overline" color="text.secondary">
            Incoming
          </Typography>
          <Typography fontWeight={700}>Canonical sale</Typography>
          <Typography variant="body2" color="text.secondary">
            vivenu-shaped DTO after checkout
          </Typography>
        </Box>
        <Typography color="primary.main" sx={{ display: { xs: "none", md: "block" } }}>
          →
        </Typography>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Recipe
          </Typography>
          <Typography fontWeight={700}>{recipe.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {recipe.fields.length} fields · {recipe.static.length} static
          </Typography>
        </Box>
        <Typography color="primary.main" sx={{ display: { xs: "none", md: "block" } }}>
          →
        </Typography>
        <Box>
          <Typography variant="overline" color="text.secondary">
            Outgoing
          </Typography>
          <Typography fontWeight={700}>{client.label}</Typography>
          <Typography variant="body2" color="text.secondary">
            {clean ? "Modern finance JSON" : "Legacy Batch.Txn shape"}
          </Typography>
        </Box>
      </Box>

      <Box className="glass" sx={{ p: 2, borderRadius: 3, overflow: "auto" }} data-testid="mapping-recipe">
        <Typography variant="subtitle2" gutterBottom>
          Recipe steps (source → target)
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Source (canonical)</TableCell>
              <TableCell>Target (ERP)</TableCell>
              <TableCell>Transform</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recipe.fields.map((f) => (
              <TableRow key={`${f.source}-${f.target}`}>
                <TableCell>
                  <code>{f.source}</code>
                </TableCell>
                <TableCell>
                  <code>{f.target}</code>
                </TableCell>
                <TableCell>
                  {f.transform ? <Chip size="small" label={f.transform} /> : "—"}
                </TableCell>
              </TableRow>
            ))}
            {recipe.static.map((s) => (
              <TableRow key={s.target}>
                <TableCell>
                  <em>static</em>
                </TableCell>
                <TableCell>
                  <code>{s.target}</code>
                </TableCell>
                <TableCell>
                  <code>{JSON.stringify(s.value)}</code>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Typography variant="h6">JSON transformation</Typography>
      <Typography color="text.secondary" sx={{ mt: -1 }}>
        Expand either panel — same sample sale, two destination shapes.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <JsonPanel
          title="Before — canonical (vivenu-shaped)"
          subtitle="Sample incoming sale payload"
          value={canonical}
          testId="mapping-json-before"
          defaultOpen
        />
        <JsonPanel
          title={`After — mapped → ${client.label}`}
          subtitle={clean ? "Clean modern ERP body" : "Legacy nested Batch.Txn"}
          value={mapped}
          testId="mapping-json-after"
          defaultOpen
        />
      </Box>

      <Button component={RouterLink} to={`/customers/${slug}`} variant="text">
        Back to profile
      </Button>
    </Stack>
  );
}
