import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { FinanceProvider } from "@/lib/finance-context";
import { ObrasProvider } from "@/lib/obras-context";
import { ObraFilterProvider } from "@/lib/obra-filter-context";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppShell from "@/components/AppShell";
import Login from "./pages/Login";
import Index from "./pages/Index";
import ContasPagar from "./pages/ContasPagar";
import ContasReceber from "./pages/ContasReceber";
import FluxoCaixa from "./pages/FluxoCaixa";
import Simulador from "./pages/Simulador";
import Obras from "./pages/Obras";
import ComandoDeGuerra from "./pages/ComandoDeGuerra";
import CustosAnalise from "./pages/CustosAnalise";
import Negociacoes from "./pages/Negociacoes";
import AdminUsers from "./pages/AdminUsers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <FinanceProvider>
                    <ObrasProvider>
                      <ObraFilterProvider>
                        <AppShell>
                          <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="/obras" element={<Obras />} />
                            <Route path="/pagar" element={<ContasPagar />} />
                            <Route path="/receber" element={<ContasReceber />} />
                            <Route path="/fluxo" element={<FluxoCaixa />} />
                            <Route path="/simulador" element={<Simulador />} />
                            <Route path="/comando-de-guerra" element={<ComandoDeGuerra />} />
                            <Route path="/custos" element={<CustosAnalise />} />
                            <Route path="/negociacoes" element={<Negociacoes />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </AppShell>
                      </ObraFilterProvider>
                    </ObrasProvider>
                  </FinanceProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
