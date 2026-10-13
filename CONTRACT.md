# BrownieFlow implementation contract

Monetary totals and prices are integer cents within JavaScript's safe integer range; unit/average cost snapshots may contain fractional cents. Dates `YYYY-MM-DD`; quantities in ingredient base units (g, ml, un). Numeric quantities/costs must be finite. All private rows have id UUID, user_id UUID, created_at, updated_at. The application reads its 16 collections through `get_app_data()` in one PostgreSQL snapshot, with RLS and caller permissions. Operational writes use RPC functions with `p_data jsonb`, response JSON; permitted metadata CRUD remains direct under RLS. user_id always auth.uid(), never trusted client input. Transaction RPCs accept request_id UUID for idempotency.

## Tables and columns

- profiles: id = user_id, username, display_name, business_name, due_days (7), whatsapp_template ('Olá, {nome}! Passando para lembrar dos brownies. O valor pendente é de {valor}. Obrigado!'), low_stock_threshold (12), theme ('system').
- customers: name, phone, notes, archived boolean default false.
- products: name, cash_price_cents (500), credit_price_cents (600), stock numeric (0), average_cost_cents numeric (0), active bool, is_default bool.
- sales: customer_id nullable for cash only, sale_date date, due_date nullable for cash only, modality ('cash'|'credit'), gross_cents, discount_cents, total_cents, notes, cancelled_at nullable timestamp, request_id unique per user. Credit requires customer and due_date >= sale_date.
- sale_items: sale_id, product_id, quantity integer, unit_price_cents, unit_cost_cents numeric.
- payments: customer_id nullable, payment_date date, amount_cents, method ('pix'|'cash'|'card'|'transfer'|'other'), notes, voided_at nullable timestamp, void_reason nullable text, request_id.
- payment_allocations: payment_id, sale_id, amount_cents.
- receivable_adjustments: sale_id, amount_cents signed (positive INCREASES debt, negative discount), reason, adjustment_date date.
- expenses: description, category ('Ingredientes','Embalagens','Gás','Energia elétrica','Transporte','Equipamentos','Manutenção','Outros'), amount_cents, expense_date date, method (same as payments), supplier, notes, purchase_id nullable.
- ingredients: name, unit ('g'|'ml'|'un'), stock numeric (0), average_cost_cents numeric (cost per base unit, from initial reference prices), minimum_stock numeric (0).
- ingredient_purchases: purchase_date, supplier, total_cents, request_id.
- ingredient_purchase_items: purchase_id, ingredient_id, quantity numeric, total_cents.
- recipes: product_id, name, yield_quantity integer (12), is_default bool.
- recipe_ingredients: recipe_id, ingredient_id, quantity numeric.
- production_batches: recipe_id, production_date, batches numeric, expected_quantity integer, actual_quantity integer, total_cost_cents integer, notes, request_id.
- stock_movements: product_id nullable, ingredient_id nullable, quantity numeric signed, unit_cost_cents numeric, kind ('purchase'|'production'|'sale'|'loss'|'gift'|'personal'|'adjustment'|'cancellation'), reference_id UUID nullable, reason text, movement_date date.

## Read RPCs (no arguments)

- `get_app_data()`: returns an `AppData` object with all 16 table-name keys and arrays ordered by created_at/id; empty collections return `[]`. One `STABLE SECURITY INVOKER` SQL statement, RLS plus auth.uid() filters, authenticated execution only. No per-table pagination or separate snapshots in the client.
- `installation_status()`: returns only `{installed:true,has_owner:boolean,schema_version:'202610130001'}`. `STABLE SECURITY DEFINER`, empty search_path, execution granted to anon/authenticated. This is the only anonymous application RPC. Missing/error/mismatched installation blocks signup; has_owner hides registration. The auth.users trigger enforces the owner lock server-side.

## Write RPC contract (p_data jsonb)

- create_sale: {request_id, customer_id|null, product_id, quantity, modality, unit_price_cents, discount_cents, sale_date, due_date|null, notes, immediate_payment_cents:0, method:'pix'}. Check stock, create sale/items/movement and optional payment atomically. Credit requires customer and due_date >= sale_date. Gross = qty*price; original preserved.
- cancel_sale: {sale_id, reason}. Reject if active payments allocated (must void payment first); restore stock, mark cancelled, preserve history.
- record_payment: {request_id, customer_id|null, amount_cents, payment_date, method, notes, sale_ids?:UUID[]}. If sale_ids provided allocate to those in oldest due/sale order, reject mismatched customer. Otherwise customer allocated FIFO. Customerless without sale_ids is unlinked. Reject overpay for automatic customer allocation; allow unlinked payment without customer. Lock all involved rows and handle concurrency. Status derived on client from active allocations + adjustments.
- void_payment: {payment_id, reason}. Preserve history, mark void, active allocations excluded.
- adjust_receivable: {request_id, sale_id, amount_cents signed, reason, adjustment_date}. Prevent resulting debt below paid and adjusted sale total above Number.MAX_SAFE_INTEGER. Serialize with payments.
- record_purchase: {request_id, purchase_date, supplier, method, notes, items:[{ingredient_id,quantity,total_cents}]}. Weighted average, stock movements and exactly ONE linked expense.
- record_production: {request_id,recipe_id,production_date,batches,actual_quantity,notes}. Deduct recipe ingredients, no negatives, weighted product avg, snapshot batch cost.
- adjust_stock: {request_id, product_id|null, ingredient_id|null, quantity signed, kind:'loss'|'gift'|'personal'|'adjustment', reason, movement_date}. Reject negative resulting stock. Loss/gift/personal only negative.
- save_recipe: {id?,product_id,name,yield_quantity,is_default,items:[{ingredient_id,quantity}]} replaces recipe ingredients atomically.
- update_profile: {display_name,business_name,username,due_days,whatsapp_template,low_stock_threshold,theme}. Update profile, Auth internal email and email identity metadata atomically; enforce username uniqueness and invalidate pending Auth tokens. Preserve identity provider_id/sub and other providers. Auth email = normalized username + '@brownieflow.internal'. Password changes use Supabase Auth; this RPC does not reissue JWTs or revoke sessions.
- set_default_product: {product_id}. Atomically switch the user's default product; require an active product owned by auth.uid().

## Frontend shared API

`src/types.ts` exports all interfaces + `AppData` typed collections for all tables + `TableName`.
`src/lib/data.ts`: `useAppData()` -> useQuery result AppData from `get_app_data()` (throw errors, no pretend data). `useAction()` -> {run: async (rpcName: string,payload:Record<string,unknown>)=>any, save: async <table>(table, row,id?)=>void, remove:async(table,id)=>void, pending:boolean}; successful mutation invalidates app data for the current user. `run` automatically adds fresh request_id unless supplied. Idempotency uses a persistent request token per form submit and resets on success where critical. `useAuth()` from `src/lib/auth.tsx` -> {user, session, loading, signOut}; `supabase` from src/lib/supabase.ts (nullable until env set).
`src/lib/format.ts`: money(cents), dateLabel(ISO), today(), toCents(value), methodLabel map, quantity(value), cn(...classes).
`src/lib/finance.ts`: saleBalance(sale,data), salePaid(saleId,data), saleAdjustment(saleId,data), saleStatus(sale,data) returns 'paid'|'partial'|'overdue'|'pending'|'cancelled'; recipeCost(recipeId,data), downloadCsv(filename,rows).
`src/components/ui.tsx`: Button (variant 'default'|'secondary'|'ghost'|'danger', size 'default'|'sm'|'icon', standard attrs), Card (standard div props), Input/Select/Textarea (standard native attrs), Field {label,children,hint?,error?}, Badge {children,tone?:'green'|'amber'|'red'|'neutral'}, Modal {open,onOpenChange,title,description?,children}, Empty {title,description?,action?}, PageHeader {title,description?,action?}, Stat {label,value,hint?,icon?}, ConfirmButton {onConfirm:async()=>..., children, title,description?, variant?}. CSS generic classes .grid-2 .grid-3 .grid-4 .stack .form-grid .form-actions .data-table .table-wrap .muted .section-title .toolbar .list-row .amount .eyebrow.

## Installation and verification

Apply all versioned migrations before creating the first Auth account. `supabase/setup.sql` is generated by `npm run db:prepare` for empty projects; existing installations apply only missing migrations. In Supabase **Authentication → Sign In / Providers**, enable **Email** and disable **Confirm email** for the internal login identifier. After creating the owner, disable **Allow new users to sign up** and set `VITE_ALLOW_SIGNUP=false`.

SQL tests apply the actual migrations in PGlite with stubbed Auth; browser tests use isolated fixtures. They do not validate hosted Auth, JWT refresh, Realtime delivery or concurrency between real connections. Hosted checks on 2026-10-13 confirmed schema version `202610130001`, RLS on all 16 private tables, anonymous denial of `get_app_data()`, initial owner signup, session persistence after local-server restart and the expected recipe/empty operational data. Login after logout, token refresh and username/password changes still need separate real-service validation. The optional `supabase/verify-rollback.sql` exercises the operational core with one transaction ending in ROLLBACK; local validation of that script is not evidence of hosted execution. See `supabase/README.md` for the Auth schema dependencies and deployment limits.

## Module ownership

- Parent: scaffolding, types, lib, shared components, auth, shell, Dashboard, Settings, README, e2e/browser QA.
- Finance agent: src/pages/Sales.tsx, Customers.tsx (also CustomerDetail), Receivables.tsx, Payments.tsx, Expenses.tsx, Reports.tsx, src/components/SaleForm.tsx. Export default per page; CustomerDetail named export. SaleForm default {open,onOpenChange,repeatSaleId?} (global mounted in Shell; route Sales own trigger allowed). All useAppData and useAction. Use react-hook-form + zod for forms (can use shared hook local). No edits lib/types/ui without coordination.
- Operations agent: src/pages/Inventory.tsx, Recipes.tsx, Production.tsx, Planning.tsx. Same shared patterns. Own module helpers/components under src/components/operations/. Production operations via RPCs; direct CRUD ingredient/product metadata only (stock columns DB protected). Product prices edited Settings parent. No fake state.
- Backend agent: supabase/** and tests/database*.

Use Portuguese polished interface, real empty states, crisp labels, errors via sonner toast in useAction, no mock operational records. Settings and schema seeds provide requested default recipe/prices. Dependencies include lucide-react, recharts, zod, react-hook-form, @hookform/resolvers, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-slot, sonner, clsx, tailwind-merge, @tanstack/react-query, @supabase/supabase-js, react-router-dom. Tests vitest + @electric-sql/pglite; vite-plugin-pwa and Tailwind V4 @tailwindcss/vite.
