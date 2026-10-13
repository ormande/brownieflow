import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Button, Card, Field, Input, Modal, Select, Textarea } from "../ui";
import { useAction, useAppData } from "../../lib/data";
import { saleBalance } from "../../lib/finance";
import { dateLabel, money, toCents, today } from "../../lib/format";
import { amountSchema, dateSchema, paymentMethods } from "./shared";
import { useRequestIdentity } from "./requestIdentity";

const schema = z.object({
  customer_id: z.string(),
  amount: amountSchema,
  payment_date: dateSchema,
  method: z.enum(["pix", "cash", "card", "transfer", "other"]),
  notes: z.string().max(2000),
  allocation: z.enum(["fifo", "selected", "unlinked"]),
});
type Values = z.infer<typeof schema>;
export interface PaymentPreset {
  customer_id?: string | null;
  amount_cents?: number;
  payment_date?: string;
  method?: Values["method"];
  notes?: string;
  sale_ids?: string[];
}
export default function PaymentForm({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preset?: PaymentPreset;
}) {
  const { data } = useAppData();
  const action = useAction();
  const requestIdentity = useRequestIdentity();
  const submitting = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState("");
  const initialized = useRef(false);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      amount: "",
      payment_date: today(),
      method: "pix",
      notes: "",
      allocation: "unlinked",
    },
  });
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (!data || initialized.current) return;
    const customerId = preset?.customer_id ?? "";
    const ids = preset?.sale_ids ?? [];
    const debt = data.sales
      .filter(
        (s) =>
          !s.cancelled_at &&
          (ids.length
            ? ids.includes(s.id)
            : Boolean(customerId) && s.customer_id === customerId),
      )
      .reduce((sum, s) => sum + saleBalance(s, data), 0);
    reset({
      customer_id: customerId,
      amount:
        preset?.amount_cents || debt
          ? ((preset?.amount_cents ?? debt) / 100).toFixed(2)
          : "",
      payment_date: preset?.payment_date ?? today(),
      method: preset?.method ?? "pix",
      notes: preset?.notes ?? "",
      allocation: ids.length ? "selected" : customerId ? "fifo" : "unlinked",
    });
    setSelected(ids);
    setSelectionError("");
    initialized.current = true;
  }, [open, data, preset, reset]);
  const values = watch();
  const eligible =
    data?.sales
      .filter(
        (s) =>
          !s.cancelled_at &&
          s.customer_id === (values.customer_id || null) &&
          saleBalance(s, data) > 0,
      )
      .sort(
        (a, b) =>
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
          a.sale_date.localeCompare(b.sale_date) ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id),
      ) ?? [];
  const balance = eligible
    .filter((s) => values.allocation !== "selected" || selected.includes(s.id))
    .reduce((n, s) => n + saleBalance(s, data!), 0);
  const submit = handleSubmit(async (v) => {
    if (submitting.current) return;
    const selectedIds = eligible
      .filter((s) => selected.includes(s.id))
      .map((s) => s.id)
      .sort();
    if (
      v.allocation === "selected" &&
      (selectedIds.length === 0 || selectedIds.length !== selected.length)
    ) {
      setSelectionError("Selecione vendas que ainda tenham saldo em aberto.");
      return;
    }
    if (v.allocation === "fifo" && !v.customer_id) {
      setError("customer_id", { message: "Selecione um cliente" });
      return;
    }
    if (v.allocation !== "unlinked" && toCents(v.amount) > balance) {
      setError("amount", {
        message: `O valor não pode superar o saldo de ${money(balance)}`,
      });
      return;
    }
    const payload = {
      customer_id: v.allocation === "unlinked" ? null : v.customer_id || null,
      amount_cents: toCents(v.amount),
      payment_date: v.payment_date,
      method: v.method,
      notes: v.notes,
      ...(v.allocation === "selected" ? { sale_ids: selectedIds } : {}),
    };
    submitting.current = true;
    try {
      await action.run("record_payment", {
        ...payload,
        request_id: requestIdentity.forPayload(payload),
      });
      requestIdentity.clear();
      onOpenChange(false);
    } catch {
      /* Keep values for retry. */
    } finally {
      submitting.current = false;
    }
  });
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!submitting.current) onOpenChange(next);
      }}
      title="Registrar recebimento"
      description="O caixa é atualizado somente quando um pagamento é registrado."
    >
      <form onSubmit={submit} className="stack">
        <Field label="Cliente" error={errors.customer_id?.message}>
          <Select
            {...register("customer_id")}
            onChange={(e) => {
              setValue("customer_id", e.target.value);
              setValue("allocation", e.target.value ? "fifo" : "unlinked");
              setSelected([]);
            }}
          >
            <option value="">Sem cliente</option>
            {data?.customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " (arquivado)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Como vincular este recebimento">
          <Select
            {...register("allocation")}
            onChange={(e) => {
              setValue("allocation", e.target.value as Values["allocation"]);
              setSelectionError("");
              if (e.target.value === "unlinked") {
                setValue("customer_id", "");
                setSelected([]);
              }
            }}
          >
            <option value={values.customer_id ? "fifo" : "unlinked"}>
              {values.customer_id
                ? "Quitar primeiro as vendas mais antigas"
                : "Sem vínculo, para conciliação"}
            </option>
            <option value="selected">Escolher vendas específicas</option>
            {values.customer_id && (
              <option value="unlinked">Sem vínculo, para conciliação</option>
            )}
          </Select>
        </Field>
        {values.allocation === "selected" && (
          <Card style={{ padding: 16 }}>
            <p className="section-title">Selecione as vendas</p>
            {eligible.length === 0 ? (
              <p className="muted">Não há vendas pendentes para este cliente.</p>
            ) : (
              <div className="stack" style={{ gap: 12 }}>
                {eligible.map((s) => (
                  <label
                    key={s.id}
                    className="list-row"
                    style={{ cursor: "pointer", gap: 12 }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={(e) => {
                        setSelected((list) =>
                          e.target.checked
                            ? [...list, s.id]
                            : list.filter((id) => id !== s.id),
                        );
                        setSelectionError("");
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      Venda de {dateLabel(s.sale_date)}
                      <small className="muted" style={{ display: "block" }}>
                        Vence {s.due_date ? dateLabel(s.due_date) : "sem data"}
                      </small>
                    </span>
                    <strong>{money(saleBalance(s, data!))}</strong>
                  </label>
                ))}
              </div>
            )}
            {selectionError && (
              <p role="alert" style={{ color: "var(--red)" }}>
                {selectionError}
              </p>
            )}
          </Card>
        )}
        {values.allocation !== "unlinked" ? (
          <div className="list-row">
            <span className="muted">Saldo para alocação</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setValue("amount", (balance / 100).toFixed(2))}
            >
              Usar {money(balance)}
            </Button>
          </div>
        ) : (
          <Badge tone="amber">Recebimento sem vínculo com vendas</Badge>
        )}
        <div className="form-grid">
          <Field label="Valor recebido (R$)" error={errors.amount?.message}>
            <Input inputMode="decimal" placeholder="0,00" {...register("amount")} />
          </Field>
          <Field label="Data do pagamento" error={errors.payment_date?.message}>
            <Input type="date" {...register("payment_date")} />
          </Field>
        </div>
        <Field label="Forma de pagamento">
          <Select {...register("method")}>
            {paymentMethods.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observações">
          <Textarea
            rows={2}
            {...register("notes")}
            placeholder="Detalhes para identificar este recebimento"
          />
        </Field>
        <p className="muted" style={{ margin: 0 }}>
          {values.allocation === "fifo"
            ? "O pagamento será distribuído pelas vendas abertas em ordem de vencimento e data, inclusive parcialmente."
            : values.allocation === "selected"
              ? "O valor será distribuído apenas entre as vendas selecionadas, em ordem de vencimento e data."
              : "Este valor entrará no caixa sem reduzir o saldo de um cliente. Você poderá estornar e relançar com o vínculo correto."}
        </p>
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={action.pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending || !data}>
            {action.pending ? "Registrando…" : "Confirmar recebimento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
