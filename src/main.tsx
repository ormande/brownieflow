import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./index.css";
import { AuthProvider, useAuth } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";
import { isConfigured } from "./lib/supabase";
import Auth from "./pages/Auth";
import Shell from "./components/Shell";
import { Button, Loading } from "./components/ui";
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Sales = lazy(() => import("./pages/Sales"));
const Customers = lazy(() => import("./pages/Customers"));
const CustomerDetail = lazy(() =>
  import("./pages/Customers").then((m) => ({ default: m.CustomerDetail })),
);
const Receivables = lazy(() => import("./pages/Receivables"));
const Payments = lazy(() => import("./pages/Payments"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Recipes = lazy(() => import("./pages/Recipes"));
const Production = lazy(() => import("./pages/Production"));
const Planning = lazy(() => import("./pages/Planning"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const client = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
});
function Protected() {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="page-content">
        <Loading />
      </div>
    );
  if (!isConfigured || !user) return <Navigate to="/entrar" replace />;
  return <Shell />;
}
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="empty">
        <h1>Algo não saiu como esperado.</h1>
        <p>
          Recarregue a página para continuar. Os registros confirmados permanecem no
          banco.
        </p>
        <Button onClick={() => location.reload()}>Recarregar</Button>
      </main>
    ) : (
      this.props.children
    );
  }
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <ThemeProvider>
          <AuthProvider>
            <BrowserRouter>
              <Suspense
                fallback={
                  <div className="page-content">
                    <Loading />
                  </div>
                }
              >
                <Routes>
                  <Route path="/entrar" element={<Auth />} />
                  <Route element={<Protected />}>
                    <Route index element={<Dashboard />} />
                    <Route path="vendas" element={<Sales />} />
                    <Route path="clientes" element={<Customers />} />
                    <Route path="clientes/:id" element={<CustomerDetail />} />
                    <Route path="cobrancas" element={<Receivables />} />
                    <Route path="pagamentos" element={<Payments />} />
                    <Route path="despesas" element={<Expenses />} />
                    <Route path="estoque" element={<Inventory />} />
                    <Route path="receitas" element={<Recipes />} />
                    <Route path="producao" element={<Production />} />
                    <Route path="planejamento" element={<Planning />} />
                    <Route path="relatorios" element={<Reports />} />
                    <Route path="configuracoes" element={<Settings />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            <Toaster position="top-center" richColors closeButton duration={5000} />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
