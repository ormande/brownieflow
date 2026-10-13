import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { amountSchema } from "../src/components/finance/shared";

let db: PGlite;
let product: string;
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
    create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',updated_at timestamptz default now());
    create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text,identity_data jsonb,updated_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(new URL(file, migrations), "utf8"));
  }
  await db.query(
    `insert into auth.users(id,email,raw_user_meta_data) values($1,'reviewer@brownieflow.internal','{"username":"reviewer"}')`,
    [owner],
  );
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [owner]);
  product = (await db.query<{ id: string }>("select id from products")).rows[0].id;
  await db.exec("set role authenticated");
}, 60000);
afterAll(async () => {
  await db?.close();
});

describe("Revisão de limites de valores operacionais", () => {
  it("rejeita NaN na RPC de ajuste sem corromper o estoque", async () => {
    await expect(
      db.query(`select adjust_stock($1::jsonb)`, [
        JSON.stringify({
          request_id: randomUUID(),
          product_id: product,
          quantity: "NaN",
          kind: "adjustment",
          reason: "Valor numérico inválido",
        }),
      ]),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ stock: string }>(
          "select stock::text stock from products where id=$1",
          [product],
        )
      ).rows[0].stock,
    ).toBe("0.000000");
  });

  it("rejeita pagamentos que excedem a precisão inteira segura do cliente", async () => {
    await expect(
      db.query(`select record_payment($1::jsonb)`, [
        JSON.stringify({
          request_id: randomUUID(),
          amount_cents: "9007199254740993",
          payment_date: "2026-10-08",
          method: "pix",
          customer_id: null,
        }),
      ]),
    ).rejects.toThrow();
  });

  it("valida o limite de precisão antes de converter dinheiro para número", () => {
    expect(amountSchema.safeParse("90071992547409.93").success).toBe(false);
  });

  it("atualiza instalação anterior preservando a venda e preenchendo apenas seu vencimento ausente", async () => {
    const legacy = new PGlite();
    try {
      await legacy.exec(`create role anon nologin; create role authenticated nologin; create schema auth;
        create table auth.users(id uuid primary key,email text unique,raw_user_meta_data jsonb default '{}',updated_at timestamptz default now());
        create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id),provider text,identity_data jsonb,updated_at timestamptz default now());
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
      const migrations = new URL("../supabase/migrations/", import.meta.url);
      const files = readdirSync(migrations)
        .filter((name) => name.endsWith(".sql"))
        .sort();
      await legacy.exec(readFileSync(new URL(files[0], migrations), "utf8"));
      await legacy.query(
        `insert into auth.users(id,email) values($1,'legacy@brownieflow.internal')`,
        [owner],
      );
      await legacy.query(`update profiles set due_days=10 where user_id=$1`, [owner]);
      const customer = (
        await legacy.query<{ id: string }>(
          `insert into customers(user_id,name) values($1,'Cliente existente') returning id`,
          [owner],
        )
      ).rows[0].id;
      const sale = (
        await legacy.query<{ id: string }>(
          `insert into sales(user_id,customer_id,modality,sale_date,gross_cents,total_cents,request_id) values($1,$2,'credit','2026-10-01',600,600,$3) returning id`,
          [owner, customer, randomUUID()],
        )
      ).rows[0].id;
      await legacy.exec("drop function public.set_default_product(jsonb)");
      for (const file of files.slice(1))
        await legacy.exec(readFileSync(new URL(file, migrations), "utf8"));
      await legacy.query(`select set_config('request.jwt.claim.sub',$1,false)`, [owner]);
      await legacy.exec("set role authenticated");
      const rows = (
        await legacy.query<{ id: string; due_date: string; total: number }>(
          "select id,due_date::text,total_cents::int total from sales",
        )
      ).rows;
      expect(rows).toEqual([{ id: sale, due_date: "2026-10-11", total: 600 }]);
      const data = (
        await legacy.query<{ data: { sales: unknown[]; payments: unknown[] } }>(
          "select get_app_data() data",
        )
      ).rows[0].data;
      expect(data.sales).toHaveLength(1);
      expect(data.payments).toEqual([]);
      const product = (await legacy.query<{ id: string }>("select id from products"))
        .rows[0].id;
      await expect(
        legacy.query("select set_default_product($1::jsonb)", [
          JSON.stringify({ product_id: product }),
        ]),
      ).resolves.toBeDefined();
    } finally {
      await legacy.close();
    }
  }, 60000);
});
