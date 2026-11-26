import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { api, type MappingRecipe } from "../api/client";

type Preview = {
  client: { slug: string; name: string; style: string; label: string };
  recipe: MappingRecipe;
  canonical: unknown;
  mapped: unknown;
};

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <Box className="glass" sx={{ p: 2, borderRadius: 3, overflow: "auto", maxHeight: 420 }}>
      <Typography variant="subtitle2" gutterBottom>
        {title}
      </Typography>
      <Box
        component="pre"
        sx={{
          m: 0,
          fontSize: 12,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </Box>
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

  return (
    <Stack spacing={3}>
      <Box>
        <Stack direction="row" spacing={1} mb={1.5} flexWrap="wrap" useFlexGap>
          <Chip label={client.name} />
          <Chip
            color={client.style === "clean" ? "success" : "warning"}
            label={client.style === "clean" ? "Clean recipe" : "Legacy recipe"}
          />
        </Stack>
        <Typography variant="h3" gutterBottom>
          Payload mapping
        </Typography>
        <Typography color="text.secondary" maxWidth={640}>
          Gloss for the demo: canonical sale → {recipe.label}. Same idea as config-driven{" "}
          <code>payload_config</code> — no hardcoded client forks in the worker.
        </Typography>
      </Box>

      <Stack direction="row" spacing={1}>
        <Button
          component={RouterLink}
          to="/customers/bluebox/mapping"
          variant={slug === "bluebox" ? "contained" : "outlined"}
          size="small"
        >
          Bluebox (clean)
        </Button>
        <Button
          component={RouterLink}
          to="/customers/harbor/mapping"
          variant={slug === "harbor" ? "contained" : "outlined"}
          size="small"
        >
          Harbor (legacy)
        </Button>
      </Stack>

      <Box className="glass" sx={{ p: 2, borderRadius: 3, overflow: "auto" }}>
        <Typography variant="subtitle2" gutterBottom>
          Recipe
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
                <TableCell>{f.transform ?? "—"}</TableCell>
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

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <JsonBlock title="Canonical (vivenu-shaped)" value={canonical} />
        <JsonBlock title={`Mapped → ${client.label}`} value={mapped} />
      </Box>

      <Button component={RouterLink} to={`/customers/${slug}`} variant="text">
        Back to profile
      </Button>
    </Stack>
  );
}
