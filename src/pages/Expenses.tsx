import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  CustomSelect,
  DatePicker,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
  Textarea,
} from "../components/ui";
import { useAction, useAppData } from "../lib/data";
import { dateLabel, methodLabel, money, toCents, today } from "../lib/format";
import type { Expense } from "../types";
import {
  amountSchema,
  DateRange,
  dateSchema,
  inPeriod,
  LoadingData,
  monthStart,
  paymentMethods,
} from "../components/finance/shared";
import { useRequestIdentity } from "../components/finance/requestIdentity";

const categories = [
  "Ingredientes",
  "Embalagens",
  "Gás",
  "Energia elétrica",
  "Transporte",
  "Equipamentos",
  "Manutenção",
  "Outros",
] as const;
const schema = z.object({
  description: z.string().trim().min(3, "Descreva a despesa").max(200),
  category: z.enum(categories),
  amount: amountSchema,
  expense_date: dateSchema,
  method: z.enum(["pix", "cash", "card", "transfer", "other"]),
  supplier: z.string().max(150),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;
const emptyValues = (): Values => ({
  description: "",
  category: "Outros",
  amount: "",
  expense_date: today(),
  method: "pix",
  supplier: "",
  notes: "",
});
export default function Expenses() {
  const { data } = useAppData();
  const action = useAction();
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [category, setCategory] = useState("all");
  const [source, setSource] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense>();
  const requestIdentity = useRequestIdentity();
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: emptyValues() });
  const launch = (expense?: Expense) => {
    setEditing(expense);
    reset(
      expense
        ? {
            description: expense.description,
            category: expense.category,
            amount: (expense.amount_cents / 100).toFixed(2),
            expense_date: expense.expense_date,
            method: expense.method,
            supplier: expense.supplier ?? "",
            notes: expense.notes ?? "",
          }
        : emptyValues(),
    );
    setOpen(true);
  };
  const submit = handleSubmit(async (values) => {
    if (editing?.purchase_id || submitting.current) return;
    const { amount, ...valuesRow } = values;
    const row = { ...valuesRow, amount_cents: toCents(amount) };
    const id = editing?.id ?? requestIdentity.forPayload(row);
    submitting.current = true;
    try {
      await action.save(
        "expenses",
        { ...row, ...(editing ? {} : { id, purchase_id: null }) },
        editing?.id,
      );
      requestIdentity.clear();
      setOpen(false);
    } catch {
      /* The form stays available on failure. */
    } finally {
      submitting.current = false;
    }
  });
  if (!data) return <LoadingData />;
  const period = data.expenses.filter((e) => inPeriod(e.expense_date, start, end));
  const expenses = period
    .filter(
      (e) =>
        (category === "all" || e.category === category) &&
        (source === "all" ||
          (source === "purchase" && e.purchase_id) ||
          (source === "manual" && !e.purchase_id)),
    )
    .sort(
      (a, b) =>
        b.expense_date.localeCompare(a.expense_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const total = period.reduce((n, e) => n + e.amount_cents, 0);
  const purchases = period
    .filter((e) => e.purchase_id)
    .reduce((n, e) => n + e.amount_cents, 0);
  return (
    <div className="stack">
      <PageHeader
        title="Despesas"
        description="Clareza sobre cada saída do seu negócio."
        action={
          <div className="toolbar">
            <Button variant="secondary" asChild>
              <Link to="/estoque">Comprar insumos</Link>
            </Button>
            <Button onClick={() => launch()}>
              <Plus size={18} /> Nova despesa
            </Button>
          </div>
        }
      />
      <div className="grid-3">
        <Stat
          label="Despesas no período"
          value={money(total)}
          hint={`${period.length} lançamentos`}
          icon={<Receipt size={19} />}
        />
        <Stat
          label="Compras de insumos"
          value={money(purchases)}
          hint="Geradas automaticamente pelas compras"
        />
        <Stat
          label="Outras despesas"
          value={money(total - purchases)}
          hint="Lançamentos manuais"
        />
      </div>
      <Card>
        <div className="toolbar">
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <Field label="Categoria">
            <CustomSelect
              value={category}
              onChange={setCategory}
              options={[
                { value: "all", label: "Todas as categorias" },
                ...categories.map((value) => ({ value, label: value })),
              ]}
            />
          </Field>
          <Field label="Origem">
            <CustomSelect
              value={source}
              onChange={setSource}
              options={[
                { value: "all", label: "Todos os lançamentos" },
                { value: "purchase", label: "Compras de insumos" },
                { value: "manual", label: "Despesas manuais" },
              ]}
            />
          </Field>
        </div>
      </Card>
      <Card>
        {expenses.length ? (
          <>
            <div className="list-row" style={{ marginBottom: 20 }}>
              <h2 className="section-title">Lançamentos</h2>
              <strong>{money(expenses.reduce((n, e) => n + e.amount_cents, 0))}</strong>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Descrição / data</th>
                    <th>Categoria</th>
                    <th>Fornecedor</th>
                    <th>Forma</th>
                    <th>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.description}</strong>
                        <small
                          className="muted"
                          style={{ display: "block", marginTop: 4 }}
                        >
                          {dateLabel(e.expense_date)}
                        </small>
                        {e.purchase_id && <Badge>Compra vinculada</Badge>}
                        {e.notes && (
                          <small
                            className="muted"
                            style={{ display: "block", maxWidth: 240 }}
                          >
                            {e.notes}
                          </small>
                        )}
                      </td>
                      <td>{e.category}</td>
                      <td>{e.supplier || "—"}</td>
                      <td>{methodLabel[e.method]}</td>
                      <td className="amount">{money(e.amount_cents)}</td>
                      <td>
                        {e.purchase_id ? (
                          <span className="muted" style={{ fontSize: 12 }}>
                            Registro da compra
                          </span>
                        ) : (
                          <div className="toolbar" style={{ gap: 4 }}>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Editar ${e.description}`}
                              onClick={() => launch(e)}
                            >
                              <Pencil size={16} />
                            </Button>
                            <ConfirmButton
                              variant="ghost"
                              title="Excluir despesa?"
                              description={`O lançamento de ${money(e.amount_cents)} será removido do fluxo de caixa.`}
                              onConfirm={() => action.remove("expenses", e.id)}
                            >
                              <Trash2 size={16} />
                              <span className="sr-only">Excluir despesa</span>
                            </ConfirmButton>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Empty
            title="Nenhuma despesa neste período"
            description="Registre os gastos da operação e acompanhe para onde vai seu dinheiro."
            action={<Button onClick={() => launch()}>Registrar despesa</Button>}
          />
        )}
      </Card>
      <Card>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          Despesas por categoria no período
        </h2>
        {categories
          .map((c) => ({
            category: c,
            amount: period
              .filter((e) => e.category === c)
              .reduce((n, e) => n + e.amount_cents, 0),
          }))
          .filter((c) => c.amount > 0)
          .map((c) => (
            <div key={c.category} style={{ marginBottom: 18 }}>
              <div className="list-row">
                <span>{c.category}</span>
                <strong>{money(c.amount)}</strong>
              </div>
              <div
                style={{
                  height: 6,
                  borderRadius: 8,
                  background: "var(--border, #e8eae8)",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(c.amount / total) * 100}%`,
                    borderRadius: 8,
                    background: "var(--green)",
                  }}
                />
              </div>
            </div>
          ))}
        {!period.length && (
          <p className="muted">
            As categorias aparecerão conforme você registrar despesas.
          </p>
        )}
        <p className="muted" style={{ fontSize: 12 }}>
          Compras de insumos já geram uma despesa vinculada. Não as lance novamente. O
          custo de produção é acompanhado separadamente, sem duplicar saídas de caixa.
        </p>
      </Card>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={editing ? "Editar despesa" : "Nova despesa"}
        description="Para atualizar o estoque de ingredientes, registre uma compra na página Estoque."
      >
        <form onSubmit={submit} className="stack">
          <Field label="Descrição" error={errors.description?.message}>
            <Input
              autoFocus
              placeholder="Ex.: embalagens para entrega"
              {...register("description")}
            />
          </Field>
          <div className="form-grid">
            <Field label="Categoria">
              <CustomSelect
                value={watch("category")}
                onChange={(value) =>
                  setValue("category", value as Values["category"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                options={categories.map((value) => ({ value, label: value }))}
              />
            </Field>
            <Field label="Valor (R$)" error={errors.amount?.message}>
              <Input inputMode="decimal" placeholder="0,00" {...register("amount")} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Data" error={errors.expense_date?.message}>
              <DatePicker
                value={watch("expense_date")}
                onChange={(value) =>
                  setValue("expense_date", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </Field>
            <Field label="Forma de pagamento">
              <CustomSelect
                value={watch("method")}
                onChange={(value) =>
                  setValue("method", value as Values["method"], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
                options={paymentMethods.map(([value, label]) => ({ value, label }))}
              />
            </Field>
          </div>
          <Field label="Fornecedor (opcional)">
            <Input {...register("supplier")} />
          </Field>
          <Field label="Observações">
            <Textarea rows={2} {...register("notes")} />
          </Field>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={action.pending}>
              {action.pending ? "Salvando…" : "Salvar despesa"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
