import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button, Card, Empty, Field, PageHeader, Select, Stat } from "../components/ui";
import { useAppData } from "../lib/data";
import { dateLabel, methodLabel, money, today } from "../lib/format";
import {
  downloadCsv,
  recipeCost,
  saleAdjustment,
  saleBalance,
  salePaid,
  saleStatus,
} from "../lib/finance";
import {
  customerName,
  DateRange,
  inPeriod,
  LoadingData,
  monthStart,
  saleQuantity,
} from "../components/finance/shared";

const colors = [
  "#26996e",
  "#70c19c",
  "#cca171",
  "#f0c68d",
  "#7c91bc",
  "#b199ce",
  "#d59799",
  "#9ba6a1",
];
export default function Reports() {
  const { data } = useAppData();
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [exportType, setExportType] = useState("sales");
  const [periodPreset, setPeriodPreset] = useState("month");
  if (!data) return <LoadingData />;
  const allPeriodSales = data.sales.filter((s) => inPeriod(s.sale_date, start, end));
  const sales = allPeriodSales.filter((s) => !s.cancelled_at);
  const allPeriodPayments = data.payments.filter((p) =>
    inPeriod(p.payment_date, start, end),
  );
  const payments = allPeriodPayments.filter((p) => !p.voided_at);
  const expenses = data.expenses.filter((e) => inPeriod(e.expense_date, start, end));
  const adjustments = data.receivable_adjustments.filter(
    (a) =>
      inPeriod(a.adjustment_date, start, end) &&
      data.sales.some((s) => s.id === a.sale_id && !s.cancelled_at),
  );
  const batches = data.production_batches.filter((p) =>
    inPeriod(p.production_date, start, end),
  );
  const gross = sales.reduce((n, s) => n + s.gross_cents, 0);
  const saleDiscounts = sales.reduce((n, s) => n + s.discount_cents, 0);
  const net = gross - saleDiscounts;
  const received = payments.reduce((n, p) => n + p.amount_cents, 0);
  const spending = expenses.reduce((n, e) => n + e.amount_cents, 0);
  const pending = sales.reduce((n, s) => n + saleBalance(s, data), 0);
  const quantities = sales.reduce((n, s) => n + saleQuantity(s.id, data), 0);
  const cost = data.sale_items
    .filter((i) => sales.some((s) => s.id === i.sale_id))
    .reduce((n, i) => n + i.quantity * i.unit_cost_cents, 0);
  const margin = net - cost;
  const operating = expenses
    .filter(
      (e) =>
        !e.purchase_id && e.category !== "Ingredientes" && e.category !== "Equipamentos",
    )
    .reduce((n, e) => n + e.amount_cents, 0);
  const recipe = data.recipes.find((r) => r.is_default) ?? data.recipes[0];
  const unitCost = quantities
    ? cost / quantities
    : recipe
      ? recipeCost(recipe.id, data) / recipe.yield_quantity
      : 0;
  const dates = [
    ...new Set([
      ...sales.map((s) => s.sale_date),
      ...payments.map((p) => p.payment_date),
      ...expenses.map((e) => e.expense_date),
    ]),
  ].sort();
  const daily = dates.map((date) => ({
    date,
    name: dateLabel(date).slice(0, 5),
    faturamento:
      sales.filter((s) => s.sale_date === date).reduce((n, s) => n + s.total_cents, 0) /
      100,
    recebimentos:
      payments
        .filter((p) => p.payment_date === date)
        .reduce((n, p) => n + p.amount_cents, 0) / 100,
    despesas:
      expenses
        .filter((e) => e.expense_date === date)
        .reduce((n, e) => n + e.amount_cents, 0) / 100,
  }));
  const categories = [...new Set(expenses.map((e) => e.category))].map((category) => ({
    name: category,
    value:
      expenses
        .filter((e) => e.category === category)
        .reduce((n, e) => n + e.amount_cents, 0) / 100,
  }));
  const modalities = [
    {
      name: "À vista",
      total:
        sales
          .filter((s) => s.modality === "cash")
          .reduce((n, s) => n + s.total_cents, 0) / 100,
    },
    {
      name: "Fiado",
      total:
        sales
          .filter((s) => s.modality === "credit")
          .reduce((n, s) => n + s.total_cents, 0) / 100,
    },
  ];
  const rankings = data.customers.map((c) => ({
    id: c.id,
    name: c.name,
    revenue: sales
      .filter((s) => s.customer_id === c.id)
      .reduce((n, s) => n + s.total_cents, 0),
    units: sales
      .filter((s) => s.customer_id === c.id)
      .reduce((n, s) => n + saleQuantity(s.id, data), 0),
    balance: data.sales
      .filter((s) => s.customer_id === c.id && !s.cancelled_at)
      .reduce((n, s) => n + saleBalance(s, data), 0),
  }));
  const top = rankings
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);
  const debtors = rankings
    .filter((c) => c.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 10);
  function exportCsv() {
    if (!data) return;
    const value = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
    let rows: Record<string, unknown>[] = [];
    if (exportType === "sales")
      rows = allPeriodSales.map((s) => ({
        ID: s.id,
        Data: s.sale_date,
        Cliente: customerName(s.customer_id, data),
        Modalidade: s.modality === "cash" ? "À vista" : "Fiado",
        Quantidade: saleQuantity(s.id, data),
        "Bruto (R$)": value(s.gross_cents),
        "Desconto (R$)": value(s.discount_cents),
        "Total (R$)": value(s.total_cents),
        "Ajustes atuais (R$)": value(saleAdjustment(s.id, data)),
        "Pago atual (R$)": value(salePaid(s.id, data)),
        "Saldo atual (R$)": value(saleBalance(s, data)),
        Vencimento: s.due_date,
        Status: {
          paid: "Quitado",
          partial: "Parcial",
          overdue: "Atrasado",
          pending: "Pendente",
          cancelled: "Cancelado",
        }[saleStatus(s, data)],
        Observações: s.notes,
      }));
    if (exportType === "payments")
      rows = allPeriodPayments.map((p) => ({
        ID: p.id,
        Data: p.payment_date,
        Cliente: customerName(p.customer_id, data),
        "Valor (R$)": value(p.amount_cents),
        Método: methodLabel[p.method],
        Status: p.voided_at ? "Estornado" : "Ativo",
        "Vendas vinculadas": data.payment_allocations
          .filter((a) => a.payment_id === p.id)
          .map((a) => a.sale_id)
          .join(", "),
        Observações: p.notes,
        "Motivo do estorno": p.void_reason,
      }));
    if (exportType === "customers")
      rows = data.customers.map((c) => ({
        ID: c.id,
        Nome: c.name,
        Telefone: c.phone,
        Cadastro: c.created_at,
        Arquivado: c.archived ? "Sim" : "Não",
        "Compras no período (R$)": value(
          rankings.find((r) => r.id === c.id)?.revenue ?? 0,
        ),
        "Saldo atual (R$)": value(rankings.find((r) => r.id === c.id)?.balance ?? 0),
        Observações: c.notes,
      }));
    if (exportType === "expenses")
      rows = expenses.map((e) => ({
        ID: e.id,
        Data: e.expense_date,
        Descrição: e.description,
        Categoria: e.category,
        "Valor (R$)": value(e.amount_cents),
        Método: methodLabel[e.method],
        Fornecedor: e.supplier,
        "Compra vinculada": e.purchase_id,
        Observações: e.notes,
      }));
    downloadCsv(`brownieflow-${exportType}-${start || "inicio"}-${end || "hoje"}`, rows);
  }
  return (
    <div className="stack">
      <PageHeader
        title="Relatórios"
        description="Entenda seus números e acompanhe a evolução do negócio."
        action={
          <div className="toolbar">
            <Select
              aria-label="Tipo de exportação"
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
            >
              <option value="sales">Vendas</option>
              <option value="payments">Recebimentos</option>
              <option value="customers">Clientes</option>
              <option value="expenses">Despesas</option>
            </Select>
            <Button
              variant="secondary"
              onClick={exportCsv}
              disabled={Boolean(start && end && start > end)}
            >
              <Download size={17} /> Exportar CSV
            </Button>
          </div>
        }
      />
      <Card>
        <div className="toolbar">
          <DateRange
            start={start}
            end={end}
            setStart={(v) => {
              setStart(v);
              setPeriodPreset("custom");
            }}
            setEnd={(v) => {
              setEnd(v);
              setPeriodPreset("custom");
            }}
          />
          <Field label="Atalho de período">
            <Select
              value={periodPreset}
              onChange={(e) => {
                setPeriodPreset(e.target.value);
                if (e.target.value === "month") {
                  setStart(monthStart());
                  setEnd(today());
                } else if (e.target.value === "year") {
                  setStart(`${today().slice(0, 4)}-01-01`);
                  setEnd(today());
                } else if (e.target.value === "all") {
                  setStart("");
                  setEnd("");
                }
              }}
            >
              <option value="custom">Personalizado</option>
              <option value="month">Este mês</option>
              <option value="year">Este ano</option>
              <option value="all">Todo o histórico</option>
            </Select>
          </Field>
        </div>
      </Card>
      <div className="grid-4">
        <Stat
          label="Faturamento bruto"
          value={money(gross)}
          hint="Antes dos descontos na venda"
        />
        <Stat
          label="Faturamento líquido"
          value={money(net)}
          hint="Bruto menos descontos na venda"
          icon={<TrendingUp size={19} />}
        />
        <Stat
          label="Brownies vendidos"
          value={quantities}
          hint={`${sales.length} vendas no período`}
        />
        <Stat
          label="Saldo destas vendas"
          value={money(pending)}
          hint="Saldo atual das vendas do período"
        />
      </div>
      <Card>
        <div className="list-row" style={{ marginBottom: 24 }}>
          <div>
            <h2 className="section-title">Movimento no período</h2>
            <p className="muted" style={{ marginTop: 6 }}>
              Faturamento, recebimentos e despesas têm datas próprias.
            </p>
          </div>
        </div>
        {daily.length ? (
          <>
            <div style={{ height: 300, width: "100%" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={daily}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="reportRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#27976c" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#27976c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    vertical={false}
                    stroke="var(--border, #e4e8e5)"
                  />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted, #77827b)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted, #77827b)" }}
                    tickFormatter={(v) => `R$ ${v}`}
                    width={64}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v) * 100)}
                    contentStyle={{
                      borderRadius: 14,
                      background: "var(--card)",
                      border: "1px solid var(--border, #eee)",
                      color: "var(--text)",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="faturamento"
                    name="Faturamento líquido"
                    stroke="#26996e"
                    strokeWidth={2.5}
                    fill="url(#reportRevenue)"
                  />
                  <Area
                    type="monotone"
                    dataKey="recebimentos"
                    name="Recebimentos"
                    stroke="#7190c6"
                    strokeWidth={2}
                    fill="transparent"
                  />
                  <Area
                    type="monotone"
                    dataKey="despesas"
                    name="Despesas"
                    stroke="#c79a66"
                    strokeWidth={2}
                    fill="transparent"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div
              className="toolbar"
              style={{ justifyContent: "center", marginTop: 16, fontSize: 12 }}
            >
              <span style={{ color: "#26996e" }}>● Faturamento líquido</span>
              <span style={{ color: "#7190c6" }}>● Recebimentos</span>
              <span style={{ color: "#c79a66" }}>● Despesas</span>
            </div>
          </>
        ) : (
          <Empty
            title="O próximo capítulo começa com seu primeiro registro"
            description="O gráfico será preenchido pelas vendas, pagamentos e despesas reais deste período."
          />
        )}
      </Card>
      <div className="grid-3">
        <Stat
          label="Recebimentos no período"
          value={money(received)}
          hint="Todos os pagamentos ativos, pela data recebida"
        />
        <Stat
          label="Despesas pagas"
          value={money(spending)}
          hint="Inclui compras de insumos uma única vez"
        />
        <Stat
          label="Saldo do fluxo de caixa"
          value={money(received - spending)}
          hint="Recebimentos menos despesas do período"
        />
      </div>
      <div className="grid-2">
        <Card>
          <h2 className="section-title">Vendas por modalidade</h2>
          {sales.length ? (
            <div style={{ height: 230, marginTop: 20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modalities}
                  layout="vertical"
                  margin={{ right: 20, left: 0 }}
                >
                  <CartesianGrid
                    horizontal={false}
                    strokeDasharray="4 4"
                    stroke="var(--border, #eee)"
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `R$ ${v}`}
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={60}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(v) => money(Number(v) * 100)}
                    contentStyle={{
                      borderRadius: 14,
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                  <Bar
                    dataKey="total"
                    name="Faturamento"
                    radius={[0, 7, 7, 0]}
                    maxBarSize={40}
                  >
                    {modalities.map((m, i) => (
                      <Cell key={m.name} fill={colors[i]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty title="Nenhuma venda no período" />
          )}
        </Card>
        <Card>
          <h2 className="section-title">Despesas por categoria</h2>
          {categories.length ? (
            <div className="grid-2" style={{ gap: 12, alignItems: "center" }}>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="value"
                      innerRadius="60%"
                      outerRadius="85%"
                      paddingAngle={3}
                    >
                      {categories.map((c, i) => (
                        <Cell
                          key={c.name}
                          fill={colors[i % colors.length]}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v) => money(Number(v) * 100)}
                      contentStyle={{
                        borderRadius: 14,
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="stack" style={{ gap: 12 }}>
                {categories.map((c, i) => (
                  <div className="list-row" key={c.name} style={{ gap: 8, fontSize: 12 }}>
                    <span>
                      <span style={{ color: colors[i % colors.length] }}>● </span>
                      {c.name}
                    </span>
                    <strong>{money(c.value * 100)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Empty title="Nenhuma despesa no período" />
          )}
        </Card>
      </div>
      <Card>
        <h2 className="section-title" style={{ marginBottom: 24 }}>
          Resultado estimado da operação
        </h2>
        <div className="grid-4">
          <div>
            <p className="muted">Custo por brownie</p>
            <strong style={{ fontSize: 24 }}>{money(unitCost)}</strong>
            <p className="muted" style={{ fontSize: 12 }}>
              {quantities
                ? "Média do custo registrado nas vendas"
                : "Estimativa da ficha técnica atual"}
            </p>
          </div>
          <div>
            <p className="muted">Custo dos brownies vendidos</p>
            <strong style={{ fontSize: 24 }}>{money(cost)}</strong>
            <p className="muted" style={{ fontSize: 12 }}>
              Custo histórico no momento da venda
            </p>
          </div>
          <div>
            <p className="muted">Margem de contribuição</p>
            <strong style={{ fontSize: 24 }}>{money(margin)}</strong>
            <p className="muted" style={{ fontSize: 12 }}>
              {net
                ? `${((margin / net) * 100).toFixed(1).replace(".", ",")}% do faturamento líquido`
                : "Faturamento líquido menos custo vendido"}
            </p>
          </div>
          <div>
            <p className="muted">Resultado operacional estimado</p>
            <strong style={{ fontSize: 24 }}>{money(margin - operating)}</strong>
            <p className="muted" style={{ fontSize: 12 }}>
              Margem menos demais despesas operacionais
            </p>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 24 }}>
          A estimativa usa os custos registrados nas vendas e exclui das demais despesas
          as compras de estoque, a categoria Ingredientes e Equipamentos. Ajustes
          posteriores no saldo são apresentados separadamente abaixo. Produzir ou vender
          consome estoque; não cria outra saída de caixa.
        </p>
      </Card>
      <div className="grid-3">
        <Stat
          label="Descontos nas vendas"
          value={money(saleDiscounts)}
          hint="Já deduzidos do faturamento líquido"
        />
        <Stat
          label="Descontos após a venda"
          value={money(
            -adjustments
              .filter((a) => a.amount_cents < 0)
              .reduce((n, a) => n + a.amount_cents, 0),
          )}
          hint={`Acréscimos no saldo: ${money(adjustments.filter((a) => a.amount_cents > 0).reduce((n, a) => n + a.amount_cents, 0))}`}
        />
        <Stat
          label="Custo da produção no período"
          value={money(batches.reduce((n, b) => n + b.total_cost_cents, 0))}
          hint={`${batches.reduce((n, b) => n + b.actual_quantity, 0)} brownies produzidos · custo de estoque`}
        />
      </div>
      <div className="grid-2">
        <Card>
          <h2 className="section-title" style={{ marginBottom: 16 }}>
            Quem mais comprou
          </h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Compras dentro do período selecionado
          </p>
          {top.length ? (
            top.map((c, i) => (
              <div className="list-row" key={c.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="muted">{String(i + 1).padStart(2, "0")}</span>
                  <Link to={`/clientes/${c.id}`}>
                    <strong>{c.name}</strong>
                    <small className="muted" style={{ display: "block" }}>
                      {c.units} brownies
                    </small>
                  </Link>
                </div>
                <strong>{money(c.revenue)}</strong>
              </div>
            ))
          ) : (
            <Empty title="Nenhuma compra de cliente no período" />
          )}
        </Card>
        <Card>
          <h2 className="section-title" style={{ marginBottom: 16 }}>
            Maiores saldos pendentes
          </h2>
          <p className="muted" style={{ marginBottom: 20 }}>
            Saldo atual de todo o histórico
          </p>
          {debtors.length ? (
            debtors.map((c, i) => (
              <div className="list-row" key={c.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="muted">{String(i + 1).padStart(2, "0")}</span>
                  <Link to={`/clientes/${c.id}`}>
                    <strong>{c.name}</strong>
                  </Link>
                </div>
                <strong>{money(c.balance)}</strong>
              </div>
            ))
          ) : (
            <Empty title="Nenhum cliente com saldo pendente" />
          )}
        </Card>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        CSV: vendas e recebimentos incluem os registros cancelados e estornados
        identificados. Clientes exporta todos os cadastros, com compras do período e saldo
        atual. Saldos pendentes refletem todos os pagamentos e ajustes registrados até
        agora.
      </p>
    </div>
  );
}
