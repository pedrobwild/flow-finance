import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FinanceProvider } from "@/lib/finance-context";
import { ObrasProvider } from "@/lib/obras-context";
import AppShell from "@/components/AppShell";
import Index from "./pages/Index";
import ContasPagar from "./pages/ContasPagar";
import ContasReceber from "./pages/ContasReceber";
import FluxoCaixa from "./pages/FluxoCaixa";
import Simulador from "./pages/Simulador";
import Obras from "./pages/Obras";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <FinanceProvider>
        <ObrasProvider>
          <BrowserRouter>
            <AppShell>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/pagar" element={<ContasPagar />} />
                <Route path="/receber" element={<ContasReceber />} />
                <Route path="/fluxo" element={<FluxoCaixa />} />
                <Route path="/simulador" element={<Simulador />} />
                <Route path="/obras" element={<Obras />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AppShell>
          </BrowserRouter>
        </ObrasProvider>
      </FinanceProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
