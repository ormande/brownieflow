import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUpRight, MessageCircle, Pencil, Wallet } from "lucide-react";
import {
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Stat,
  Textarea,
} from "../components/ui";
import { useAction, useAppData } from "../lib/data";
import { saleBalance, salePaid } from "../lib/finance";
import { dateLabel, money, toCents, today } from "../lib/format";
import type { Sale } from "../types";
import PaymentForm, { type PaymentPreset } from "../components/finance/PaymentForm";
import {
  amountSchema,
  customerName,
  dateSchema,
  LoadingData,
  saleQuantity,
  StatusBadge,
  whatsappUrl,
} from "../components/finance/shared";
import { useRequestIdentity } from "../components/finance/requestIdentity";

const schema = z.object({
  direction: z.enum(["discount", "increase"]),
  amount: amountSchema,
  adjustment_date: dateSchema,
  reason: z.string().trim().min(3, "Explique o motivo do ajuste").max(500),
});
type AdjustmentValues = z.infer<typeof schema>;
const daysLate = (due: string | null) =>
  due && due < today()
    ? Math.floor(
        (new Date(`${today()}T12:00:00Z`).getTime() -
          new Date(`${due}T12:00:00Z`).getTime()) /
          86400000,
      )
    : 0;
export default function Receivables() {
  const { data } = useAppData();
  const action = useAction();
  const [filter, setFilter] = useState("open");
  const [customer, setCustomer] = useState("all");
  const [payment, setPayment] = useState(false);
  const [preset, setPreset] = useState<PaymentPreset>();
  const [adjusting, setAdjusting] = useState<Sale>();
  const requestIdentity = useRequestIdentity();
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<AdjustmentValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      direction: "discount",
      amount: "",
      adjustment_date: today(),
      reason: "",
    },
  });
  const adjustmentValues = watch();
  const submit = handleSubmit(async (values) => {
    if (!adjusting || !data || submitting.current) return;
    const currentSale = data.sales.find((s) => s.id === adjusting.id);
    if (!currentSale || currentSale.cancelled_at) return;
    const amount = toCents(values.amount) * (values.direction === "discount" ? -1 : 1);
    if (amount < 0 && Math.abs(amount) > saleBalance(currentSale, data)) {
      setError("amount", {
        message: `O desconto máximo é ${money(saleBalance(currentSale, data))}`,
      });
      return;
    }
    const payload = {
      sale_id: adjusting.id,
      amount_cents: amount,
      reason: values.reason,
      adjustment_date: values.adjustment_date,
    };
    submitting.current = true;
    try {
      await action.run("adjust_receivable", {
        ...payload,
        request_id: requestIdentity.forPayload(payload),
      });
      requestIdentity.clear();
      setAdjusting(undefined);
      reset();
    } catch {
      /* Keep form open on failure. */
    } finally {
      submitting.current = false;
    }
  });
  if (!data) return <LoadingData />;
  const active = data.sales.filter(
    (s) =>
      !s.cancelled_at && (customer === "all" || (s.customer_id || "none") === customer),
  );
  const open = active.filter((s) => saleBalance(s, data) > 0);
  const overdue = open.filter((s) => s.due_date && s.due_date < today());
  const dueToday = open.filter((s) => s.due_date === today());
  const sales = active
    .filter(
      (s) =>
        (customer === "all" || (s.customer_id || "none") === customer) &&
        (filter === "all" ||
          (filter === "open" && saleBalance(s, data) > 0) ||
          (filter === "today" && s.due_date === today() && saleBalance(s, data) > 0) ||
          (filter === "overdue" &&
            Boolean(s.due_date && s.due_date < today()) &&
            saleBalance(s, data) > 0) ||
          (filter === "partial" &&
            salePaid(s.id, data) > 0 &&
            saleBalance(s, data) > 0) ||
          (filter === "paid" && saleBalance(s, data) <= 0)),
    )
    .sort(
      (a, b) =>
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
        a.sale_date.localeCompare(b.sale_date),
    );
  const debtors = data.customers
    .map((c) => ({
      ...c,
      balance: open
        .filter((s) => s.customer_id === c.id)
        .reduce((n, s) => n + saleBalance(s, data), 0),
    }))
    .filter((c) => c.balance > 0 && (customer === "all" || customer === c.id))
    .sort((a, b) => b.balance - a.balance);
  const receive = (next: PaymentPreset) => {
    setPreset(next);
    setPayment(true);
  };
  return (
    <div className="stack">
      <PageHeader
        title="Contas a receber"
        description="Acompanhe os saldos e cobre com tranquilidade."
        action={
          <Button onClick={() => receive({})}>
            <Wallet size={18} /> Registrar recebimento
          </Button>
        }
      />
      <div className="grid-4">
        <Stat
          label="Total a receber"
          value={money(open.reduce((n, s) => n + saleBalance(s, data), 0))}
          hint={`${debtors.length} clientes com saldo em aberto`}
        />
        <Stat
          label="Valores vencidos"
          value={money(overdue.reduce((n, s) => n + saleBalance(s, data), 0))}
          hint={`${overdue.length} vendas atrasadas`}
        />
        <Stat
          label="Vencendo hoje"
          value={money(dueToday.reduce((n, s) => n + saleBalance(s, data), 0))}
        />
        <Stat
          label="Brownies em vendas abertas"
          value={open.reduce((n, s) => n + saleQuantity(s.id, data), 0)}
          hint="Quantidade original das vendas com saldo"
        />
      </div>
      <Card>
        <div className="toolbar">
          <Field label="Situação">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="open">Em aberto</option>
              <option value="all">Todos</option>
              <option value="today">Vencendo hoje</option>
              <option value="overdue">Atrasados</option>
              <option value="partial">Parcialmente pagos</option>
              <option value="paid">Quitados</option>
            </Select>
          </Field>
          <Field label="Cliente">
            <Select value={customer} onChange={(e) => setCustomer(e.target.value)}>
              <option value="all">Todos os clientes</option>
              <option value="none">Sem cliente</option>
              {data.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      {debtors.length > 0 && filter !== "paid" && (
        <Card>
          <div className="list-row" style={{ marginBottom: 16 }}>
            <h2 className="section-title">Saldo por cliente</h2>
            <span className="muted">Saldo total atual</span>
          </div>
          {debtors.map((c) => (
            <div className="list-row" key={c.id} style={{ gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 130 }}>
                <Link to={`/clientes/${c.id}`}>
                  <strong>{c.name}</strong>
                </Link>
                <small className="muted" style={{ display: "block", marginTop: 4 }}>
                  {c.phone || "Sem telefone cadastrado"}
                </small>
              </div>
              <strong className="amount">{money(c.balance)}</strong>
              <div className="toolbar" style={{ gap: 6 }}>
                {c.phone && (
                  <Button variant="secondary" size="sm" asChild>
                    <a
                      href={whatsappUrl(
                        c.phone,
                        c.name,
                        c.balance,
                        data.profiles[0]?.whatsapp_template,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir WhatsApp para revisar e enviar a cobrança"
                    >
                      <MessageCircle size={16} /> Cobrar
                    </a>
                  </Button>
                )}
                <Button size="sm" onClick={() => receive({ customer_id: c.id })}>
                  Receber <ArrowUpRight size={15} />
                </Button>
              </div>
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            A cobrança abre o WhatsApp com uma mensagem pronta. Revise e envie
            manualmente.
          </p>
        </Card>
      )}
      <Card>
        <h2 className="section-title" style={{ marginBottom: 20 }}>
          Vendas e vencimentos
        </h2>
        {sales.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente / venda</th>
                  <th>Vencimento</th>
                  <th>Brownies</th>
                  <th>Pago</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{customerName(s.customer_id, data)}</strong>
                      <small className="muted" style={{ display: "block" }}>
                        {dateLabel(s.sale_date)} ·{" "}
                        {s.modality === "credit" ? "Fiado" : "À vista"}
                      </small>
                    </td>
                    <td>
                      {dateLabel(s.due_date)}
                      {daysLate(s.due_date) > 0 && saleBalance(s, data) > 0 && (
                        <small style={{ display: "block", color: "var(--red)" }}>
                          {daysLate(s.due_date)} dias de atraso
                        </small>
                      )}
                    </td>
                    <td>{saleQuantity(s.id, data)} un.</td>
                    <td>{money(salePaid(s.id, data))}</td>
                    <td className="amount">{money(saleBalance(s, data))}</td>
                    <td>
                      <StatusBadge sale={s} data={data} />
                    </td>
                    <td>
                      <div className="toolbar" style={{ gap: 4 }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Ajustar saldo"
                          title="Desconto ou ajuste de saldo"
                          onClick={() => {
                            reset({
                              direction: "discount",
                              amount: "",
                              reason: "",
                              adjustment_date: today(),
                            });
                            setAdjusting(s);
                          }}
                        >
                          <Pencil size={16} />
                        </Button>
                        {saleBalance(s, data) > 0 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              receive({ customer_id: s.customer_id, sale_ids: [s.id] })
                            }
                          >
                            Receber
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              filter === "open"
                ? "Nenhuma cobrança em aberto"
                : "Nenhuma venda neste filtro"
            }
            description="Os saldos são calculados com base nos pagamentos e ajustes registrados."
          />
        )}
      </Card>
      <PaymentForm open={payment} onOpenChange={setPayment} preset={preset} />
      <Modal
        open={Boolean(adjusting)}
        onOpenChange={(v) => {
          if (!v) setAdjusting(undefined);
        }}
        title="Ajustar saldo da venda"
        description="O valor original da venda será preservado. O ajuste ficará registrado com seu motivo."
      >
        <form onSubmit={submit} className="stack">
          <div className="list-row">
            <span className="muted">Saldo atual</span>
            <strong>{money(adjusting ? saleBalance(adjusting, data) : 0)}</strong>
          </div>
          <Field label="Tipo de ajuste">
            <Select {...register("direction")}>
              <option value="discount">Conceder desconto</option>
              <option value="increase">Acrescentar valor ao saldo</option>
            </Select>
          </Field>
          <div className="form-grid">
            <Field label="Valor do ajuste (R$)" error={errors.amount?.message}>
              <Input inputMode="decimal" {...register("amount")} />
            </Field>
            <Field label="Data" error={errors.adjustment_date?.message}>
              <Input type="date" {...register("adjustment_date")} />
            </Field>
          </div>
          <Field label="Justificativa" error={errors.reason?.message}>
            <Textarea
              {...register("reason")}
              placeholder="Por que este saldo está sendo alterado?"
            />
          </Field>
          <Card style={{ padding: 16 }}>
            <div className="list-row">
              <span>Novo saldo</span>
              <strong>
                {money(
                  (adjusting ? saleBalance(adjusting, data) : 0) +
                    toCents(adjustmentValues.amount || "0") *
                      (adjustmentValues.direction === "discount" ? -1 : 1),
                )}
              </strong>
            </div>
          </Card>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setAdjusting(undefined)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={action.pending}>
              {action.pending ? "Salvando…" : "Confirmar ajuste"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
