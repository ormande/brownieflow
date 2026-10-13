import { Badge, DatePicker, Field } from "../ui";
import type { AppData, Sale } from "../../types";
import { saleStatus } from "../../lib/finance";
import { today } from "../../lib/format";
import { z } from "zod";

export function validMoney(value: string, allowZero = false) {
  const raw = value.replace(/R\$|\s|\u00a0/g, "");
  if (!raw) return allowZero;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return false;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return cents >= (allowZero ? 0n : 1n) && cents <= BigInt(Number.MAX_SAFE_INTEGER);
}
export const amountSchema = z
  .string()
  .trim()
  .min(1, "Informe o valor")
  .refine(
    (v) => validMoney(v),
    "Informe um valor maior que zero, com até 2 casas decimais e dentro do limite permitido",
  );
export const dateSchema = z
  .string()
  .min(1, "Informe a data")
  .refine((v) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v.startsWith("0000")) return false;
    const date = new Date(`${v}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
  }, "Data inválida");
export const paymentMethods = [
  ["pix", "Pix"],
  ["cash", "Dinheiro"],
  ["card", "Cartão"],
  ["transfer", "Transferência"],
  ["other", "Outro"],
] as const;
export const monthStart = () => `${today().slice(0, 7)}-01`;
export const inPeriod = (date: string, start: string, end: string) =>
  (!start || date >= start) && (!end || date <= end);
export const saleQuantity = (saleId: string, data: AppData) =>
  data.sale_items
    .filter((i) => i.sale_id === saleId)
    .reduce((n, i) => n + Number(i.quantity), 0);
export const customerName = (customerId: string | null, data: AppData) =>
  data.customers.find((c) => c.id === customerId)?.name ?? "Sem cliente";
export function matchesCustomer(
  customer: { name: string; phone: string },
  search: string,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR")
      .trim();
  const term = normalize(search);
  const digits = search.replace(/\D/g, "");
  return (
    !term ||
    normalize(customer.name).includes(term) ||
    Boolean(
      digits &&
      /^[\d\s()+.-]+$/.test(search) &&
      customer.phone.replace(/\D/g, "").includes(digits.replace(/^55(?=\d{10,11}$)/, "")),
    )
  );
}
export function whatsappUrl(
  phone: string,
  name: string,
  balance: number,
  template?: string,
) {
  const digits = phone.replace(/\D/g, "");
  const number = digits.length <= 11 ? `55${digits}` : digits;
  const text = (
    template || "Olá, {nome}! O valor pendente dos brownies é de {valor}. Obrigado!"
  )
    .replaceAll("{nome}", name)
    .replaceAll(
      "{valor}",
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        balance / 100,
      ),
    );
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
export function StatusBadge({ sale, data }: { sale: Sale; data: AppData }) {
  const status = saleStatus(sale, data);
  const names = {
    paid: "Quitado",
    partial: "Parcial",
    overdue: "Atrasado",
    pending: "Pendente",
    cancelled: "Cancelado",
  };
  return (
    <Badge
      tone={
        status === "paid"
          ? "green"
          : status === "overdue"
            ? "red"
            : status === "cancelled"
              ? "neutral"
              : "amber"
      }
    >
      {names[status]}
    </Badge>
  );
}
export function DateRange({
  start,
  end,
  setStart,
  setEnd,
}: {
  start: string;
  end: string;
  setStart: (v: string) => void;
  setEnd: (v: string) => void;
}) {
  const invalid = Boolean(start && end && start > end);
  return (
    <>
      <Field label="De">
        <DatePicker value={start} max={end || undefined} onChange={setStart} />
      </Field>
      <Field
        label="Até"
        error={invalid ? "A data final deve ser igual ou posterior à inicial" : undefined}
      >
        <DatePicker value={end} min={start || undefined} onChange={setEnd} />
      </Field>
    </>
  );
}
export function LoadingData() {
  return (
    <div className="stack" role="status" aria-live="polite">
      <div className="skeleton" style={{ height: 80, borderRadius: 20 }} />
      <div className="skeleton" style={{ height: 240, borderRadius: 20 }} />
      <span className="muted">Carregando seus registros…</span>
    </div>
  );
}
export function formatPhone(value: string) {
  const n = value.replace(/\D/g, "").slice(0, 11);
  return n.length > 10
    ? n.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3")
    : n.length > 6
      ? n.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3")
      : n;
}
