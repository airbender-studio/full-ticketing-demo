import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { api, type Branding } from "../api/client";

const FONT_STACK: Record<Branding["font"], string> = {
  "dm-sans": '"DM Sans", system-ui, sans-serif',
  "space-grotesk": '"Space Grotesk", system-ui, sans-serif',
  "source-serif": '"Source Serif 4", Georgia, serif',
};

type Ctx = {
  branding: Branding;
  setBranding: (b: Branding) => void;
  refresh: () => Promise<void>;
  ready: boolean;
};

const BrandingContext = createContext<Ctx | null>(null);

const fallback: Branding = {
  brandName: "Bluebox Tickets",
  primary: "#1565C0",
  secondary: "#0EA5E9",
  mode: "light",
  font: "dm-sans",
};

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(fallback);
  const [ready, setReady] = useState(false);

  const refresh = async () => {
    const b = await api.branding();
    setBranding(b);
    setReady(true);
  };

  useEffect(() => {
    refresh().catch(() => setReady(true));
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--primary", branding.primary);
    document.documentElement.style.setProperty("--secondary", branding.secondary);
    document.documentElement.style.setProperty(
      "--bg",
      branding.mode === "dark" ? "#0B1220" : "#F4F8FC"
    );
    document.documentElement.style.setProperty(
      "--paper",
      branding.mode === "dark" ? "#121A2B" : "#FFFFFF"
    );
    document.title = branding.brandName;
  }, [branding]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: branding.mode,
          primary: { main: branding.primary },
          secondary: { main: branding.secondary },
          background: {
            default: branding.mode === "dark" ? "#0B1220" : "#F4F8FC",
            paper: branding.mode === "dark" ? "#121A2B" : "#FFFFFF",
          },
        },
        typography: {
          fontFamily: FONT_STACK[branding.font],
          h1: { fontWeight: 700, letterSpacing: "-0.03em" },
          h2: { fontWeight: 700, letterSpacing: "-0.02em" },
          h3: { fontWeight: 650, letterSpacing: "-0.02em" },
          button: { textTransform: "none", fontWeight: 600 },
        },
        shape: { borderRadius: 14 },
        components: {
          MuiButton: {
            styleOverrides: {
              root: { borderRadius: 999, px: 2.2 },
            },
          },
          MuiPaper: {
            styleOverrides: {
              root: { backgroundImage: "none" },
            },
          },
        },
      }),
    [branding]
  );

  return (
    <BrandingContext.Provider value={{ branding, setBranding, refresh, ready }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding outside provider");
  return ctx;
}
