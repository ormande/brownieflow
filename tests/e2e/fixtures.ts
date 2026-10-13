import type { Page, Route } from "@playwright/test";
import type { AppData } from "../../src/types";

// These records and network interceptors exist exclusively in browser tests.
// Database functions, constraints and isolation are exercised by database.test.ts.
export const ownerId = "00000000-0000-4000-8000-000000000001";
export const productId = "00000000-0000-4000-8000-000000000002";
export const customerId = "00000000-0000-4000-8000-000000000003";
const timestamp = "2026-10-13T12:00:00.000Z";
const base = { user_id: ownerId, created_at: timestamp, updated_at: timestamp };

export function emptyData(): AppData {
  return {
    profiles: [
      {
        ...base,
        id: ownerId,
        username: "teste",
        display_name: "Empreendedor",
        business_name: "BrownieFlow",
        due_days: 7,
        whatsapp_template: "",
        low_stock_threshold: 10,
        theme: "light",
      },
    ],
    products: [
      {
        ...base,
        id: productId,
        name: "Brownie tradicional",
        cash_price_cents: 500,
        credit_price_cents: 600,
        stock: 0,
        average_cost_cents: 180,
        active: true,
        is_default: true,
      },
    ],
    customers: [],
    sales: [],
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

export function stockedData(): AppData {
  const data = emptyData();
  data.products[0]!.stock = 30;
  data.customers.push({
    ...base,
    id: customerId,
    name: "Cliente de teste",
    phone: "65999999999",
    notes: "",
    archived: false,
  });
  return data;
}

type Options = {
  authenticated?: boolean;
  data?: AppData;
  rpc?: (route: Route) => Promise<void>;
  failReads?: boolean;
  missingSchema?: boolean;
  hasOwner?: boolean;
  emailReady?: boolean;
};

export async function mockBackend(page: Page, options: Options = {}) {
  const data = options.data ?? emptyData();
  const user = {
    id: ownerId,
    aud: "authenticated",
    role: "authenticated",
    email: "teste@brownieflow.internal",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { username: "teste" },
    created_at: timestamp,
  };
  const exp = Math.floor(Date.now() / 1000) + 86_400;
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: ownerId, role: "authenticated", exp })).toString(
      "base64url",
    ),
    "test-signature",
  ].join(".");
  const session = {
    access_token: accessToken,
    refresh_token: "browser-test-refresh",
    token_type: "bearer",
    expires_at: exp,
    expires_in: 86_400,
    user,
  };
  if (options.authenticated !== false) {
    await page.addInitScript((value) => {
      localStorage.setItem("sb-brownieflow-test-auth-token", JSON.stringify(value));
    }, session);
  }
  await page.routeWebSocket("wss://brownieflow-test.supabase.co/**", (socket) =>
    socket.close(),
  );
  await page.route("https://brownieflow-test.supabase.co/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/rest/v1/rpc/installation_status") {
      await route.fulfill(
        options.missingSchema
          ? { status: 404, json: { code: "PGRST202", message: "Function missing" } }
          : {
              json: {
                installed: true,
                has_owner: options.hasOwner ?? true,
                schema_version: "202610130001",
              },
            },
      );
      return;
    }
    if (path === "/auth/v1/settings") {
      await route.fulfill({
        json: {
          mailer_autoconfirm: options.emailReady ?? true,
          external: { email: true },
        },
      });
      return;
    }
    if (path === "/rest/v1/rpc/get_app_data") {
      await route.fulfill(
        options.failReads
          ? { status: 503, json: { message: "Serviço temporariamente indisponível" } }
          : { json: data },
      );
      return;
    }
    if (path.startsWith("/rest/v1/rpc/")) {
      if (options.rpc) await options.rpc(route);
      else
        await route.fulfill({
          status: 400,
          json: { message: "Unexpected mutation in read-only browser test." },
        });
      return;
    }
    if (path.startsWith("/rest/v1/") && request.method() === "GET") {
      if (options.failReads) {
        await route.fulfill({
          status: 503,
          json: { message: "Serviço temporariamente indisponível" },
        });
      } else {
        const table = path.split("/").at(-1) as keyof AppData;
        if (!(table in data)) throw new Error(`Unstubbed table: ${table}`);
        await route.fulfill({ json: data[table] });
      }
      return;
    }
    if (path === "/auth/v1/user") {
      await route.fulfill({ json: user });
      return;
    }
    if (path === "/auth/v1/logout") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if (path === "/auth/v1/token") {
      await route.fulfill({
        status: 400,
        json: { error: "invalid_grant", error_description: "Invalid login credentials" },
      });
      return;
    }
    await route.fulfill({
      status: 400,
      json: { message: `Unexpected browser-test request: ${request.method()} ${path}` },
    });
  });
  return data;
}
