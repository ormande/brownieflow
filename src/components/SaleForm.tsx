import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, ShoppingBag } from "lucide-react";
import {
  Button,
  Card,
  CustomerCombobox,
  CustomSelect,
  DatePicker,
  Field,
  Input,
  Modal,
  Textarea,
} from "./ui";
import { useAction, useAppData } from "../lib/data";
import { addDays, maskMoney, money, toCents, today } from "../lib/format";
import CustomerForm from "./finance/CustomerForm";
import { amountSchema, dateSchema, paymentMethods, validMoney } from "./finance/shared";
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
      price: "R$ 5,00",
      discount_mode: "money",
      discount: "R$ 0,00",
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
      price: money(price ?? 500),
      discount_mode: "money",
      discount: money(sale?.discount_cents ?? 0),
      sale_date: today(),
      due_date: addDays(today(), data.profiles[0]?.due_days ?? 7),
      notes: sale?.notes ?? "",
      payment_mode: "none",
      payment_amount: "",
      method: "pix",
    });
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

  function setProductOrMode(id: string, mode: "cash" | "credit") {
    setValue("product_id", id, { shouldValidate: true });
    setValue("modality", mode, { shouldValidate: true });
    const p = data?.products.find((item) => item.id === id);
    if (p) {
      const cents = mode === "credit" ? p.credit_price_cents : p.cash_price_cents;
      setValue("price", money(cents), { shouldValidate: true });
    }
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
            <div
              className="toolbar"
              style={{ justifyContent: "space-between", marginBottom: 6 }}
            >
              <label className="field-label" style={{ margin: 0 }}>
                Cliente
              </label>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setQuickCustomer(true)}
              >
                <Plus size={15} /> Cadastrar
              </Button>
            </div>
            <CustomerCombobox
              value={values.customer_id}
              onChange={(id) => setValue("customer_id", id, { shouldValidate: true })}
              customers={data?.customers ?? []}
            />
            {errors.customer_id?.message && (
              <span
                className="field-error"
                role="alert"
                style={{ marginTop: 4, display: "block" }}
              >
                {errors.customer_id.message}
              </span>
            )}
          </div>

          <div className="form-grid">
            <Field label="Produto" error={errors.product_id?.message}>
              <CustomSelect
                value={values.product_id}
                onChange={(id) => setProductOrMode(id, values.modality)}
                placeholder="Selecione o produto"
                options={(data?.products ?? [])
                  .filter((p) => p.active)
                  .map((p) => ({ value: p.id, label: p.name }))}
              />
            </Field>
            <Field
              label="Quantidade"
              error={errors.quantity?.message}
              hint={product ? `${product.stock} disponíveis no estoque` : undefined}
            >
              <Input
                type="number"
                min="1"
                step="1"
                placeholder="1"
                {...register("quantity")}
              />
            </Field>
          </div>

          <div className="form-grid">
            <Field label="Modalidade">
              <CustomSelect
                value={values.modality}
                onChange={(mode) =>
                  setProductOrMode(values.product_id, mode as "cash" | "credit")
                }
                options={[
                  { value: "cash", label: "À vista" },
                  { value: "credit", label: "Fiado" },
                ]}
              />
            </Field>
            <Field label="Preço unitário" error={errors.price?.message}>
              <Input
                inputMode="numeric"
                placeholder="R$ 5,00"
                {...register("price")}
                onChange={(e) => {
                  const formatted = maskMoney(e.target.value);
                  setValue("price", formatted || "R$ 0,00", { shouldValidate: true });
                }}
              />
            </Field>
          </div>

          <div className="form-grid">
            <Field label="Tipo de desconto">
              <CustomSelect
                value={values.discount_mode}
                onChange={(mode) => {
                  const m = mode as "money" | "percent";
                  setValue("discount_mode", m);
                  setValue("discount", m === "money" ? "R$ 0,00" : "0", {
                    shouldValidate: true,
                  });
                }}
                options={[
                  { value: "money", label: "Em reais (R$)" },
                  { value: "percent", label: "Percentual (%)" },
                ]}
              />
            </Field>
            <Field
              label={values.discount_mode === "money" ? "Desconto" : "Desconto (%)"}
              error={errors.discount?.message}
            >
              <Input
                inputMode={values.discount_mode === "money" ? "numeric" : "decimal"}
                placeholder={values.discount_mode === "money" ? "R$ 0,00" : "0%"}
                {...register("discount")}
                onChange={(e) => {
                  if (values.discount_mode === "money") {
                    const formatted = maskMoney(e.target.value);
                    setValue("discount", formatted || "R$ 0,00", {
                      shouldValidate: true,
                    });
                  } else {
                    const val = e.target.value.replace(/[^\d.,]/g, "");
                    setValue("discount", val, { shouldValidate: true });
                  }
                }}
              />
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
              <DatePicker
                value={values.sale_date}
                onChange={(date) => {
                  const days = data?.profiles[0]?.due_days ?? 7;
                  if (date && values.due_date === addDays(values.sale_date, days)) {
                    setValue("due_date", addDays(date, days));
                  }
                  setValue("sale_date", date, { shouldValidate: true });
                }}
              />
            </Field>
            <Field label="Vencimento" error={errors.due_date?.message}>
              <DatePicker
                value={values.due_date}
                min={values.sale_date}
                onChange={(date) => setValue("due_date", date, { shouldValidate: true })}
              />
            </Field>
          </div>

          <Field
            label="Pagamento"
            hint="A modalidade define o preço. O saldo só é quitado ao registrar um pagamento."
          >
            <CustomSelect
              value={values.payment_mode}
              onChange={(mode) =>
                setValue("payment_mode", mode as any, { shouldValidate: true })
              }
              options={[
                { value: "none", label: "Deixar pendente" },
                { value: "full", label: "Recebi o valor total" },
                { value: "partial", label: "Recebi uma parte" },
              ]}
            />
          </Field>

          {values.payment_mode !== "none" && (
            <div className="form-grid">
              {values.payment_mode === "partial" && (
                <Field label="Valor recebido" error={errors.payment_amount?.message}>
                  <Input
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    {...register("payment_amount")}
                    onChange={(e) => {
                      const formatted = maskMoney(e.target.value);
                      setValue("payment_amount", formatted, { shouldValidate: true });
                    }}
                  />
                </Field>
              )}
              <Field label="Forma de pagamento">
                <CustomSelect
                  value={values.method}
                  onChange={(method) =>
                    setValue("method", method as any, { shouldValidate: true })
                  }
                  options={paymentMethods.map(([key, label]) => ({
                    value: key,
                    label,
                  }))}
                />
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
          setValue("customer_id", id, { shouldValidate: true });
        }}
      />
    </>
  );
}
