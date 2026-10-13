import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Package,
  ShoppingBag,
  Plus,
  ChefHat,
  ArrowRight,
  CalendarDays,
  TrendingUp,
  Sun,
} from "lucide-react";
import { useAppData } from "../lib/data";
import { money, today, dateLabel } from "../lib/format";
import { saleBalance, salePaid, saleStatus, saleAdjustment } from "../lib/finance";
import { Badge, Button, Card, Empty, Input, PageHeader, Stat } from "../components/ui";
import SaleForm from "../components/SaleForm";
export default function Dashboard() {
  const { data } = useAppData();
  const now = today();
  const [from, setFrom] = useState(now.slice(0, 7) + "-01");
  const [to, setTo] = useState(now);
  const [sale, setSale] = useState(false);
  const computed = useMemo(() => {
    if (!data) return null;
    const inPeriod = (d: string) => d >= from && d <= to;
    const sales = data.sales.filter((s) => !s.cancelled_at && inPeriod(s.sale_date));
    const payments = data.payments.filter(
      (p) => !p.voided_at && inPeriod(p.payment_date),
    );
    const expenses = data.expenses.filter((e) => inPeriod(e.expense_date));
    const daySales = data.sales.filter((s) => !s.cancelled_at && s.sale_date === now);
    const gross = sales.reduce((a, s) => a + s.gross_cents, 0);
    const revenue = sales.reduce((a, s) => a + s.total_cents, 0);
    const received = payments.reduce((a, p) => a + p.amount_cents, 0);
    const spent = expenses.reduce((a, e) => a + e.amount_cents, 0);
    const ids = new Set(sales.map((s) => s.id));
    const soldCost = data.sale_items
      .filter((s) => ids.has(s.sale_id))
      .reduce((a, s) => a + s.quantity * Number(s.unit_cost_cents), 0);
    const overdue = sales
      .filter((s) => s.due_date && s.due_date < now)
      .reduce((a, s) => a + saleBalance(s, data), 0);
    const receivables = sales.reduce((a, s) => a + saleBalance(s, data), 0);
    const daily = new Map<
      string,
      {
        date: string;
        faturamento: number;
        recebimentos: number;
        despesas: number;
      }
    >();
    const bucket = (date: string) => {
      if (!daily.has(date))
        daily.set(date, { date, faturamento: 0, recebimentos: 0, despesas: 0 });
      return daily.get(date)!;
    };
    sales.forEach((s) => (bucket(s.sale_date).faturamento += s.total_cents / 100));
    payments.forEach(
      (p) => (bucket(p.payment_date).recebimentos += p.amount_cents / 100),
    );
    expenses.forEach((e) => (bucket(e.expense_date).despesas += e.amount_cents / 100));
    const top = data.customers
      .map((c) => ({
        customer: c,
        balance: data.sales
          .filter((s) => s.customer_id === c.id)
          .reduce((a, s) => a + saleBalance(s, data), 0),
      }))
      .filter((x) => x.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 4);
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(`${now}T12:00:00`);
      d.setMonth(d.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        month: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        faturamento: data.sales
          .filter((s) => !s.cancelled_at && s.sale_date.startsWith(key))
          .reduce((a, s) => a + s.total_cents / 100, 0),
      };
    });
    return {
      sales,
      payments,
      gross,
      revenue,
      received,
      spent,
      soldCost,
      overdue,
      receivables,
      daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
      daySales,
      top,
      months,
    };
  }, [data, from, to, now]);
  if (!data || !computed) return null;
  const c = computed;
  const profile = data.profiles[0];
  const dayIds = new Set(c.daySales.map((s) => s.id));
  const dayUnits = data.sale_items
    .filter((i) => dayIds.has(i.sale_id))
    .reduce((a, i) => a + i.quantity, 0);
  const produced = data.production_batches
    .filter((p) => p.production_date === now)
    .reduce((a, p) => a + p.actual_quantity, 0);
  const available = data.products
    .filter((p) => p.active)
    .reduce((a, p) => a + Number(p.stock), 0);
  const dayRevenue = c.daySales.reduce((a, s) => a + s.total_cents, 0);
  const dayReceived = data.payments
    .filter((p) => !p.voided_at && p.payment_date === now)
    .reduce((a, p) => a + p.amount_cents, 0);
  const dayCredit = c.daySales
    .filter((s) => s.modality === "credit")
    .reduce((a, s) => a + s.total_cents, 0);
  const adjusted = c.sales.reduce((a, s) => a + saleAdjustment(s.id, data), 0);
  const estimatedProduction = data.production_batches
    .filter((b) => b.production_date >= from && b.production_date <= to)
    .reduce((a, b) => a + b.total_cost_cents, 0);
  return (
    <>
      <PageHeader
        title={`Olá, ${profile?.display_name || profile?.username || "empreendedor"} 👋`}
        description="Vamos deixar seu negócio no ponto certo hoje."
        action={
          <Button onClick={() => setSale(true)}>
            <Plus size={18} />
            Nova venda
          </Button>
        }
      />
      <div className="dashboard-period">
        <div className="section-label">
          <span className="status-dot" />
          SEU NEGÓCIO EM NÚMEROS
        </div>
        <div className="period-inputs">
          <CalendarDays size={16} />
          <Input
            type="date"
            aria-label="Início do período"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
          />
          <span>até</span>
          <Input
            type="date"
            aria-label="Fim do período"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>
      {from > to && (
        <p role="alert" className="field-error">
          O início precisa ser anterior ao fim do período.
        </p>
      )}
      <div className="grid-4">
        <Stat
          label="Faturamento líquido"
          value={money(c.revenue)}
          icon={<TrendingUp size={19} />}
          hint={
            <>
              <span className="legend-dot green" />
              Vendas do período, após descontos
            </>
          }
        />
        <Stat
          label="Dinheiro recebido"
          value={money(c.received)}
          icon={<ArrowDownLeft size={19} />}
          hint="Entradas efetivas no período"
        />
        <Stat
          label="Ainda a receber"
          value={money(c.receivables)}
          icon={<Wallet size={19} />}
          hint={
            c.overdue > 0 ? (
              <span className="text-amber">{money(c.overdue)} em atraso</span>
            ) : (
              "Saldo atual das vendas do período"
            )
          }
        />
        <Stat
          label="Saldo de caixa"
          value={money(c.received - c.spent)}
          icon={<ArrowUpRight size={19} />}
          hint={`${money(c.spent)} em despesas no período`}
        />
      </div>
      <div className="dashboard-main-grid">
        <Card className="chart-card">
          <div className="card-heading">
            <div>
              <h2>O ritmo do seu negócio</h2>
              <p>Faturamento e movimentações do período</p>
            </div>
            <Badge>Em reais</Badge>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot green" />
              Faturamento
            </span>
            <span>
              <i className="legend-dot blue" />
              Recebimentos
            </span>
            <span>
              <i className="legend-dot orange" />
              Despesas
            </span>
          </div>
          {c.daily.length ? (
            <div className="chart-height">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={c.daily}
                  margin={{ left: -18, right: 6, top: 20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0aa574" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#0aa574" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="4 5"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) => dateLabel(d).slice(0, 5)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    minTickGap={30}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v) * 100)}
                    labelFormatter={(d) => dateLabel(String(d))}
                    contentStyle={{
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="faturamento"
                    name="Faturamento"
                    stroke="#0aa574"
                    strokeWidth={3}
                    fill="url(#revenueGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="recebimentos"
                    name="Recebimentos"
                    stroke="#7185de"
                    strokeWidth={2}
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    dataKey="despesas"
                    name="Despesas"
                    stroke="#d9a45a"
                    strokeWidth={2}
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="chart-empty">
              <TrendingUp size={30} />
              <strong>Seu próximo capítulo começa aqui</strong>
              <p>Registre uma venda para acompanhar sua evolução.</p>
              <div className="empty-chart-lines" />
            </div>
          )}
          <div className="chart-footer">
            <span>Faturamento é o que você vendeu.</span>
            <span>Recebimento é o que entrou no caixa.</span>
          </div>
        </Card>
        <Card className="today-card">
          <div className="today-heading">
            <span className="today-icon">
              <Sun size={20} />
            </span>
            <Badge tone="green">{dateLabel(now).slice(0, 5)}</Badge>
          </div>
          <h2>Sua fornada de hoje</h2>
          <p>Cada brownie faz a diferença.</p>
          <div className="production-ring">
            <span>
              {available}
              <small>disponíveis em estoque</small>
            </span>
          </div>
          <div className="today-split">
            <div>
              <strong>{produced}</strong>
              <span>produzidos hoje</span>
            </div>
            <i />
            <div>
              <strong>{dayUnits}</strong>
              <span>vendidos hoje</span>
            </div>
          </div>
          <Link className="today-link" to="/producao">
            Registrar produção
            <ArrowRight size={16} />
          </Link>
        </Card>
      </div>
      <div className="dashboard-bottom-grid">
        <Card>
          <div className="card-heading">
            <div>
              <h2>Últimas vendas</h2>
              <p>Os movimentos mais recentes</p>
            </div>
            <Link to="/vendas" className="text-link">
              Ver todas
              <ArrowUpRight size={15} />
            </Link>
          </div>
          {data.sales.filter((s) => !s.cancelled_at).length ? (
            <div className="recent-list">
              {data.sales
                .filter((s) => !s.cancelled_at)
                .sort(
                  (a, b) =>
                    b.sale_date.localeCompare(a.sale_date) ||
                    b.created_at.localeCompare(a.created_at),
                )
                .slice(0, 5)
                .map((s) => (
                  <div className="recent-row" key={s.id}>
                    <span className="customer-avatar">
                      {(
                        data.customers.find((x) => x.id === s.customer_id)?.name ??
                        "Avulsa"
                      ).slice(0, 1)}
                    </span>
                    <div>
                      <strong>
                        {data.customers.find((x) => x.id === s.customer_id)?.name ??
                          "Venda avulsa"}
                      </strong>
                      <small>
                        {dateLabel(s.sale_date)} ·{" "}
                        {s.modality === "credit" ? "Fiado" : "À vista"}
                      </small>
                    </div>
                    <div className="recent-amount">
                      <strong>{money(s.total_cents)}</strong>
                      <Badge
                        tone={
                          saleBalance(s, data) === 0
                            ? "green"
                            : saleStatus(s, data) === "overdue"
                              ? "red"
                              : "amber"
                        }
                      >
                        {saleBalance(s, data) === 0
                          ? "Recebido"
                          : salePaid(s.id, data) > 0
                            ? "Parcial"
                            : "Pendente"}
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Empty
              title="Sua primeira venda está por vir"
              description="Registre em poucos toques e deixe o resto com a gente."
              action={
                <Button variant="secondary" size="sm" onClick={() => setSale(true)}>
                  <Plus size={15} />
                  Registrar venda
                </Button>
              }
            />
          )}
        </Card>
        <Card>
          <div className="card-heading">
            <div>
              <h2>Para ficar de olho</h2>
              <p>Clientes com saldo a receber</p>
            </div>
            <Wallet size={19} className="muted" />
          </div>
          {c.top.length ? (
            c.top.map(({ customer, balance }) => (
              <Link
                className="debt-row"
                to={`/clientes/${customer.id}`}
                key={customer.id}
              >
                <span className="customer-avatar amber">{customer.name.slice(0, 1)}</span>
                <strong>{customer.name}</strong>
                <span className="amount">{money(balance)}</span>
                <ArrowUpRight size={15} />
              </Link>
            ))
          ) : (
            <Empty
              title="Tudo em dia por aqui"
              description="Seus clientes com saldo pendente aparecem neste espaço."
            />
          )}
          <Link to="/cobrancas" className="card-bottom-link">
            Ir para cobranças
            <ArrowRight size={16} />
          </Link>
        </Card>
      </div>
      <div className="section-heading">
        <h2>Um olhar mais detalhado</h2>
        <span className="muted">Vendas, caixa e estimativas separados</span>
      </div>
      <div className="grid-4">
        <Stat
          label="Faturamento bruto"
          value={money(c.gross)}
          hint={`${money(c.gross - c.revenue)} em descontos na venda`}
        />
        <Stat
          label="Custo da produção"
          value={money(estimatedProduction)}
          hint="Custo dos lotes produzidos no período"
        />
        <Stat
          label="Custo dos itens vendidos"
          value={money(c.soldCost)}
          hint="Custo médio preservado na data da venda"
        />
        <Stat
          label="Contribuição estimada"
          value={money(c.revenue + adjusted - c.soldCost)}
          hint="Vendas + ajustes − custo dos itens"
        />
      </div>
      <div className="grid-2 dashboard-details">
        <Card>
          <h2 className="section-title">Hoje, em detalhes</h2>
          {[
            ["Faturamento", money(dayRevenue)],
            ["Recebimentos", money(dayReceived)],
            ["Vendas fiadas", money(dayCredit)],
            ["Vendas realizadas", String(c.daySales.length)],
          ].map(([label, value]) => (
            <div className="list-row" key={label}>
              <span className="muted">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </Card>
        <Card>
          <h2 className="section-title">Evolução dos últimos 6 meses</h2>
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <BarChart data={c.months}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted)", fontSize: 12 }}
                />
                <Tooltip
                  formatter={(v) => money(Number(v) * 100)}
                  contentStyle={{
                    borderRadius: 14,
                    background: "var(--card)",
                    borderColor: "var(--border)",
                  }}
                />
                <Bar
                  name="Faturamento"
                  dataKey="faturamento"
                  fill="#0a966b"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <SaleForm open={sale} onOpenChange={setSale} />
    </>
  );
}
