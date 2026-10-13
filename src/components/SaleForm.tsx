import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, ShoppingBag } from "lucide-react";
import { Button, Card, Field, Input, Modal, Select, Textarea } from "./ui";
import { useAction, useAppData } from "../lib/data";
import { addDays, money, toCents, today } from "../lib/format";
import CustomerForm from "./finance/CustomerForm";
import {
  amountSchema,
  dateSchema,
  matchesCustomer,
  paymentMethods,
  validMoney,
} from "./finance/shared";
import { useRequestIdentity } from "./finance/requestIdentity";

const schema = z
  .object({
    customer_id: z.string(),
    product_id: z.string().min(1, "Selecione um produto"),
    quantity: z
      .string()
      .refine(
        (v) =>
          /^\d+$/.test(v) &&
          Number.isSafeInteger(Number(v)) &&
          Number(v) > 0 &&
          Number(v) <= 2147483647,
        "Informe uma quantidade inteira válida maior que zero",
      ),
    modality: z.enum(["cash", "credit"]),
    price: amountSchema,
    discount_mode: z.enum(["money", "percent"]),
    discount: z
      .string()
      .trim()
      .refine((v) => validMoney(v, true), "Desconto inválido"),
    sale_date: dateSchema,
    due_date: z.union([z.literal(""), dateSchema]),
    notes: z.string().max(2000),
    payment_mode: z.enum(["none", "full", "partial"]),
    payment_amount: z.string(),
    method: z.enum(["pix", "cash", "card", "transfer", "other"]),
  })
  .superRefine((v, ctx) => {
    if (v.modality === "credit" && !v.customer_id)
      ctx.addIssue({
        code: "custom",
        path: ["customer_id"],
        message: "Escolha um cliente para vender fiado",
      });
    const gross = Number(v.quantity) * toCents(v.price);
    if (!Number.isSafeInteger(gross))
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: "O total da venda excede o limite permitido",
      });
    const discount =
      v.discount_mode === "percent"
        ? Math.round((gross * Number(v.discount.replace(",", "."))) / 100)
        : toCents(v.discount);
    if (
      discount > gross ||
      (v.discount_mode === "percent" && Number(v.discount.replace(",", ".")) > 100)
    )
      ctx.addIssue({
        code: "custom",
        path: ["discount"],
        message: "O desconto não pode superar o total",
      });
    if (v.due_date && v.due_date < v.sale_date)
      ctx.addIssue({
        code: "custom",
        path: ["due_date"],
        message: "O vencimento deve ser igual ou posterior à venda",
      });
    if (v.modality === "credit" && !v.due_date)
      ctx.addIssue({
        code: "custom",
        path: ["due_date"],
        message: "Informe o vencimento",
      });
    if (
      v.payment_mode === "partial" &&
      (!amountSchema.safeParse(v.payment_amount).success ||
        toCents(v.payment_amount) > gross - discount)
    )
      ctx.addIssue({
        code: "custom",
        path: ["payment_amount"],
        message: "Informe um pagamento maior que zero e até o total da venda",
      });
  });
type Values = z.infer<typeof schema>;

export default function SaleForm({
  open,
  onOpenChange,
  repeatSaleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repeatSaleId?: string;
}) {
  const { data } = useAppData();
  const action = useAction();
  const requestIdentity = useRequestIdentity();
  const submitting = useRef(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [quickCustomer, setQuickCustomer] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      product_id: "",
      quantity: "1",
      modality: "cash",
      price: "5.00",
      discount_mode: "money",
      discount: "0",
      sale_date: today(),
      due_date: "",
      notes: "",
      payment_mode: "none",
      payment_amount: "",
      method: "pix",
    },
  });
  const initialized = useRef(false);
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (!data || initialized.current) return;
    const sale = data.sales.find((s) => s.id === repeatSaleId);
    const item = sale && data.sale_items.find((i) => i.sale_id === sale.id);
    const product =
      data.products.find((p) => p.id === item?.product_id && p.active) ??
      data.products.find((p) => p.is_default && p.active) ??
      data.products.find((p) => p.active);
    const price =
      product?.id === item?.product_id
        ? item?.unit_price_cents
        : sale?.modality === "credit"
          ? product?.credit_price_cents
          : product?.cash_price_cents;
    reset({
      customer_id: sale?.customer_id ?? "",
      product_id: product?.id ?? "",
      quantity: String(item?.quantity ?? 1),
      modality: sale?.modality ?? "cash",
      price: ((price ?? 500) / 100).toFixed(2),
      discount_mode: "money",
      discount: ((sale?.discount_cents ?? 0) / 100).toFixed(2),
      sale_date: today(),
      due_date: addDays(today(), data.profiles[0]?.due_days ?? 7),
      notes: sale?.notes ?? "",
      payment_mode: "none",
      payment_amount: "",
      method: "pix",
    });
    setCustomerSearch("");
    initialized.current = true;
  }, [open, data, repeatSaleId, reset]);
  const values = watch();
  const product = data?.products.find((p) => p.id === values.product_id);
  const gross = Number(values.quantity || 0) * (toCents(values.price) || 0);
  const discount =
    values.discount_mode === "percent"
      ? Math.round((gross * Number((values.discount || "0").replace(",", "."))) / 100)
      : toCents(values.discount || "0");
  const total = Math.max(0, gross - (discount || 0));
  const paid =
    values.payment_mode === "full"
      ? total
      : values.payment_mode === "partial"
        ? toCents(values.payment_amount || "0")
        : 0;
  const clients = (data?.customers ?? []).filter(
    (c) => !c.archived && matchesCustomer(c, customerSearch),
  );
  const recent = [...(data?.sales ?? [])]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((s) => s.customer_id)
    .filter((id, i, all) => id && all.indexOf(id) === i)
    .slice(0, 4);
  function setProductOrMode(id: string, mode: "cash" | "credit") {
    setValue("product_id", id);
    setValue("modality", mode);
    const p = data?.products.find((item) => item.id === id);
    if (p)
      setValue(
        "price",
        ((mode === "credit" ? p.credit_price_cents : p.cash_price_cents) / 100).toFixed(
          2,
        ),
      );
  }
  const submit = handleSubmit(async (v) => {
    if (submitting.current) return;
    if (product && Number(v.quantity) > Number(product.stock)) {
      setError("quantity", { message: `Estoque disponível: ${product.stock} unidades` });
      return;
    }
    const grossCents = Number(v.quantity) * toCents(v.price);
    const discountCents =
      v.discount_mode === "percent"
        ? Math.round((grossCents * Number(v.discount.replace(",", "."))) / 100)
        : toCents(v.discount);
    const paymentCents =
      v.payment_mode === "full"
        ? grossCents - discountCents
        : v.payment_mode === "partial"
          ? toCents(v.payment_amount)
          : 0;
    const payload = {
      customer_id: v.customer_id || null,
      product_id: v.product_id,
      quantity: Number(v.quantity),
      modality: v.modality,
      unit_price_cents: toCents(v.price),
      discount_cents: discountCents,
      sale_date: v.sale_date,
      due_date: v.due_date || null,
      notes: v.notes,
      immediate_payment_cents: paymentCents,
      method: v.method,
    };
    submitting.current = true;
    try {
      await action.run("create_sale", {
        ...payload,
        request_id: requestIdentity.forPayload(payload),
      });
      requestIdentity.clear();
      onOpenChange(false);
    } catch {
      /* Keep entered values and request identity on a failed save. */
    } finally {
      submitting.current = false;
    }
  });
  return (
    <>
      <Modal
        open={open}
        onOpenChange={(next) => {
          if (!submitting.current) onOpenChange(next);
        }}
        title={repeatSaleId ? "Repetir venda" : "Nova venda"}
        description="Registre em poucos toques e volte para o que importa."
      >
        <form className="stack" onSubmit={submit}>
          <div>
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <label className="section-title">Cliente</label>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setQuickCustomer(true)}
              >
                <Plus size={15} /> Cadastrar
              </Button>
            </div>
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{ position: "absolute", left: 13, top: 13, opacity: 0.5 }}
              />
              <Input
                style={{ paddingLeft: 38 }}
                placeholder="Buscar nome ou telefone"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
              />
            </div>
            <Field label="Selecionar cliente" error={errors.customer_id?.message}>
              <Select {...register("customer_id")}>
                <option value="">Sem cliente</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </option>
                ))}
                {values.customer_id &&
                  !clients.some((c) => c.id === values.customer_id) && (
                    <option value={values.customer_id}>
                      {data?.customers.find((c) => c.id === values.customer_id)?.name ??
                        "Cliente selecionado"}
                    </option>
                  )}
              </Select>
            </Field>
            {!customerSearch && recent.length > 0 && (
              <div className="toolbar" style={{ gap: 6, marginTop: 8 }}>
                {recent.map((id) => {
                  const client = data?.customers.find((c) => c.id === id && !c.archived);
                  return (
                    client && (
                      <Button
                        key={id}
                        type="button"
                        size="sm"
                        variant={values.customer_id === id ? "default" : "secondary"}
                        onClick={() => setValue("customer_id", client.id)}
                      >
                        {client.name.split(" ")[0]}
                      </Button>
                    )
                  );
                })}
              </div>
            )}
          </div>
          <div className="form-grid">
            <Field label="Produto" error={errors.product_id?.message}>
              <Select
                value={values.product_id}
                onChange={(e) => setProductOrMode(e.target.value, values.modality)}
              >
                <option value="">Selecione</option>
                {data?.products
                  .filter((p) => p.active)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label="Quantidade"
              error={errors.quantity?.message}
              hint={product ? `${product.stock} disponíveis no estoque` : undefined}
            >
              <Input type="number" min="1" step="1" {...register("quantity")} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Modalidade">
              <Select
                value={values.modality}
                onChange={(e) =>
                  setProductOrMode(values.product_id, e.target.value as "cash" | "credit")
                }
              >
                <option value="cash">À vista</option>
                <option value="credit">Fiado</option>
              </Select>
            </Field>
            <Field label="Preço unitário (R$)" error={errors.price?.message}>
              <Input inputMode="decimal" {...register("price")} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Tipo de desconto">
              <Select {...register("discount_mode")}>
                <option value="money">Em reais (R$)</option>
                <option value="percent">Percentual (%)</option>
              </Select>
            </Field>
            <Field
              label={values.discount_mode === "money" ? "Desconto (R$)" : "Desconto (%)"}
              error={errors.discount?.message}
            >
              <Input inputMode="decimal" {...register("discount")} />
            </Field>
          </div>
          <Card style={{ padding: 18, background: "var(--green-light, #edf8ef)" }}>
            <div className="list-row">
              <span className="muted">Subtotal</span>
              <span>{money(gross)}</span>
            </div>
            {discount > 0 && (
              <div className="list-row">
                <span className="muted">Desconto</span>
                <span>− {money(discount)}</span>
              </div>
            )}
            <div className="list-row">
              <strong>Total da venda</strong>
              <strong className="amount" style={{ fontSize: 28 }}>
                {money(total)}
              </strong>
            </div>
          </Card>
          <div className="form-grid">
            <Field label="Data da venda" error={errors.sale_date?.message}>
              <Input
                type="date"
                {...register("sale_date")}
                onChange={(e) => {
                  const days = data?.profiles[0]?.due_days ?? 7;
                  if (
                    dateSchema.safeParse(e.target.value).success &&
                    values.due_date === addDays(values.sale_date, days)
                  )
                    setValue("due_date", addDays(e.target.value, days));
                  setValue("sale_date", e.target.value, { shouldValidate: true });
                }}
              />
            </Field>
            <Field label="Vencimento" error={errors.due_date?.message}>
              <Input type="date" min={values.sale_date} {...register("due_date")} />
            </Field>
          </div>
          <Field
            label="Pagamento"
            hint="A modalidade define o preço. O saldo só é quitado ao registrar um pagamento."
          >
            <Select {...register("payment_mode")}>
              <option value="none">Deixar pendente</option>
              <option value="full">Recebi o valor total</option>
              <option value="partial">Recebi uma parte</option>
            </Select>
          </Field>
          {values.payment_mode !== "none" && (
            <div className="form-grid">
              {values.payment_mode === "partial" && (
                <Field label="Valor recebido (R$)" error={errors.payment_amount?.message}>
                  <Input inputMode="decimal" {...register("payment_amount")} />
                </Field>
              )}
              <Field label="Forma de pagamento">
                <Select {...register("method")}>
                  {paymentMethods.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {values.payment_mode !== "none" && (
            <p className="muted" style={{ margin: 0 }}>
              Recebimento na data da venda. Saldo após o pagamento:{" "}
              <strong>{money(Math.max(0, total - (paid || 0)))}</strong>.
            </p>
          )}
          <Field label="Observações (opcional)">
            <Textarea
              rows={2}
              placeholder="Detalhes desta venda"
              {...register("notes")}
            />
          </Field>
          <div className="form-actions">
            <Button
              variant="secondary"
              type="button"
              disabled={action.pending}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={action.pending || !data}>
              <ShoppingBag size={17} />
              {action.pending ? "Registrando…" : "Registrar venda"}
            </Button>
          </div>
        </form>
      </Modal>
      <CustomerForm
        open={quickCustomer}
        onOpenChange={setQuickCustomer}
        onSaved={(id) => {
          setCustomerSearch("");
          setValue("customer_id", id, { shouldValidate: true });
        }}
      />
    </>
  );
}
