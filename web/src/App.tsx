import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { HomePage } from "./pages/HomePage";
import { VenuePage } from "./pages/VenuePage";
import { VisualizerPage } from "./pages/VisualizerPage";
import { BrandingPage } from "./pages/BrandingPage";
import { TicketPreviewPage } from "./pages/TicketPreviewPage";
import { CustomersPage } from "./pages/CustomersPage";
import { CustomerProfilePage } from "./pages/CustomerProfilePage";
import { MappingPage } from "./pages/MappingPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/venues/:slug" element={<VenuePage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:slug" element={<CustomerProfilePage />} />
        <Route path="/customers/:slug/mapping" element={<MappingPage />} />
        <Route path="/ticket" element={<TicketPreviewPage />} />
        <Route path="/visualizer" element={<VisualizerPage />} />
        <Route path="/branding" element={<BrandingPage />} />
      </Route>
    </Routes>
  );
}
