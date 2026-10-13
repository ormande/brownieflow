import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppData, Payment, Sale } from "../src/types";
import {
  allocatePayment,
  csvText,
  discountAmount,
  saleAdjustment,
  saleBalance,
  salePaid,
  saleStatus,
} from "../src/lib/finance";
import { toCents } from "../src/lib/format";
import {
  amountSchema,
  dateSchema,
  inPeriod,
  matchesCustomer,
  whatsappUrl,
} from "../src/components/finance/shared";
import { createRequestIdentity } from "../src/components/finance/requestIdentity";

const row = {
  user_id: "owner",
  created_at: "2026-10-08T12:00:00Z",
  updated_at: "2026-10-08T12:00:00Z",
};
const sale: Sale = {
  ...row,
  id: "sale",
  customer_id: "customer",
  sale_date: "2026-10-08",
  due_date: "2026-10-15",
  modality: "credit",
  gross_cents: 600,
  discount_cents: 200,
  total_cents: 400,
  notes: "",
  cancelled_at: null,
  request_id: "request",
};
const payment: Payment = {
  ...row,
  id: "payment",
  customer_id: "customer",
  payment_date: "2026-10-10",
  amount_cents: 200,
  method: "pix",
  notes: "",
  voided_at: null,
  void_reason: null,
  request_id: "payment-request",
};
function example(): AppData {
  return {
    profiles: [],
    customers: [],
    products: [],
    sales: [{ ...sale }],
    sale_items: [],
    payments: [],
    payment_allocations: [],
    receivable_adjustments: [],
    expenses: [],
    ingredients: [],
    ingredient_purchases: [],
    ingredient_purchase_items: [],
    recipes: [],
    recipe_ingredients: [],
    production_batches: [],
    stock_movements: [],
  };
}
function pay(data: AppData, amount = 200) {
  data.payments.push({ ...payment, amount_cents: amount });
  data.payment_allocations.push({
    ...row,
    id: "allocation",
    payment_id: payment.id,
    sale_id: sale.id,
    amount_cents: amount,
  });
}
afterEach(() => vi.useRealTimers());

describe("Saldos derivados dos recebimentos reais", () => {
  it("preserva os R$ 6 originais e mantém R$ 4 pendentes após o desconto de R$ 2", () => {
    const data = example();
    expect(saleBalance(sale, data)).toBe(400);
    expect(salePaid(sale.id, data)).toBe(0);
    expect(data.sales[0]).toMatchObject({
      gross_cents: 600,
      discount_cents: 200,
      total_cents: 400,
    });
  });
  it("não presume pagamento em vendas à vista nem usa recebimentos sem vínculo", () => {
    const data = example();
    data.payments.push({ ...payment, amount_cents: 400 });
    expect(saleBalance({ ...sale, modality: "cash" }, data)).toBe(400);
    expect(salePaid(sale.id, data)).toBe(0);
  });
  it("calcula pagamento parcial, quitação e reabertura por estorno", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00"));
    const data = example();
    pay(data);
    expect(salePaid(sale.id, data)).toBe(200);
    expect(saleBalance(sale, data)).toBe(200);
    expect(saleStatus(sale, data)).toBe("partial");
    data.payment_allocations[0].amount_cents = 400;
    expect(saleBalance(sale, data)).toBe(0);
    expect(saleStatus(sale, data)).toBe("paid");
    data.payments[0].voided_at = "2026-10-11T12:00:00Z";
    expect(saleBalance(sale, data)).toBe(400);
    expect(saleStatus(sale, data)).toBe("pending");
  });
  it("ignora alocações de outro recebimento estornado ou sem registro", () => {
    const data = example();
    pay(data, 100);
    data.payments.push({ ...payment, id: "void", voided_at: "2026-10-11T12:00:00Z" });
    for (const payment_id of ["void", "missing"])
      data.payment_allocations.push({
        ...row,
        id: payment_id,
        payment_id,
        sale_id: sale.id,
        amount_cents: 100,
      });
    expect(salePaid(sale.id, data)).toBe(100);
    expect(saleBalance(sale, data)).toBe(300);
  });
  it("aplica descontos e acréscimos posteriores sem alterar o total original", () => {
    const data = example();
    pay(data, 100);
    data.receivable_adjustments.push(
      {
        ...row,
        id: "discount",
        sale_id: sale.id,
        amount_cents: -150,
        adjustment_date: "2026-10-10",
        reason: "Desconto concedido",
      },
      {
        ...row,
        id: "increase",
        sale_id: sale.id,
        amount_cents: 50,
        adjustment_date: "2026-10-10",
        reason: "Ajuste autorizado",
      },
    );
    expect(saleAdjustment(sale.id, data)).toBe(-100);
    expect(saleBalance(sale, data)).toBe(200);
    expect(data.sales[0].total_cents).toBe(400);
  });
  it("separa vencimento de hoje de atraso e prioriza dívida vencida parcialmente paga", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00"));
    const data = example();
    expect(saleStatus(sale, data)).toBe("pending");
    expect(saleStatus({ ...sale, due_date: null }, data)).toBe("pending");
    vi.setSystemTime(new Date("2026-10-16T12:00:00"));
    pay(data);
    expect(saleStatus(sale, data)).toBe("overdue");
  });
  it("exclui vendas canceladas dos saldos e mantém o status cancelado", () => {
    const data = example();
    pay(data);
    const cancelled = { ...sale, cancelled_at: "2026-10-12T12:00:00Z" };
    expect(saleBalance(cancelled, data)).toBe(0);
    expect(saleStatus(cancelled, data)).toBe("cancelled");
  });
});

describe("Descontos e alocação entre várias compras", () => {
  it("calcula valores e percentuais arredondando somente para centavos", () => {
    expect(discountAmount(600, 200, "amount")).toBe(200);
    expect(discountAmount(999, 12.5, "percent")).toBe(125);
    expect(discountAmount(600, 100, "percent")).toBe(600);
    expect(discountAmount(0, 0, "amount")).toBe(0);
  });
  it.each([
    [-1, 1, "amount"],
    [600, -1, "amount"],
    [600, 601, "amount"],
    [600, 101, "percent"],
    [600, NaN, "amount"],
  ] as const)("rejeita desconto inválido (%s, %s, %s)", (gross, value, kind) => {
    expect(() => discountAmount(gross, value, kind)).toThrow();
  });
  it("distribui R$ 20 em três compras de R$ 12 e conserva saldo de R$ 16", () => {
    const sales = ["first", "second", "third"].map((id) => ({ id, balance: 1200 }));
    const result = allocatePayment(2000, sales);
    expect(result).toEqual([
      { sale_id: "first", amount_cents: 1200 },
      { sale_id: "second", amount_cents: 800 },
    ]);
    expect(
      sales.reduce((n, s) => n + s.balance, 0) -
        result.reduce((n, a) => n + a.amount_cents, 0),
    ).toBe(1600);
    expect(sales.every((s) => s.balance === 1200)).toBe(true);
  });
  it("ignora saldos já quitados e permite quitar exatamente o saldo total", () => {
    expect(
      allocatePayment(500, [
        { id: "paid", balance: 0 },
        { id: "open", balance: 500 },
      ]),
    ).toEqual([{ sale_id: "open", amount_cents: 500 }]);
  });
  it.each([0, -1, 0.5, NaN, Infinity, 501])(
    "recusa pagamento inválido ou superior ao saldo: %s",
    (amount) => {
      expect(() => allocatePayment(amount, [{ id: "sale", balance: 500 }])).toThrow();
    },
  );
  it.each([-1, 0.5, NaN, Infinity])(
    "recusa um saldo inválido antes de alocar: %s",
    (balance) => {
      expect(() =>
        allocatePayment(100, [
          { id: "invalid", balance },
          { id: "valid", balance: 200 },
        ]),
      ).toThrow();
    },
  );
  it("impede que a mesma venda apareça duas vezes na alocação", () => {
    expect(() =>
      allocatePayment(100, [
        { id: "same", balance: 100 },
        { id: "same", balance: 100 },
      ]),
    ).toThrow();
  });
});

describe("Validação, busca e exportação financeira", () => {
  it.each([
    "0",
    "-1",
    "1,234",
    "NaN",
    "Infinity",
    "90071992547409.92",
    "90071992547409.93",
  ])("recusa um valor monetário inválido: %s", (amount) =>
    expect(amountSchema.safeParse(amount).success).toBe(false),
  );
  it("aceita centavos exatos com vírgula, ponto e limite seguro", () => {
    for (const value of ["0,01", "5.00", "90071992547409.91"])
      expect(amountSchema.safeParse(value).success).toBe(true);
    expect(toCents("90071992547409.91")).toBe(Number.MAX_SAFE_INTEGER);
    expect(toCents("1.234,56")).toBe(123456);
  });
  it("rejeita dias inexistentes e aceita ano bissexto", () => {
    for (const date of [
      "2026-02-29",
      "2026-04-31",
      "2026-13-01",
      "0000-01-01",
      "08/10/2026",
      "",
    ])
      expect(dateSchema.safeParse(date).success).toBe(false);
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
  });
  it("filtra as duas extremidades inclusivamente e permite intervalo aberto", () => {
    expect(inPeriod("2026-10-01", "2026-10-01", "2026-10-31")).toBe(true);
    expect(inPeriod("2026-10-31", "2026-10-01", "2026-10-31")).toBe(true);
    expect(inPeriod("2026-11-01", "2026-10-01", "2026-10-31")).toBe(false);
    expect(inPeriod("2026-01-01", "", "")).toBe(true);
  });
  it("encontra nomes sem acentos e telefones com máscara ou código do país", () => {
    const customer = { name: "João Fernandes", phone: "65999991234" };
    for (const term of [
      "joao",
      " FERNANDES ",
      "(65) 99999-1234",
      "+55 (65) 99999-1234",
      "99999",
    ])
      expect(matchesCustomer(customer, term)).toBe(true);
    expect(matchesCustomer(customer, "Ana")).toBe(false);
    expect(matchesCustomer(customer, "Ana 1234")).toBe(false);
  });
  it("preenche a cobrança sem duplicar código do país e escapa o texto", () => {
    const url = new URL(
      whatsappUrl(
        "+55 (65) 99999-1234",
        "João & Ana",
        2400,
        "Olá, {nome}! Pendente: {valor}.",
      ),
    );
    expect(url.pathname).toBe("/5565999991234");
    expect(url.searchParams.get("text")).toContain("João & Ana");
    expect(url.searchParams.get("text")).toMatch(/24,00/);
  });
  it("exporta acentos, aspas e quebras de linha e neutraliza fórmulas de planilha", () => {
    const csv = csvText([
      {
        Nome: 'João "Silva"',
        Observação: "linha 1\nlinha 2",
        Fórmula: ' =HYPERLINK("https://example.com")',
        Valor: 400,
      },
    ]);
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain('"João ""Silva"""');
    expect(csv).toContain('"linha 1\nlinha 2"');
    expect(csv).toContain("\"' =HYPERLINK");
    expect(csvText([])).toBe("\ufeff");
  });
});

describe("Identidade de registros financeiros", () => {
  it("reutiliza a identidade em uma repetição após falha de rede", () => {
    const identity = createRequestIdentity();
    const payload = { amount_cents: 400, customer_id: "customer" };
    expect(identity.forPayload({ ...payload })).toBe(identity.forPayload(payload));
  });
  it("renova a identidade quando o conteúdo muda ou a gravação anterior terminou", () => {
    const identity = createRequestIdentity();
    const first = identity.forPayload({ amount_cents: 400 });
    const edited = identity.forPayload({ amount_cents: 500 });
    expect(edited).not.toBe(first);
    identity.clear();
    expect(identity.forPayload({ amount_cents: 500 })).not.toBe(edited);
  });
});
