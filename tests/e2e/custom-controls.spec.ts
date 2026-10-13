import { expect, test, type Page } from "@playwright/test";
import { customerId, mockBackend, stockedData } from "./fixtures";

async function openSale(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-13T16:00:00Z"));
  const payloads: Record<string, unknown>[] = [];
  await mockBackend(page, {
    data: stockedData(),
    rpc: async (route) => {
      payloads.push(route.request().postDataJSON().p_data);
      await route.fulfill({ json: { id: "test-sale" } });
    },
  });
  await page.goto("/vendas");
  await page.locator(".page-heading").getByRole("button", { name: "Nova venda" }).click();
  const dialog = page.getByRole("dialog", { name: "Nova venda", exact: true });
  await expect(dialog).toBeVisible();
  return { dialog, payloads };
}

test("custom dropdown accepts clicks inside the sale modal", async ({ page }) => {
  const { dialog, payloads } = await openSale(page);
  await dialog.getByRole("button", { name: "Modalidade", exact: true }).click();
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: "Fiado", exact: true })
    .click({ timeout: 5_000 });
  await expect(
    dialog.getByRole("button", { name: "Modalidade", exact: true }),
  ).toHaveText("Fiado");
  await expect(dialog.getByLabel("Preço unitário", { exact: true })).toHaveValue(/6,00/);
  await dialog.getByRole("button", { name: "Modalidade", exact: true }).click();
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: "À vista", exact: true })
    .click();
  await dialog.getByLabel("Pagamento", { exact: false }).click();
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: "Recebi o valor total", exact: true })
    .click();
  await dialog.getByLabel("Forma de pagamento", { exact: false }).click();
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: "Dinheiro", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads[0]).toMatchObject({
    modality: "cash",
    immediate_payment_cents: 500,
    method: "cash",
  });
});

test("customer combobox keeps keyboard focus and selects a matching customer", async ({
  page,
}, testInfo) => {
  const { dialog, payloads } = await openSale(page);
  await dialog.getByRole("button", { name: "Selecionar cliente", exact: true }).click();
  const search = page.getByPlaceholder("Buscar por nome ou telefone...");
  await expect(search).toBeFocused({ timeout: 5_000 });
  await search.pressSequentially("Cliente de teste");
  await expect(search).toHaveValue("Cliente de teste");
  await page.screenshot({
    path: testInfo.outputPath(`customer-search-${testInfo.project.name}.png`),
  });
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: /Cliente de teste/ })
    .click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Cliente de teste/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads[0]).toMatchObject({ customer_id: customerId });
});

test("calendar navigation and date selection work without closing the sale modal", async ({
  page,
}, testInfo) => {
  const { dialog, payloads } = await openSale(page);
  await dialog.getByLabel("Data da venda", { exact: false }).click();
  const calendar = page.locator(".datepicker-panel");
  await calendar
    .getByRole("button", { name: "Próximo mês", exact: true })
    .click({ timeout: 5_000 });
  await expect(calendar.getByText("Novembro de 2026")).toBeVisible();
  await calendar.getByRole("button", { name: "Mês anterior", exact: true }).click();
  await calendar.getByRole("button", { name: "15", exact: true }).click();
  await expect(dialog.getByLabel("Data da venda", { exact: false })).toHaveText(
    "15/10/2026",
  );
  await expect(dialog.getByLabel("Vencimento", { exact: false })).toHaveText(
    "22/10/2026",
  );
  await dialog.getByLabel("Vencimento", { exact: false }).click();
  await expect(calendar.getByRole("button", { name: "14", exact: true })).toBeDisabled();
  await expect(
    calendar.getByRole("button", { name: "Hoje", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath(`calendar-${testInfo.project.name}.png`),
  });
  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads[0]).toMatchObject({ sale_date: "2026-10-15", due_date: "2026-10-22" });
});

test("payment and expense modals use interactive custom controls", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-13T16:00:00Z"));
  await mockBackend(page, { data: stockedData() });

  await page.goto("/pagamentos");
  await page.getByRole("button", { name: "Registrar recebimento" }).first().click();
  const payment = page.getByRole("dialog", { name: "Registrar recebimento" });
  await expect(payment).toBeVisible();
  await expect(payment.locator('select, input[type="date"]')).toHaveCount(0);
  await payment.getByRole("button", { name: "Cliente", exact: true }).click();
  const customerSearch = page.getByPlaceholder("Buscar por nome ou telefone...");
  await expect(customerSearch).toBeFocused();
  await customerSearch.fill("Cliente de teste");
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: /Cliente de teste/ })
    .click();
  await payment.getByLabel("Forma de pagamento", { exact: false }).click();
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: "Dinheiro", exact: true })
    .click();
  await payment.getByLabel("Data do pagamento", { exact: false }).click();
  await page
    .locator(".datepicker-panel")
    .getByRole("button", { name: "12", exact: true })
    .click();
  await expect(payment.getByLabel("Data do pagamento", { exact: false })).toHaveText(
    "12/10/2026",
  );
  await payment.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.goto("/despesas");
  await page.getByRole("button", { name: "Nova despesa", exact: true }).click();
  const expense = page.getByRole("dialog", { name: "Nova despesa" });
  await expect(expense).toBeVisible();
  await expect(expense.locator('select, input[type="date"]')).toHaveCount(0);
  await expense.getByRole("button", { name: "Categoria", exact: true }).click();
  await page
    .locator(".popover-panel")
    .getByRole("button", { name: "Embalagens", exact: true })
    .click();
  await expect(
    expense.getByRole("button", { name: "Categoria", exact: true }),
  ).toHaveText("Embalagens");
  await expense.getByRole("button", { name: "Cancelar", exact: true }).click();
});
