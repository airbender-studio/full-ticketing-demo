import { useEffect, useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { api, type CustomerProfile } from "../api/client";
import { useBranding } from "../theme/BrandingProvider";

export function CustomerProfilePage() {
  const { slug = "" } = useParams();
  const { setBranding } = useBranding();
  const [client, setClient] = useState<CustomerProfile | null>(null);

  useEffect(() => {
    api.client(slug).then(setClient).catch(console.error);
  }, [slug]);

  if (!client) {
    return (
      <Stack alignItems="center" py={8}>
        <CircularProgress />
      </Stack>
    );
  }

  const s = client.story;

  return (
    <Stack spacing={3} maxWidth={800}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={s.hq} />
        <Chip
          color={client.mapping.style === "clean" ? "success" : "warning"}
          label={client.mapping.style === "clean" ? "Clean mapping" : "Legacy mapping"}
        />
        <Chip variant="outlined" label={s.erpName} />
      </Stack>

      <Typography variant="h3">{client.name}</Typography>
      <Typography color="text.secondary" fontSize={18}>
        {s.summary}
      </Typography>

      <Box className="glass" sx={{ p: 3, borderRadius: 3 }}>
        <Typography variant="overline" color="text.secondary">
          Snapshot
        </Typography>
        <Typography>
          <strong>Industry:</strong> {s.industry}
        </Typography>
        <Typography>
          <strong>Size:</strong> {s.size}
        </Typography>
        <Typography>
          <strong>API style:</strong> {s.apiStyle}
        </Typography>
      </Box>

      <Box>
        <Typography variant="h5" gutterBottom>
          How their API works
        </Typography>
        <List dense>
          {s.howTheyWork.map((line) => (
            <ListItem key={line} sx={{ px: 0 }}>
              <ListItemText primary={line} />
            </ListItem>
          ))}
        </List>
      </Box>

      <Box>
        <Typography variant="h5" gutterBottom>
          Pain points
        </Typography>
        <List dense>
          {s.painPoints.map((line) => (
            <ListItem key={line} sx={{ px: 0 }}>
              <ListItemText primary={line} />
            </ListItem>
          ))}
        </List>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
        <Button
          variant="contained"
          onClick={async () => {
            const r = await api.activateClient(client.slug);
            setBranding(r.branding);
          }}
        >
          Activate this customer
        </Button>
        <Button component={RouterLink} to={`/customers/${client.slug}/mapping`} variant="outlined">
          Open JSON mapping
        </Button>
        <Button component={RouterLink} to="/customers" variant="text">
          All customers
        </Button>
      </Stack>
    </Stack>
  );
}
