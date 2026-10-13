import { useState } from "react";
import { Plus, Search, ShoppingBag, Wallet, Tag } from "lucide-react";
import {
  Button,
  Card,
  CustomSelect,
  Empty,
  Field,
  Input,
  PageHeader,
  Stat,
} from "../components/ui";
import { useAppData } from "../lib/data";
import { money, today } from "../lib/format";
import { saleBalance, salePaid, saleStatus } from "../lib/finance";
import type { Sale } from "../types";
import SaleForm from "../components/SaleForm";
import PaymentForm, { type PaymentPreset } from "../components/finance/PaymentForm";
import SaleTable from "../components/finance/SaleTable";
import SaleDetail from "../components/finance/SaleDetail";
import {
  customerName,
  DateRange,
  inPeriod,
  LoadingData,
  matchesCustomer,
  monthStart,
  saleQuantity,
} from "../components/finance/shared";

export default function Sales() {
  const { data } = useAppData();
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [modality, setModality] = useState("all");
  const [open, setOpen] = useState(false);
  const [repeat, setRepeat] = useState<string>();
  const [detail, setDetail] = useState<Sale>();
  const [payment, setPayment] = useState(false);
  const [preset, setPreset] = useState<PaymentPreset>();
  if (!data) return <LoadingData />;
  const period = data.sales.filter((s) => inPeriod(s.sale_date, start, end));
  const active = period.filter((s) => !s.cancelled_at);
  const sales = period
    .filter(
      (s) =>
        matchesCustomer(
          data.customers.find((c) => c.id === s.customer_id) ?? {
            name: customerName(s.customer_id, data),
            phone: "",
          },
          search,
        ) &&
        (status === "all" ||
          (status === "partial"
            ? !s.cancelled_at && salePaid(s.id, data) > 0 && saleBalance(s, data) > 0
            : saleStatus(s, data) === status)) &&
        (modality === "all" || s.modality === modality),
    )
    .sort(
      (a, b) =>
        b.sale_date.localeCompare(a.sale_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const newSale = () => {
    setRepeat(undefined);
    setOpen(true);
  };
  return (
    <div className="stack">
      <PageHeader
        title="Vendas"
        description="Cada brownie vendido, cada detalhe no lugar."
        action={
          <Button onClick={newSale}>
            <Plus size={18} /> Nova venda
          </Button>
        }
      />
      <div className="grid-4">
        <Stat
          label="Faturamento no período"
          value={money(active.reduce((n, s) => n + s.total_cents, 0))}
          hint="Após os descontos da venda"
          icon={<ShoppingBag size={19} />}
        />
        <Stat
          label="Brownies vendidos"
          value={active.reduce((n, s) => n + saleQuantity(s.id, data), 0)}
          hint={`${active.length} vendas realizadas`}
        />
        <Stat
          label="Saldo destas vendas"
          value={money(active.reduce((n, s) => n + saleBalance(s, data), 0))}
          hint="Saldo atual, considerando pagamentos"
          icon={<Wallet size={19} />}
        />
        <Stat
          label="Descontos na venda"
          value={money(active.reduce((n, s) => n + s.discount_cents, 0))}
          icon={<Tag size={19} />}
        />
      </div>
      <Card>
        <div className="toolbar">
          <Field label="Pesquisar">
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{ position: "absolute", top: 13, left: 12, opacity: 0.5 }}
              />
              <Input
                style={{ paddingLeft: 36 }}
                placeholder="Nome ou telefone do cliente"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Field>
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <Field label="Situação">
            <CustomSelect
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "Todas" },
                { value: "pending", label: "Pendentes" },
                { value: "partial", label: "Parciais" },
                { value: "overdue", label: "Atrasadas" },
                { value: "paid", label: "Quitadas" },
                { value: "cancelled", label: "Canceladas" },
              ]}
            />
          </Field>
          <Field label="Modalidade">
            <CustomSelect
              value={modality}
              onChange={setModality}
              options={[
                { value: "all", label: "Todas" },
                { value: "cash", label: "À vista" },
                { value: "credit", label: "Fiado" },
              ]}
            />
          </Field>
        </div>
      </Card>
      <Card>
        {sales.length ? (
          <>
            <div className="list-row" style={{ marginBottom: 20 }}>
              <h2 className="section-title">Histórico de vendas</h2>
              <span className="muted">{sales.length} registros</span>
            </div>
            <SaleTable
              sales={sales}
              data={data}
              onView={setDetail}
              onRepeat={(s) => {
                setRepeat(s.id);
                setOpen(true);
              }}
              onPay={(s) => {
                setPreset({ customer_id: s.customer_id, sale_ids: [s.id] });
                setPayment(true);
              }}
            />
          </>
        ) : (
          <Empty
            title="Nenhuma venda por aqui"
            description={
              data.sales.length
                ? "Altere a pesquisa ou o período para encontrar suas vendas."
                : "Registre sua primeira venda para começar a acompanhar o movimento."
            }
            action={
              <Button onClick={newSale}>
                <Plus size={17} /> Registrar venda
              </Button>
            }
          />
        )}
      </Card>
      <SaleForm open={open} onOpenChange={setOpen} repeatSaleId={repeat} />
      <PaymentForm open={payment} onOpenChange={setPayment} preset={preset} />
      <SaleDetail
        sale={detail && data.sales.find((s) => s.id === detail.id)}
        data={data}
        onClose={() => setDetail(undefined)}
      />
    </div>
  );
}
