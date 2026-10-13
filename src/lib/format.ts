import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    (Number(cents) || 0) / 100,
  );
export const quantity = (value: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const dateLabel = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR").format(
        new Date(iso.length === 10 ? `${iso}T12:00:00` : iso),
      )
    : "—";
export const toCents = (value: string | number) => {
  if (typeof value === "number") {
    const cents = Math.round((value + Number.EPSILON) * 100);
    return Number.isSafeInteger(cents) ? cents : 0;
  }
  const raw = value.replace(/R\$|\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 0;
  const negative = normalized.startsWith("-");
  const [whole, fraction = ""] = normalized.replace(/^-/, "").split(".");
  // Parse before converting to Number: multiplying a large decimal by 100
  // can silently lose a cent even when the final integer is still safe.
  let cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  if (Number(fraction[2] ?? 0) >= 5) cents += 1n;
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return 0;
  return Number(negative ? -cents : cents);
};
export const methodLabel: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  card: "Cartão",
  transfer: "Transferência",
  other: "Outro",
};
export const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const phoneMask = (value: string) => {
  const n = value.replace(/\D/g, "").slice(0, 11);
  return n.length > 10
    ? n.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3")
    : n.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
};
