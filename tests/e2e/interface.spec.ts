import { expect, test, type Page } from "@playwright/test";
import { customerId, mockBackend, productId, stockedData } from "./fixtures";

async function expectFitsViewport(page: Page) {
  const bounds = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(
    bounds.scroll,
    "The document must not overflow horizontally",
  ).toBeLessThanOrEqual(bounds.width + 1);
}

async function openSale(page: Page) {
  await page.goto("/vendas");
  await page.getByRole("heading", { name: "Vendas", exact: true }).waitFor();
  await page
    .locator(".page-heading")
    .getByRole("button", { name: "Nova venda", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Nova venda", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("private routes redirect to sign-in and validation prevents invalid login requests", async ({
  page,
}) => {
  await mockBackend(page, { authenticated: false });
  const authRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/auth/v1/token")) authRequests.push(request.url());
  });
  await page.goto("/relatorios");
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(
    page.getByRole("heading", { name: "Bom ter você de volta." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use de 3 a 30" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "Use pelo menos 8 caracteres." }),
  ).toBeVisible();
  expect(authRequests).toHaveLength(0);
  await expectFitsViewport(page);
});

test("incorrect credentials remain on sign-in without showing success", async ({
  page,
}) => {
  await mockBackend(page, { authenticated: false });
  await page.goto("/entrar");
  await page.getByLabel("Nome de usuário").fill("teste");
  await page.getByPlaceholder("Pelo menos 8 caracteres").fill("senha-incorreta");
  await page.getByRole("button", { name: "Entrar na minha conta" }).click();
  await expect(
    page.getByText("Usuário ou senha incorretos.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByText("Bom ter você por aqui.", { exact: true })).toHaveCount(0);
});

test("every module renders real empty states without horizontal document overflow", async ({
  page,
}, testInfo) => {
  await mockBackend(page);
  const crashes: string[] = [];
  page.on("pageerror", (error) => crashes.push(error.message));
  const routes: [string, string | RegExp, string?][] = [
    ["/", /^Olá, Empreendedor/, "Sua primeira venda está por vir"],
    ["/vendas", "Vendas", "Nenhuma venda por aqui"],
    ["/clientes", "Clientes", "Sua lista de clientes começa aqui"],
    ["/cobrancas", "Contas a receber"],
    ["/pagamentos", "Recebimentos", "Nenhum recebimento neste período"],
    ["/despesas", "Despesas", "Nenhuma despesa neste período"],
    ["/estoque", "Estoque", "O estoque começa com a primeira compra"],
    ["/receitas", "Receitas e custos", "Sua primeira ficha técnica"],
    ["/producao", "Produção", "Nenhuma fornada neste período"],
    ["/planejamento", "Planejamento", "Uma receita para começar a planejar"],
    ["/relatorios", "Relatórios", "O próximo capítulo começa com seu primeiro registro"],
    ["/configuracoes", "Configurações"],
  ];
  for (const [path, title, empty] of routes) {
    await test.step(path, async () => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: title,
          exact: typeof title === "string",
        }),
      ).toBeVisible();
      if (path === "/estoque")
        await page.getByRole("button", { name: "Compras", exact: true }).click();
      if (empty)
        await expect(
          page.getByRole("heading", { name: empty, exact: true }),
        ).toBeVisible();
      await expectFitsViewport(page);
      if (path === "/") {
        await page.screenshot({
          path: testInfo.outputPath(`dashboard-${testInfo.project.name}.png`),
          fullPage: true,
        });
      }
    });
  }
  await page.goto("/clientes/00000000-0000-4000-8000-999999999999");
  await expect(
    page.getByRole("heading", { name: "Cliente não encontrado" }),
  ).toBeVisible();
  expect(crashes).toEqual([]);
});

test("mobile navigation opens more modules and closes after navigating", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "Bottom navigation is specific to phone layout.",
  );
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Mais", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Seu negócio" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("link", { name: "Estoque", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Estoque", exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expectFitsViewport(page);
});

test("theme preference persists after reload", async ({ page }) => {
  await mockBackend(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("brownieflow-theme"))).toBe(
    "dark",
  );
});

test("sale dialog has an accessible name, traps focus and closes with Escape", async ({
  page,
}, testInfo) => {
  await mockBackend(page, { data: stockedData() });
  const dialog = await openSale(page);
  await expect(dialog).toHaveAccessibleName("Nova venda");
  const quantity = dialog.getByLabel("Quantidade");
  await quantity.fill("2");
  await quantity.press("Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await expectFitsViewport(page);
  await page.screenshot({
    path: testInfo.outputPath(`sale-dialog-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator(".page-heading")
      .getByRole("button", { name: "Nova venda", exact: true }),
  ).toBeFocused();
});

test("cash modality leaves the amount pending unless an actual payment is chosen", async ({
  page,
}) => {
  const payloads: Record<string, unknown>[] = [];
  await mockBackend(page, {
    data: stockedData(),
    rpc: async (route) => {
      payloads.push(route.request().postDataJSON().p_data);
      await route.fulfill({ json: { id: "test-sale" } });
    },
  });
  const dialog = await openSale(page);
  await dialog.getByLabel("Quantidade").fill("2");
  await expect(
    dialog.getByRole("combobox", { name: "Modalidade", exact: true }),
  ).toHaveValue("cash");
  await expect(
    dialog
      .getByLabel("Pagamento", { exact: false })
      .filter({ has: page.locator('option[value="none"]') }),
  ).toHaveValue("none");
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads).toHaveLength(1);
  expect(payloads[0]).toMatchObject({
    product_id: productId,
    customer_id: null,
    quantity: 2,
    modality: "cash",
    unit_price_cents: 500,
    discount_cents: 0,
    immediate_payment_cents: 0,
  });
  expect(payloads[0]!.request_id).toMatch(/^[\da-f-]{36}$/);
  await expect(
    page.getByText("Registro salvo com sucesso.", { exact: true }),
  ).toBeVisible();
});

test("credit sale applies its price, percentage discount and partial payment in cents", async ({
  page,
}) => {
  const payloads: Record<string, unknown>[] = [];
  await mockBackend(page, {
    data: stockedData(),
    rpc: async (route) => {
      payloads.push(route.request().postDataJSON().p_data);
      await route.fulfill({ json: { id: "test-credit-sale" } });
    },
  });
  const dialog = await openSale(page);
  await dialog.getByLabel("Selecionar cliente").selectOption(customerId);
  await dialog.getByLabel("Quantidade").fill("3");
  await dialog
    .getByRole("combobox", { name: "Modalidade", exact: true })
    .selectOption("credit");
  await expect(dialog.getByLabel("Preço unitário (R$)")).toHaveValue("6.00");
  await dialog.getByLabel("Tipo de desconto").selectOption("percent");
  await dialog.getByLabel("Desconto (%)", { exact: true }).fill("10");
  await dialog.locator('select[name="payment_mode"]').selectOption("partial");
  await dialog.getByLabel("Valor recebido (R$)").fill("5,20");
  await dialog.getByLabel("Forma de pagamento").selectOption("pix");
  await expect(dialog.getByText("R$ 16,20", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads[0]).toMatchObject({
    customer_id: customerId,
    quantity: 3,
    modality: "credit",
    unit_price_cents: 600,
    discount_cents: 180,
    immediate_payment_cents: 520,
    method: "pix",
  });
});

test("credit without customer and sale above stock cannot reach the server", async ({
  page,
}) => {
  let writes = 0;
  await mockBackend(page, {
    data: stockedData(),
    rpc: async (route) => {
      writes++;
      await route.fulfill({ json: {} });
    },
  });
  const dialog = await openSale(page);
  await dialog
    .getByRole("combobox", { name: "Modalidade", exact: true })
    .selectOption("credit");
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Escolha um cliente para vender fiado" }),
  ).toBeVisible();
  await dialog.getByLabel("Selecionar cliente").selectOption(customerId);
  await dialog.getByLabel("Quantidade").fill("31");
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Estoque disponível: 30 unidades" }),
  ).toBeVisible();
  expect(writes).toBe(0);
});

test("a failed write preserves inputs and request id without showing success", async ({
  page,
}) => {
  const payloads: Record<string, unknown>[] = [];
  await mockBackend(page, {
    data: stockedData(),
    rpc: async (route) => {
      payloads.push(route.request().postDataJSON().p_data);
      if (payloads.length === 1) await route.abort("failed");
      else await route.fulfill({ json: { id: "retried-sale" } });
    },
  });
  const dialog = await openSale(page);
  await dialog.getByLabel("Quantidade").fill("4");
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(page.getByText(/Falha de conexão\. A operação pode/)).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Quantidade")).toHaveValue("4");
  await expect(
    page.getByText("Registro salvo com sucesso.", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Registrar venda", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(payloads).toHaveLength(2);
  expect(payloads[1]!.request_id).toBe(payloads[0]!.request_id);
});

test("read failures show retry instead of fabricated empty business data", async ({
  page,
}) => {
  await mockBackend(page, { failReads: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Não foi possível carregar seus dados" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  await expect(
    page.getByText("Sua primeira venda está por vir", { exact: true }),
  ).toHaveCount(0);
  await expectFitsViewport(page);
});

test("missing migrations block account creation with setup instructions", async ({
  page,
}) => {
  await mockBackend(page, { authenticated: false, missingSchema: true });
  await page.goto("/entrar");
  await expect(page.getByRole("heading", { name: "Prepare o banco" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verificar configuração novamente" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar minha conta" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Entrar na minha conta" })).toHaveCount(
    0,
  );
});

test("first signup requires disabled email confirmation", async ({ page }) => {
  await mockBackend(page, { authenticated: false, hasOwner: false, emailReady: false });
  await page.goto("/entrar");
  await page.getByRole("button", { name: "Criar conta do proprietário" }).click();
  await expect(page.getByRole("button", { name: "Criar minha conta" })).toBeDisabled();
  await expect(
    page.getByText("Desative a confirmação de e-mail no Supabase antes do cadastro."),
  ).toBeVisible();
});

test("existing owner removes public signup from the interface", async ({ page }) => {
  await mockBackend(page, { authenticated: false, hasOwner: true });
  await page.goto("/entrar");
  await expect(page.getByRole("button", { name: "Entrar na minha conta" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar conta do proprietário" }),
  ).toHaveCount(0);
});
