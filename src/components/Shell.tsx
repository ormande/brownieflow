import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Wallet,
  ArrowDownLeft,
  Receipt,
  Package,
  BookOpen,
  ChefHat,
  Calculator,
  BarChart3,
  Settings,
  Plus,
  Moon,
  Sun,
  LogOut,
  Menu,
  ChevronRight,
  WifiOff,
  RefreshCw,
  Download,
  LoaderCircle,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useAppData, useRealtime } from "../lib/data";
import { useTheme } from "../lib/theme";
import { today } from "../lib/format";
import { saleBalance } from "../lib/finance";
import { Button, Card, Loading, Modal } from "./ui";
import { Brand } from "../pages/Auth";
import SaleForm from "./SaleForm";
import { useRegisterSW } from "virtual:pwa-register/react";
const groups = [
  {
    label: "VISÃO GERAL",
    items: [
      ["/", "Visão geral", LayoutDashboard],
      ["/vendas", "Vendas", ShoppingBag],
      ["/clientes", "Clientes", Users],
    ],
  },
  {
    label: "FINANCEIRO",
    items: [
      ["/cobrancas", "Cobranças", Wallet],
      ["/pagamentos", "Recebimentos", ArrowDownLeft],
      ["/despesas", "Despesas", Receipt],
    ],
  },
  {
    label: "SUA OPERAÇÃO",
    items: [
      ["/estoque", "Estoque", Package],
      ["/receitas", "Receitas", BookOpen],
      ["/producao", "Produção", ChefHat],
      ["/planejamento", "Planejamento", Calculator],
      ["/relatorios", "Relatórios", BarChart3],
    ],
  },
] as const;
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export default function Shell() {
  const { user, signOut } = useAuth();
  const query = useAppData();
  const { theme, setTheme } = useTheme();
  const [sale, setSale] = useState(false);
  const [menu, setMenu] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const location = useLocation();
  useRealtime();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  useEffect(() => setMenu(false), [location.pathname]);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
    };
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    window.addEventListener("beforeinstallprompt", prompt);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  const profile = query.data?.profiles[0];
  const current =
    groups.flatMap((g) => [...g.items]).find((i) => i[0] === location.pathname)?.[1] ??
    (location.pathname.startsWith("/clientes/") ? "Cliente" : "Configurações");
  const nav = (
    <>
      <div className="sidebar-brand">
        <Brand compact />
      </div>
      <div className="workspace-name">
        <span className="workspace-icon">
          {(profile?.business_name ?? "B").slice(0, 1)}
        </span>
        <div>
          <strong>{profile?.business_name || "Meu negócio"}</strong>
          <span>Seu espaço de gestão</span>
        </div>
        <ChevronRight size={15} />
      </div>
      <nav className="sidebar-nav">
        {groups.map((g) => (
          <div className="nav-group" key={g.label}>
            <p>{g.label}</p>
            {g.items.map(([path, label, Icon]) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              >
                <Icon size={19} />
                <span>{label}</span>
                {path === "/cobrancas" &&
                query.data &&
                query.data.sales.some(
                  (s) =>
                    !s.cancelled_at &&
                    s.due_date &&
                    s.due_date < today() &&
                    saleBalance(s, query.data!) > 0,
                ) ? (
                  <span className="nav-dot" />
                ) : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <NavLink
          to="/configuracoes"
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
        >
          <Settings size={19} />
          Configurações
        </NavLink>
        <div className="sidebar-tip">
          <span className="status-dot" />
          <span>
            Um pouco mais de controle.
            <br />
            <strong>Muito mais tranquilidade.</strong>
          </span>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Ir para o conteúdo
      </a>
      <aside className="sidebar">{nav}</aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="desktop-label">Meu negócio</span>
            <ChevronRight size={14} className="desktop-label" />
            <strong>{current}</strong>
          </div>
          <div className="topbar-actions">
            {query.isFetching && !query.isLoading && (
              <LoaderCircle size={15} className="spin muted" />
            )}
            <span className={`connection-pill ${offline ? "offline" : ""}`}>
              <i />
              {offline ? "Sem conexão" : "Meu espaço"}
            </span>
            {install && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Instalar aplicativo"
                onClick={async () => {
                  await install.prompt();
                  setInstall(null);
                }}
              >
                <Download size={18} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Alternar tema"
              onClick={() =>
                setTheme(
                  document.documentElement.classList.contains("dark") ? "light" : "dark",
                )
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <span className="topbar-divider" />
            <span className="avatar" title={profile?.display_name || user?.email}>
              {(profile?.display_name || profile?.username || "Eu")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sair da conta"
              onClick={() => void signOut()}
            >
              <LogOut size={17} />
            </Button>
          </div>
        </header>
        <main id="main" className="page-content">
          {offline && (
            <div className="notice notice-amber">
              <WifiOff size={18} /> Você está sem conexão. Consulte os dados já
              carregados; novos registros precisam de internet.
            </div>
          )}
          {needRefresh && (
            <div className="notice">
              Uma nova versão está disponível.{" "}
              <Button size="sm" onClick={() => void updateServiceWorker(true)}>
                Atualizar aplicativo
              </Button>
            </div>
          )}
          {query.isLoading ? (
            <Loading />
          ) : query.isError ? (
            <Card>
              <div className="empty">
                <RefreshCw size={30} />
                <h2>Não foi possível carregar seus dados</h2>
                <p>{query.error.message}</p>
                <Button onClick={() => void query.refetch()}>Tentar novamente</Button>
              </div>
            </Card>
          ) : query.data ? (
            <Outlet />
          ) : null}
          <footer className="page-footer">
            <Brand compact />
            <span>Gestão feita com cuidado.</span>
          </footer>
        </main>
      </div>
      <Button
        className="quick-sale"
        onClick={() => setSale(true)}
        disabled={!query.data || offline}
      >
        <Plus size={21} />
        Nova venda
      </Button>
      <nav className="mobile-nav" aria-label="Navegação principal">
        <NavLink to="/" end>
          <LayoutDashboard size={21} />
          <span>Início</span>
        </NavLink>
        <NavLink to="/vendas">
          <ShoppingBag size={21} />
          <span>Vendas</span>
        </NavLink>
        <button
          className="mobile-add"
          onClick={() => setSale(true)}
          disabled={!query.data || offline}
          aria-label="Nova venda"
        >
          <Plus size={27} />
        </button>
        <NavLink to="/cobrancas">
          <Wallet size={21} />
          <span>Cobranças</span>
        </NavLink>
        <button onClick={() => setMenu(true)}>
          <Menu size={21} />
          <span>Mais</span>
        </button>
      </nav>
      <Modal open={menu} onOpenChange={setMenu} title="Seu negócio">
        {nav}
      </Modal>
      {query.data && <SaleForm open={sale} onOpenChange={setSale} />}
    </div>
  );
}
