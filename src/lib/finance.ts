import type { AppData, Sale } from "../types";
import { today } from "./format";
export const salePaid = (saleId: string, data: AppData) => {
  const active = new Set(data.payments.filter((p) => !p.voided_at).map((p) => p.id));
  return data.payment_allocations
    .filter((a) => a.sale_id === saleId && active.has(a.payment_id))
    .reduce((v, a) => v + Number(a.amount_cents), 0);
};
export const saleAdjustment = (saleId: string, data: AppData) =>
  data.receivable_adjustments
    .filter((a) => a.sale_id === saleId)
    .reduce((v, a) => v + Number(a.amount_cents), 0);
export const saleBalance = (sale: Sale, data: AppData) =>
  sale.cancelled_at
    ? 0
    : Math.max(
        0,
        sale.total_cents + saleAdjustment(sale.id, data) - salePaid(sale.id, data),
      );
export const saleStatus = (sale: Sale, data: AppData) => {
  if (sale.cancelled_at) return "cancelled";
  if (saleBalance(sale, data) === 0) return "paid";
  if (sale.due_date && sale.due_date < today()) return "overdue";
  if (salePaid(sale.id, data) > 0) return "partial";
  return "pending";
};
export const recipeCost = (recipeId: string, data: AppData) =>
  data.recipe_ingredients
    .filter((i) => i.recipe_id === recipeId)
    .reduce(
      (s, i) =>
        s +
        Number(i.quantity) *
          Number(
            data.ingredients.find((x) => x.id === i.ingredient_id)?.average_cost_cents ??
              0,
          ),
      0,
    );
export const discountAmount = (
  grossCents: number,
  value: number,
  kind: "amount" | "percent",
) => {
  if (
    !Number.isSafeInteger(grossCents) ||
    grossCents < 0 ||
    !Number.isFinite(value) ||
    value < 0
  )
    throw new Error("Desconto inválido.");
  if (kind === "percent" && value > 100) throw new Error("Percentual acima de 100%.");
  const discount =
    kind === "percent" ? Math.round((grossCents * value) / 100) : Math.round(value);
  if (discount > grossCents) throw new Error("Desconto acima do valor da venda.");
  return discount;
};
export const allocatePayment = (
  amount: number,
  sales: { id: string; balance: number }[],
) => {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new Error("Pagamento inválido.");
  const ids = new Set<string>();
  let total = 0n;
  for (const sale of sales) {
    if (!sale.id || ids.has(sale.id)) throw new Error("Venda inválida ou duplicada.");
    if (!Number.isSafeInteger(sale.balance) || sale.balance < 0)
      throw new Error("Saldo inválido.");
    ids.add(sale.id);
    total += BigInt(sale.balance);
  }
  if (BigInt(amount) > total) throw new Error("Pagamento acima do saldo.");
  let remaining = amount;
  return sales
    .map((s) => {
      const allocated = Math.min(remaining, s.balance);
      remaining -= allocated;
      return { sale_id: s.id, amount_cents: allocated };
    })
    .filter((a) => a.amount_cents > 0);
};
export function csvText(rows: Record<string, unknown>[]) {
  if (!rows.length) return "\ufeff";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\ufeff" +
    [headers, ...rows.map((r) => headers.map((h) => r[h]))]
      .map((r) => r.map(cell).join(";"))
      .join("\r\n")
  );
}
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const blob = new Blob([csvText(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
