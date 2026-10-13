import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// This runs the actual migration in embedded PostgreSQL; only Supabase Auth is stubbed.
// Hosted Auth delivery, token refresh and concurrent connections require deployment smoke tests.
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const foreignCustomer = "33333333-3333-4333-8333-333333333333";
const foreignProduct = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
let product: string;
let recipe: string;
let customer: string;

async function one<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
) {
  const result = await db.query<T>(sql, params);
  return result.rows[0];
}
async function rpc(name: string, data: Record<string, unknown>) {
  const row = await one<{ result: { id: string } }>(
    `select public.${name}($1::jsonb) as result`,
    [JSON.stringify(data)],
  );
  return row.result;
}
async function rejected(action: () => Promise<unknown>) {
  await db.exec("savepoint expected_error");
  let error: unknown;
  try {
    await action();
  } catch (caught) {
    error = caught;
  }
  await db.exec("rollback to savepoint expected_error; release savepoint expected_error");
  if (error) throw error;
}
const request = (data: Record<string, unknown>) => ({
  request_id: randomUUID(),
  ...data,
});
const stock = (quantity = 100) =>
  rpc(
    "adjust_stock",
    request({
      product_id: product,
      quantity,
      kind: "adjustment",
      reason: "Contagem inicial de estoque",
      movement_date: "2026-10-01",
    }),
  );
const sale = (overrides: Record<string, unknown> = {}) =>
  rpc(
    "create_sale",
    request({
      customer_id: customer,
      product_id: product,
      quantity: 1,
      modality: "credit",
      unit_price_cents: 600,
      discount_cents: 0,
      sale_date: "2026-10-01",
      due_date: "2026-10-08",
      immediate_payment_cents: 0,
      ...overrides,
    }),
  );
const pay = (amount: number, overrides: Record<string, unknown> = {}) =>
  rpc(
    "record_payment",
    request({
      customer_id: customer,
      amount_cents: amount,
      payment_date: "2026-10-08",
      method: "pix",
      ...overrides,
    }),
  );
async function balance(saleId: string) {
  const row = await one<{ balance: number }>(
    `select (s.total_cents + coalesce((select sum(amount_cents) from receivable_adjustments where sale_id=s.id),0)
    - coalesce((select sum(a.amount_cents) from payment_allocations a join payments p on p.id=a.payment_id where a.sale_id=s.id and p.voided_at is null),0))::integer balance from sales s where id=$1`,
    [saleId],
  );
  return row.balance;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}', updated_at timestamptz default now(),
      confirmation_token text default '', confirmation_sent_at timestamptz, recovery_token text default '', recovery_sent_at timestamptz,
      email_change text default '', email_change_token_current text default '', email_change_token_new text default '', email_change_sent_at timestamptz, email_change_confirm_status smallint default 0,
      phone_change text default '', phone_change_token text default '', phone_change_sent_at timestamptz,
      reauthentication_token text default '', reauthentication_sent_at timestamptz);
    create table auth.identities(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), provider text, identity_data jsonb, updated_at timestamptz default now());
    create table auth.one_time_tokens(id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id), token_hash text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values($1,'proprietario@brownieflow.internal','{"username":"proprietario"}')`,
    [owner],
  );
  // A second tenant is an administrator-created fixture solely for isolation testing.
  await db.exec("alter table auth.users disable trigger brownieflow_new_user");
  await db.query(
    `insert into auth.users(id,email) values($1,'outro@brownieflow.internal')`,
    [other],
  );
  await db.exec("alter table auth.users enable trigger brownieflow_new_user");
  await db.query(
    `insert into profiles(id,user_id,username,display_name) values($1,$1,'outro','Outro')`,
    [other],
  );
  await db.query(
    `insert into customers(id,user_id,name) values($1,$2,'Cliente privado')`,
    [foreignCustomer, other],
  );
  await db.query(
    `insert into products(id,user_id,name,stock) values($1,$2,'Produto privado',99)`,
    [foreignProduct, other],
  );
  product = (
    await one<{ id: string }>("select id from products where user_id=$1", [owner])
  ).id;
  recipe = (await one<{ id: string }>("select id from recipes where user_id=$1", [owner]))
    .id;
}, 60_000);

beforeEach(async () => {
  await db.exec("begin; set local role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub',$1,true)`, [owner]);
  customer = (
    await one<{ id: string }>(
      `insert into customers(name,phone) values('Fernandes','65999999999') returning id`,
    )
  ).id;
});
afterEach(async () => {
  await db.exec("rollback; reset role");
});
afterAll(async () => {
  await db?.close();
});

describe("proprietário, seed e isolamento", () => {
  it("cria somente cadastros padrão e nenhum dado financeiro fictício", async () => {
    expect(
      (await one<{ count: number }>("select count(*)::int count from ingredients")).count,
    ).toBe(5);
    expect(
      (await one<{ count: number }>("select count(*)::int count from recipe_ingredients"))
        .count,
    ).toBe(5);
    for (const table of [
      "sales",
      "payments",
      "expenses",
      "stock_movements",
      "production_batches",
    ]) {
      expect(
        (await one<{ count: number }>(`select count(*)::int count from ${table}`)).count,
      ).toBe(0);
    }
    expect(
      Number((await one("select stock from products where id=$1", [product])).stock),
    ).toBe(0);
  });

  it("bloqueia novos cadastros após o primeiro proprietário", async () => {
    await db.exec("set local role postgres");
    await expect(
      rejected(() =>
        db.query(
          `insert into auth.users(id,email) values($1,'terceiro@brownieflow.internal')`,
          [randomUUID()],
        ),
      ),
    ).rejects.toThrow(/proprietário já foi cadastrado/);
  });

  it("oculta todos os dados de outros usuários com RLS", async () => {
    expect(
      (await db.query("select * from customers where id=$1", [foreignCustomer])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from products where id=$1", [foreignProduct])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from profiles where user_id=$1", [other])).rows,
    ).toHaveLength(0);
    const policies = await one<{ count: number }>(
      `select count(*)::int count from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`,
    );
    expect(policies.count).toBe(16);
    await expect(
      rejected(() =>
        db.query(`insert into customers(user_id,name) values($1,'Intrusão')`, [other]),
      ),
    ).rejects.toThrow(/row-level security/);
    expect(
      (
        await db.query(`update customers set name='Intrusão' where id=$1 returning id`, [
          foreignCustomer,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it("recusa referências a cliente e produto de outro usuário nas RPCs", async () => {
    await stock();
    await expect(rejected(() => sale({ customer_id: foreignCustomer }))).rejects.toThrow(
      /Cliente não encontrado/,
    );
    await expect(rejected(() => sale({ product_id: foreignProduct }))).rejects.toThrow(
      /Produto não encontrado/,
    );
    await expect(
      rejected(() =>
        rpc(
          "adjust_stock",
          request({
            product_id: foreignProduct,
            quantity: 1,
            kind: "adjustment",
            reason: "Intrusão",
          }),
        ),
      ),
    ).rejects.toThrow(/não encontrado/);
  });

  it("impede referências entre usuários pelas foreign keys compostas", async () => {
    await db.exec("set local role postgres");
    await expect(
      rejected(() =>
        db.query(
          `insert into sales(user_id,customer_id,modality,gross_cents,total_cents,request_id,due_date) values($1,$2,'credit',600,600,$3,current_date)`,
          [owner, foreignCustomer, randomUUID()],
        ),
      ),
    ).rejects.toThrow(/foreign key constraint/);
  });

  it("nega mutação direta em estoque, custos, finanças e perfis", async () => {
    await expect(
      rejected(() => db.query("update products set stock=999 where id=$1", [product])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      rejected(() => db.exec("update ingredients set average_cost_cents=0")),
    ).rejects.toThrow(/permission denied/);
    for (const table of [
      "sales",
      "sale_items",
      "payments",
      "payment_allocations",
      "receivable_adjustments",
      "recipe_ingredients",
      "production_batches",
      "stock_movements",
      "profiles",
    ]) {
      await expect(rejected(() => db.exec(`delete from ${table}`))).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(
      rejected(() => db.exec("select * from app_private.requests")),
    ).rejects.toThrow(/permission denied/);
  });

  it("recusa usuário anônimo nas tabelas e funções", async () => {
    await db.exec("set local role anon");
    await expect(rejected(() => db.exec("select * from sales"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(rejected(() => sale())).rejects.toThrow(/permission denied/);
    await expect(rejected(() => db.exec("select get_app_data()"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("expõe anonimamente apenas a prontidão da instalação e a existência do proprietário", async () => {
    await db.exec("set local role anon");
    expect((await one("select installation_status() status")).status).toEqual({
      installed: true,
      has_owner: true,
      schema_version: "202610130001",
    });
    await expect(
      rejected(() => db.exec("select * from app_private.owner_registry")),
    ).rejects.toThrow(/permission denied/);
    await db.exec("set local role postgres");
    // Test-only simulation of the state before the first signup; rollback restores it.
    await db.exec("delete from app_private.owner_registry; set local role anon");
    expect((await one("select installation_status() status")).status).toEqual({
      installed: true,
      has_owner: false,
      schema_version: "202610130001",
    });
  });

  it("lê todas as coleções em uma consulta isolada e preserva arrays vazios", async () => {
    const { data } = await one<{ data: Record<string, { user_id: string }[]> }>(
      "select get_app_data() data",
    );
    expect(Object.keys(data)).toHaveLength(16);
    expect(data.profiles).toHaveLength(1);
    expect(data.products).toHaveLength(1);
    expect(data.ingredients).toHaveLength(5);
    expect(data.customers).toHaveLength(1);
    for (const rows of Object.values(data)) {
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.every((row) => row.user_id === owner)).toBe(true);
    }
    for (const table of [
      "sales",
      "payments",
      "expenses",
      "stock_movements",
      "production_batches",
    ])
      expect(data[table]).toEqual([]);
    const fn = await one(
      `select prosecdef,provolatile from pg_proc where oid='public.get_app_data()'::regprocedure`,
    );
    expect(fn).toEqual({ prosecdef: false, provolatile: "s" });
    await db.query(`select set_config('request.jwt.claim.sub',$1,true)`, [other]);
    const otherData = (
      await one<{ data: Record<string, { user_id: string }[]> }>(
        "select get_app_data() data",
      )
    ).data;
    expect(otherData.ingredients).toEqual([]);
    expect(
      Object.values(otherData)
        .flat()
        .every((row) => row.user_id === other),
    ).toBe(true);
  });

  it("retorna histórico completo acima de mil linhas sem perder referências", async () => {
    await db.exec(
      `insert into customers(name) select 'Cliente '||n from generate_series(1,1001) n`,
    );
    await stock(12);
    const created = await sale({ immediate_payment_cents: 250 });
    const { data } = await one<{
      data: Record<string, { id: string; sale_id?: string; payment_id?: string }[]>;
    }>("select get_app_data() data");
    expect(data.customers).toHaveLength(1002);
    expect(data.sales[0].id).toBe(created.id);
    expect(data.sale_items[0].sale_id).toBe(created.id);
    expect(data.payment_allocations[0].sale_id).toBe(created.id);
    expect(data.payment_allocations[0].payment_id).toBe(data.payments[0].id);
  });

  it("altera username no perfil e na identidade do Supabase atomicamente", async () => {
    await db.exec("set local role postgres");
    await db.query(
      `insert into auth.identities(user_id,provider,identity_data) values($1,'email','{"email":"proprietario@brownieflow.internal","sub":"preservar"}')`,
      [owner],
    );
    await db.exec("set local role authenticated");
    await rpc("update_profile", {
      username: "nova_conta",
      display_name: "Maria",
      theme: "dark",
    });
    expect((await one("select username,display_name from profiles")).username).toBe(
      "nova_conta",
    );
    await db.exec("set local role postgres");
    expect((await one("select email from auth.users where id=$1", [owner])).email).toBe(
      "nova_conta@brownieflow.internal",
    );
    expect(
      (await one("select identity_data from auth.identities where user_id=$1", [owner]))
        .identity_data,
    ).toEqual({ email: "nova_conta@brownieflow.internal", sub: "preservar" });
  });

  it("invalida tokens pendentes ao trocar username e preserva outras identidades", async () => {
    await db.exec("set local role postgres");
    await db.query(
      `update auth.users set recovery_token='recovery antigo',email_change='antigo@example.com',email_change_token_new='token antigo',reauthentication_token='reauth antigo' where id=$1`,
      [owner],
    );
    await db.query(
      `insert into auth.one_time_tokens(user_id,token_hash) values($1,'hash proprietário'),($2,'hash outra conta')`,
      [owner, other],
    );
    await db.query(
      `insert into auth.identities(user_id,provider,identity_data) values($1,'email',null),($1,'google','{"email":"oauth@example.com","sub":"oauth-sub"}')`,
      [owner],
    );
    await db.exec("set local role authenticated");
    await rpc("update_profile", { username: "nova_conta" });
    await db.exec("set local role postgres");
    expect(
      await one(
        "select email_change,email_change_token_new,recovery_token,reauthentication_token from auth.users where id=$1",
        [owner],
      ),
    ).toEqual({
      email_change: "",
      email_change_token_new: "",
      recovery_token: "",
      reauthentication_token: "",
    });
    expect(
      (
        await one(
          "select count(*)::int total from auth.one_time_tokens where user_id=$1",
          [owner],
        )
      ).total,
    ).toBe(0);
    expect(
      (
        await one(
          "select count(*)::int total from auth.one_time_tokens where user_id=$1",
          [other],
        )
      ).total,
    ).toBe(1);
    expect(
      (
        await one(
          `select identity_data from auth.identities where user_id=$1 and provider='email'`,
          [owner],
        )
      ).identity_data,
    ).toEqual({ email: "nova_conta@brownieflow.internal" });
    expect(
      (
        await one(
          `select identity_data from auth.identities where user_id=$1 and provider='google'`,
          [owner],
        )
      ).identity_data,
    ).toEqual({ email: "oauth@example.com", sub: "oauth-sub" });
  });

  it("desfaz alteração do perfil se o novo email conflitar no Auth", async () => {
    await db.exec("set local role postgres");
    await db.query(
      `update auth.users set email='ocupado@brownieflow.internal' where id=$1`,
      [other],
    );
    await db.exec("set local role authenticated");
    await expect(
      rejected(() =>
        rpc("update_profile", { username: "ocupado", display_name: "Não persistir" }),
      ),
    ).rejects.toThrow(/duplicate key/);
    expect(await one("select username,display_name from profiles")).toEqual({
      username: "proprietario",
      display_name: "proprietario",
    });
  });

  it("troca produto padrão atomicamente e recusa produtos inativos ou de outra conta", async () => {
    const next = (
      await one<{ id: string }>(
        `insert into products(name) values('Brownie especial') returning id`,
      )
    ).id;
    await rpc("set_default_product", { product_id: next });
    expect((await db.query("select id from products where is_default")).rows).toEqual([
      { id: next },
    ]);
    await db.query("update products set active=false where id=$1", [product]);
    await expect(
      rejected(() => rpc("set_default_product", { product_id: product })),
    ).rejects.toThrow(/produto ativo/);
    await expect(
      rejected(() => rpc("set_default_product", { product_id: foreignProduct })),
    ).rejects.toThrow(/produto ativo/);
    expect((await db.query("select id from products where is_default")).rows).toEqual([
      { id: next },
    ]);
  });
});

describe("vendas, pagamentos e auditoria", () => {
  it("exige vencimento no fiado e mantém estoque em caso de erro", async () => {
    await stock(12);
    for (const due_date of [undefined, null, ""]) {
      await expect(rejected(() => sale({ due_date }))).rejects.toThrow(/vencimento/);
    }
    expect((await db.query("select id from sales")).rows).toHaveLength(0);
    expect(
      Number((await one("select stock from products where id=$1", [product])).stock),
    ).toBe(12);
    await sale({ modality: "cash", due_date: null });
  });

  it("recusa identificadores ausentes, inexistentes e request_id ausente", async () => {
    await stock(12);
    await expect(
      rejected(() => rpc("create_sale", { product_id: product })),
    ).rejects.toThrow(/Identificador/);
    for (const sale_id of [undefined, randomUUID()]) {
      await expect(
        rejected(() => rpc("cancel_sale", { sale_id, reason: "Venda inválida" })),
      ).rejects.toThrow(/Venda não encontrada/);
      await expect(
        rejected(() =>
          rpc(
            "adjust_receivable",
            request({ sale_id, amount_cents: 1, reason: "Ajuste inválido" }),
          ),
        ),
      ).rejects.toThrow(/Venda não encontrada/);
    }
    await expect(
      rejected(() => rpc("void_payment", { reason: "Pagamento inválido" })),
    ).rejects.toThrow(/Pagamento não encontrado/);
    await expect(rejected(() => rpc("set_default_product", {}))).rejects.toThrow(
      /produto ativo/,
    );
    await expect(rejected(() => sale({ product_id: undefined }))).rejects.toThrow(
      /Produto não encontrado/,
    );
    expect((await db.query("select id from sales")).rows).toHaveLength(0);
  });

  it("bloqueia overflow de centavos em vendas, preços, despesas, compras e pagamentos", async () => {
    const tooLarge = "9007199254740992";
    await stock(12);
    await expect(
      rejected(() => sale({ quantity: 2, unit_price_cents: "9007199254740991" })),
    ).rejects.toThrow(/safe_integer/);
    await expect(
      rejected(() =>
        db.query("update products set cash_price_cents=$1 where id=$2", [
          tooLarge,
          product,
        ]),
      ),
    ).rejects.toThrow(/safe_integer/);
    await expect(
      rejected(() =>
        db.query(
          `insert into expenses(description,category,amount_cents,method) values('Fora do limite','Outros',$1,'pix')`,
          [tooLarge],
        ),
      ),
    ).rejects.toThrow(/safe_integer/);
    await expect(
      rejected(() =>
        rpc(
          "record_payment",
          request({ customer_id: null, amount_cents: tooLarge, method: "pix" }),
        ),
      ),
    ).rejects.toThrow(/safe_integer/);
    const ingredients = (
      await db.query<{ id: string }>("select id from ingredients limit 2")
    ).rows;
    await expect(
      rejected(() =>
        rpc(
          "record_purchase",
          request({
            method: "pix",
            items: ingredients.map((ingredient) => ({
              ingredient_id: ingredient.id,
              quantity: 100000,
              total_cents: "4503599627370496",
            })),
          }),
        ),
      ),
    ).rejects.toThrow(/safe_integer/);
    expect((await db.query("select id from sales")).rows).toHaveLength(0);
    expect((await db.query("select id from ingredient_purchases")).rows).toHaveLength(0);
    expect((await db.query("select id from expenses")).rows).toHaveLength(0);
    // The exact boundary is accepted without being rounded by the API parser.
    await rpc(
      "record_payment",
      request({ customer_id: null, amount_cents: "9007199254740991", method: "pix" }),
    );
    expect((await one("select amount_cents::text amount from payments")).amount).toBe(
      "9007199254740991",
    );
  });

  it("limita também a soma dos ajustes da venda, inclusive depois de pagamentos", async () => {
    await stock(12);
    const s = await sale();
    await rpc(
      "adjust_receivable",
      request({
        sale_id: s.id,
        amount_cents: "9007199254740391",
        reason: "Ajuste no limite",
      }),
    );
    await pay(600);
    await expect(
      rejected(() =>
        rpc(
          "adjust_receivable",
          request({ sale_id: s.id, amount_cents: 1, reason: "Além do limite" }),
        ),
      ),
    ).rejects.toThrow(/limite financeiro/);
    expect(
      (await one("select count(*)::int total from receivable_adjustments")).total,
    ).toBe(1);
  });

  it("preserva preço bruto e desconto e não quita uma venda à vista automaticamente", async () => {
    await stock(12);
    const s = await sale({
      modality: "cash",
      unit_price_cents: 600,
      discount_cents: 200,
    });
    expect(await balance(s.id)).toBe(400);
    const row = await one(
      "select gross_cents::int,discount_cents::int,total_cents::int from sales where id=$1",
      [s.id],
    );
    expect(row).toEqual({ gross_cents: 600, discount_cents: 200, total_cents: 400 });
    expect((await db.query("select * from payments")).rows).toHaveLength(0);
    expect(
      Number((await one("select stock from products where id=$1", [product])).stock),
    ).toBe(11);
  });

  it("divide R$20 entre três compras de R$12, mantendo R$16 pendentes", async () => {
    await stock();
    const ids = [
      await sale({ quantity: 2, sale_date: "2026-10-01" }),
      await sale({ quantity: 2, sale_date: "2026-10-02" }),
      await sale({ quantity: 2, sale_date: "2026-10-03" }),
    ];
    const p = await pay(2000);
    expect(await Promise.all(ids.map((s) => balance(s.id)))).toEqual([0, 400, 1200]);
    expect(
      (
        await one<{ total: number }>(
          "select sum(amount_cents)::int total from payment_allocations where payment_id=$1",
          [p.id],
        )
      ).total,
    ).toBe(2000);
    await pay(1600);
    expect(await Promise.all(ids.map((s) => balance(s.id)))).toEqual([0, 0, 0]);
  });

  it("aceita pagamento imediato parcial e deriva o saldo correto", async () => {
    await stock();
    const s = await sale({ quantity: 2, immediate_payment_cents: 300, method: "cash" });
    expect(await balance(s.id)).toBe(900);
    expect((await one("select method,amount_cents::int from payments")).method).toBe(
      "cash",
    );
  });

  it("registra uma operação uma só vez e recusa reuso com outro conteúdo", async () => {
    await stock(12);
    const payload = request({
      customer_id: customer,
      product_id: product,
      quantity: 2,
      modality: "credit",
      sale_date: "2026-10-01",
      due_date: "2026-10-08",
      unit_price_cents: 600,
      immediate_payment_cents: 600,
      method: "pix",
    });
    const first = await rpc("create_sale", payload);
    expect(await rpc("create_sale", payload)).toEqual(first);
    expect((await db.query("select id from sales")).rows).toHaveLength(1);
    expect((await db.query("select id from payments")).rows).toHaveLength(1);
    expect(
      Number((await one("select stock from products where id=$1", [product])).stock),
    ).toBe(10);
    await expect(
      rejected(() => rpc("create_sale", { ...payload, quantity: 3 })),
    ).rejects.toThrow(/já foi usado/);
  });

  it("recusa pagamento acima do saldo sem criar recebimentos", async () => {
    await stock();
    await sale();
    await expect(rejected(() => pay(601))).rejects.toThrow(/excede o saldo/);
    expect((await db.query("select id from payments")).rows).toHaveLength(0);
  });

  it("recusa alocação de vendas de clientes diferentes e duplicidade de venda", async () => {
    await stock();
    const s = await sale();
    await expect(
      rejected(() => pay(100, { customer_id: null, sale_ids: [s.id] })),
    ).rejects.toThrow(/pertencer ao cliente/);
    await expect(rejected(() => pay(100, { sale_ids: [s.id, s.id] }))).rejects.toThrow(
      /duplicada/,
    );
  });

  it("permite recebimento sem vínculo e não o aloca arbitrariamente", async () => {
    await stock();
    const s = await sale();
    await pay(200, { customer_id: null });
    expect((await db.query("select * from payment_allocations")).rows).toHaveLength(0);
    expect(await balance(s.id)).toBe(600);
  });

  it("registra pagamento retroativo apenas nas vendas já existentes na data", async () => {
    await stock();
    const first = await sale({ sale_date: "2026-10-01", due_date: "2026-10-05" });
    const later = await sale({ sale_date: "2026-10-10", due_date: "2026-10-15" });
    await pay(600, { payment_date: "2026-10-08" });
    expect(await balance(first.id)).toBe(0);
    expect(await balance(later.id)).toBe(600);
    await expect(
      rejected(() => pay(100, { payment_date: "2026-10-08" })),
    ).rejects.toThrow(/anterior à venda/);
  });

  it("preserva o histórico de estorno e reabre a dívida sem estornar duas vezes", async () => {
    await stock();
    const s = await sale();
    const p = await pay(400);
    await rpc("void_payment", {
      payment_id: p.id,
      reason: "Valor informado incorretamente",
    });
    await rpc("void_payment", {
      payment_id: p.id,
      reason: "Repetição da mesma solicitação",
    });
    expect(await balance(s.id)).toBe(600);
    expect((await db.query("select * from payment_allocations")).rows).toHaveLength(1);
    expect((await one("select void_reason from payments")).void_reason).toBe(
      "Valor informado incorretamente",
    );
  });

  it("concede desconto posterior sem alterar a venda e impede dívida abaixo do pago", async () => {
    await stock();
    const s = await sale();
    await pay(300);
    await rpc(
      "adjust_receivable",
      request({
        sale_id: s.id,
        amount_cents: -200,
        reason: "Desconto por fidelidade",
        adjustment_date: "2026-10-08",
      }),
    );
    expect(await balance(s.id)).toBe(100);
    expect((await one("select total_cents::int from sales")).total_cents).toBe(600);
    await expect(
      rejected(() =>
        rpc(
          "adjust_receivable",
          request({ sale_id: s.id, amount_cents: -101, reason: "Desconto indevido" }),
        ),
      ),
    ).rejects.toThrow(/excede o saldo/);
  });

  it("exige estorno antes de cancelar e devolve o estoque uma única vez", async () => {
    await stock(12);
    const s = await sale({ immediate_payment_cents: 600, method: "pix" });
    await expect(
      rejected(() => rpc("cancel_sale", { sale_id: s.id, reason: "Venda incorreta" })),
    ).rejects.toThrow(/Estorne os pagamentos/);
    const p = await one<{ id: string }>("select id from payments");
    await rpc("void_payment", { payment_id: p.id, reason: "Cancelamento da venda" });
    await rpc("cancel_sale", { sale_id: s.id, reason: "Venda incorreta" });
    await rpc("cancel_sale", { sale_id: s.id, reason: "Venda incorreta" });
    expect(
      Number((await one("select stock from products where id=$1", [product])).stock),
    ).toBe(12);
    expect(
      (await db.query(`select * from stock_movements where kind='cancellation'`)).rows,
    ).toHaveLength(1);
    expect((await one("select cancelled_at from sales")).cancelled_at).not.toBeNull();
  });

  it("reverte venda, estoque e pagamento juntos quando a forma de pagamento é inválida", async () => {
    await stock(12);
    await expect(
      rejected(() => sale({ immediate_payment_cents: 600, method: "invalid" })),
    ).rejects.toThrow(/check constraint/);
    expect((await db.query("select * from sales")).rows).toHaveLength(0);
    expect(
      Number((await one("select stock from products where id=$1", [product])).stock),
    ).toBe(12);
  });
});

describe("compras, receitas e estoque", () => {
  it.each(["NaN", "Infinity", "-Infinity"])(
    "rejeita %s em todos os caminhos de quantidade sem gravar movimentos",
    async (invalid) => {
      const ingredient = (await one<{ id: string }>("select id from ingredients limit 1"))
        .id;
      for (const target of [{ product_id: product }, { ingredient_id: ingredient }]) {
        await expect(
          rejected(() =>
            rpc(
              "adjust_stock",
              request({
                ...target,
                quantity: invalid,
                kind: "adjustment",
                reason: "Contagem inválida",
              }),
            ),
          ),
        ).rejects.toThrow();
      }
      await expect(
        rejected(() =>
          db.query("update ingredients set minimum_stock=$1 where id=$2", [
            invalid,
            ingredient,
          ]),
        ),
      ).rejects.toThrow();
      await expect(
        rejected(() =>
          rpc(
            "record_purchase",
            request({
              method: "pix",
              items: [{ ingredient_id: ingredient, quantity: invalid, total_cents: 100 }],
            }),
          ),
        ),
      ).rejects.toThrow();
      await expect(
        rejected(() =>
          rpc("save_recipe", {
            id: recipe,
            product_id: product,
            name: "Não salvar",
            yield_quantity: 12,
            is_default: true,
            items: [{ ingredient_id: ingredient, quantity: invalid }],
          }),
        ),
      ).rejects.toThrow();
      await expect(
        rejected(() =>
          rpc(
            "record_production",
            request({ recipe_id: recipe, batches: invalid, actual_quantity: 12 }),
          ),
        ),
      ).rejects.toThrow();
      expect((await one("select count(*)::int total from stock_movements")).total).toBe(
        0,
      );
      expect(
        (await one("select count(*)::int total from ingredient_purchases")).total,
      ).toBe(0);
      expect(
        (await one("select count(*)::int total from production_batches")).total,
      ).toBe(0);
      expect(
        (await one("select count(*)::int total from recipe_ingredients")).total,
      ).toBe(5);
      expect((await one("select name from recipes")).name).toBe("Brownie tradicional");
    },
  );

  it("rejeita ingredientes repetidos ou sem id na compra e na receita", async () => {
    const ingredient = (await one<{ id: string }>("select id from ingredients limit 1"))
      .id;
    for (const items of [
      [
        { ingredient_id: ingredient, quantity: 1, total_cents: 100 },
        { ingredient_id: ingredient, quantity: 2, total_cents: 100 },
      ],
      [{ quantity: 1, total_cents: 100 }],
    ]) {
      await expect(
        rejected(() => rpc("record_purchase", request({ method: "pix", items }))),
      ).rejects.toThrow();
      await expect(
        rejected(() =>
          rpc("save_recipe", {
            id: recipe,
            product_id: product,
            name: "Não salvar",
            yield_quantity: 12,
            is_default: true,
            items,
          }),
        ),
      ).rejects.toThrow();
    }
    expect(
      (await one("select count(*)::int total from ingredient_purchases")).total,
    ).toBe(0);
    expect((await one("select count(*)::int total from recipe_ingredients")).total).toBe(
      5,
    );
  });

  it("usa custo médio ponderado e cria exatamente uma despesa por compra", async () => {
    const ingredient = await one<{ id: string }>(
      `select id from ingredients where name='Farinha de trigo'`,
    );
    const data = request({
      purchase_date: "2026-10-01",
      method: "pix",
      items: [{ ingredient_id: ingredient.id, quantity: 1000, total_cents: 300 }],
    });
    await rpc("record_purchase", data);
    await rpc("record_purchase", data);
    await rpc(
      "record_purchase",
      request({
        purchase_date: "2026-10-02",
        method: "cash",
        items: [{ ingredient_id: ingredient.id, quantity: 1000, total_cents: 500 }],
      }),
    );
    const row = await one(
      "select stock,average_cost_cents from ingredients where id=$1",
      [ingredient.id],
    );
    expect(Number(row.stock)).toBe(2000);
    expect(Number(row.average_cost_cents)).toBeCloseTo(0.4, 6);
    expect((await db.query("select * from expenses")).rows).toHaveLength(2);
    expect((await one("select sum(amount_cents)::int total from expenses")).total).toBe(
      800,
    );
    expect(
      (
        await db.query(
          `update expenses set amount_cents=1 where purchase_id is not null returning id`,
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("delete from expenses where purchase_id is not null returning id"))
        .rows,
    ).toHaveLength(0);
  });

  it("não grava compra nem estoque se algum item não pertence ao usuário", async () => {
    const ingredient = await one<{ id: string }>("select id from ingredients limit 1");
    await expect(
      rejected(() =>
        rpc(
          "record_purchase",
          request({
            method: "pix",
            items: [
              { ingredient_id: ingredient.id, quantity: 100, total_cents: 200 },
              { ingredient_id: randomUUID(), quantity: 2, total_cents: 300 },
            ],
          }),
        ),
      ),
    ).rejects.toThrow(/Ingrediente não encontrado/);
    expect((await db.query("select * from ingredient_purchases")).rows).toHaveLength(0);
    expect(
      Number(
        (await one("select stock from ingredients where id=$1", [ingredient.id])).stock,
      ),
    ).toBe(0);
  });

  it("consome insumos, registra custo do lote e adiciona rendimento real", async () => {
    const ingredients = (
      await db.query<{ id: string; name: string }>("select id,name from ingredients")
    ).rows;
    const packages: Record<string, [number, number]> = {
      "Farinha de trigo": [1000, 299],
      Açúcar: [2000, 499],
      "Achocolatado Chocky": [400, 575],
      Ovos: [20, 879],
      Margarina: [500, 577],
    };
    await rpc(
      "record_purchase",
      request({
        method: "pix",
        purchase_date: "2026-10-01",
        items: ingredients.map((i) => ({
          ingredient_id: i.id,
          quantity: packages[i.name][0],
          total_cents: packages[i.name][1],
        })),
      }),
    );
    const productionData = request({
      recipe_id: recipe,
      production_date: "2026-10-02",
      batches: 1,
      actual_quantity: 10,
    });
    const batch = await rpc("record_production", productionData);
    expect(await rpc("record_production", productionData)).toEqual(batch);
    expect(
      await one(
        "select total_cost_cents::int,expected_quantity,actual_quantity from production_batches",
      ),
    ).toEqual({ total_cost_cents: 812, expected_quantity: 12, actual_quantity: 10 });
    const row = await one("select stock,average_cost_cents from products where id=$1", [
      product,
    ]);
    expect(Number(row.stock)).toBe(10);
    expect(Number(row.average_cost_cents)).toBe(81.2);
    expect(
      Number(
        (await one(`select stock from ingredients where name='Achocolatado Chocky'`))
          .stock,
      ),
    ).toBe(30);
    expect((await db.query("select * from expenses")).rows).toHaveLength(1);
    expect(
      (await db.query(`select * from stock_movements where kind='production'`)).rows,
    ).toHaveLength(6);
    await expect(
      rejected(() =>
        rpc(
          "record_production",
          request({ recipe_id: recipe, batches: 1, actual_quantity: 12 }),
        ),
      ),
    ).rejects.toThrow(/Estoque insuficiente/);
    expect((await db.query("select * from production_batches")).rows).toHaveLength(1);
  });

  it("impede estoque negativo, fração de produto e movimentação sem motivo", async () => {
    await expect(rejected(() => sale())).rejects.toThrow(/Estoque insuficiente/);
    await expect(
      rejected(() =>
        rpc(
          "adjust_stock",
          request({
            product_id: product,
            quantity: -1,
            kind: "loss",
            reason: "Brownie danificado",
          }),
        ),
      ),
    ).rejects.toThrow(/negativo/);
    await expect(
      rejected(() =>
        rpc(
          "adjust_stock",
          request({
            product_id: product,
            quantity: 1.5,
            kind: "adjustment",
            reason: "Contagem física",
          }),
        ),
      ),
    ).rejects.toThrow(/inteira/);
    await expect(
      rejected(() =>
        rpc(
          "adjust_stock",
          request({ product_id: product, quantity: 1, kind: "adjustment", reason: "" }),
        ),
      ),
    ).rejects.toThrow(/justificativa/);
    await expect(
      rejected(() =>
        rpc(
          "adjust_stock",
          request({ product_id: product, quantity: 1, kind: "gift", reason: "Cortesia" }),
        ),
      ),
    ).rejects.toThrow(/reduzir/);
  });

  it("conserva estoque como soma das movimentações após venda, perda e cancelamento", async () => {
    await stock(20);
    const s = await sale({ quantity: 3 });
    await rpc(
      "adjust_stock",
      request({
        product_id: product,
        quantity: -2,
        kind: "loss",
        reason: "Duas embalagens danificadas",
      }),
    );
    await rpc("cancel_sale", { sale_id: s.id, reason: "Registro em duplicidade" });
    const row = await one(
      "select stock,(select sum(quantity) from stock_movements where product_id=p.id) movements from products p where id=$1",
      [product],
    );
    expect(Number(row.stock)).toBe(18);
    expect(Number(row.movements)).toBe(18);
  });

  it("substitui ficha técnica atomicamente e preserva versão anterior em erro", async () => {
    const ingredient = await one<{ id: string }>("select id from ingredients limit 1");
    await rpc("save_recipe", {
      id: recipe,
      product_id: product,
      name: "Receita ajustada",
      yield_quantity: 15,
      is_default: true,
      items: [{ ingredient_id: ingredient.id, quantity: 120 }],
    });
    expect(await one("select yield_quantity,name from recipes")).toEqual({
      yield_quantity: 15,
      name: "Receita ajustada",
    });
    expect((await db.query("select * from recipe_ingredients")).rows).toHaveLength(1);
    await expect(
      rejected(() =>
        rpc("save_recipe", {
          id: recipe,
          product_id: product,
          name: "Não persistir",
          yield_quantity: 12,
          is_default: true,
          items: [{ ingredient_id: randomUUID(), quantity: 1 }],
        }),
      ),
    ).rejects.toThrow(/Ingrediente não encontrado/);
    expect((await one("select name from recipes")).name).toBe("Receita ajustada");
    expect((await db.query("select * from recipe_ingredients")).rows).toHaveLength(1);
  });

  it("permite excluir ficha não usada e remove seus ingredientes em cascata", async () => {
    await db.query("delete from recipes where id=$1", [recipe]);
    expect((await db.query("select * from recipes")).rows).toHaveLength(0);
    expect((await db.query("select * from recipe_ingredients")).rows).toHaveLength(0);
  });
});
