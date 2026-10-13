-- BrownieFlow: tenant-isolated data, audit trails and atomic operational writes.
-- Apply through `supabase db push` or the Supabase SQL editor as postgres.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public;

create table app_private.owner_registry (
  singleton boolean primary key default true check (singleton),
  owner_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 100),
  business_name text not null default 'BrownieFlow' check (length(trim(business_name)) between 1 and 100),
  due_days integer not null default 7 check (due_days between 0 and 365),
  whatsapp_template text not null default 'Olá, {nome}! Passando para lembrar dos brownies. O valor pendente é de {valor}. Obrigado!',
  low_stock_threshold integer not null default 12 check (low_stock_threshold >= 0),
  theme text not null default 'system' check (theme in ('system','light','dark')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id,user_id), check (id=user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 150), phone text not null default '', notes text not null default '', archived boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.products (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 150), cash_price_cents bigint not null default 500 check(cash_price_cents>=0),
  credit_price_cents bigint not null default 600 check(credit_price_cents>=0), stock numeric(18,6) not null default 0 check(stock>=0 and stock=trunc(stock)),
  average_cost_cents numeric(18,6) not null default 0 check(average_cost_cents>=0), active boolean not null default true, is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create unique index products_one_default on public.products(user_id) where is_default;

create table public.sales (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid, sale_date date not null default current_date, due_date date, modality text not null check(modality in ('cash','credit')),
  gross_cents bigint not null check(gross_cents>=0), discount_cents bigint not null default 0 check(discount_cents>=0), total_cents bigint not null check(total_cents>=0),
  notes text not null default '', cancelled_at timestamptz, cancel_reason text, request_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(user_id,request_id),
  foreign key(customer_id,user_id) references public.customers(id,user_id),
  check(total_cents=gross_cents-discount_cents), check(modality<>'credit' or customer_id is not null), check(due_date is null or due_date>=sale_date)
);
create table public.sale_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sale_id uuid not null, product_id uuid not null, quantity integer not null check(quantity>0), unit_price_cents bigint not null check(unit_price_cents>=0),
  unit_cost_cents numeric(18,6) not null check(unit_cost_cents>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
  foreign key(sale_id,user_id) references public.sales(id,user_id), foreign key(product_id,user_id) references public.products(id,user_id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  customer_id uuid, payment_date date not null default current_date, amount_cents bigint not null check(amount_cents>0),
  method text not null check(method in ('pix','cash','card','transfer','other')), notes text not null default '',
  voided_at timestamptz, void_reason text, request_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(user_id,request_id),
  foreign key(customer_id,user_id) references public.customers(id,user_id), check((voided_at is null)=(void_reason is null))
);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  payment_id uuid not null, sale_id uuid not null, amount_cents bigint not null check(amount_cents>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(payment_id,sale_id),
  foreign key(payment_id,user_id) references public.payments(id,user_id), foreign key(sale_id,user_id) references public.sales(id,user_id)
);
create table public.receivable_adjustments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sale_id uuid not null, amount_cents bigint not null check(amount_cents<>0), reason text not null check(length(trim(reason))>=3),
  adjustment_date date not null default current_date, request_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(user_id,request_id),
  foreign key(sale_id,user_id) references public.sales(id,user_id)
);
create table public.ingredients (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 150), unit text not null check(unit in ('g','ml','un')),
  stock numeric(18,6) not null default 0 check(stock>=0), average_cost_cents numeric(18,6) not null default 0 check(average_cost_cents>=0),
  minimum_stock numeric(18,6) not null default 0 check(minimum_stock>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id)
);
create table public.ingredient_purchases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_date date not null default current_date, supplier text not null default '', total_cents bigint not null check(total_cents>0), request_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(user_id,request_id)
);
create table public.ingredient_purchase_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id uuid not null, ingredient_id uuid not null, quantity numeric(18,6) not null check(quantity>0), total_cents bigint not null check(total_cents>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(purchase_id,ingredient_id),
  foreign key(purchase_id,user_id) references public.ingredient_purchases(id,user_id), foreign key(ingredient_id,user_id) references public.ingredients(id,user_id)
);
create table public.expenses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null check(length(trim(description)) between 1 and 200), category text not null check(category in ('Ingredientes','Embalagens','Gás','Energia elétrica','Transporte','Equipamentos','Manutenção','Outros')),
  amount_cents bigint not null check(amount_cents>0), expense_date date not null default current_date,
  method text not null check(method in ('pix','cash','card','transfer','other')), supplier text not null default '', notes text not null default '', purchase_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(purchase_id),
  foreign key(purchase_id,user_id) references public.ingredient_purchases(id,user_id)
);
create table public.recipes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid not null, name text not null check(length(trim(name)) between 1 and 150), yield_quantity integer not null default 12 check(yield_quantity>0), is_default boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id),
  foreign key(product_id,user_id) references public.products(id,user_id)
);
create unique index recipes_one_default on public.recipes(user_id) where is_default;
create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid not null, ingredient_id uuid not null, quantity numeric(18,6) not null check(quantity>0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(recipe_id,ingredient_id),
  foreign key(recipe_id,user_id) references public.recipes(id,user_id) on delete cascade, foreign key(ingredient_id,user_id) references public.ingredients(id,user_id)
);
create table public.production_batches (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id uuid not null, production_date date not null default current_date, batches numeric(18,6) not null check(batches>0),
  expected_quantity integer not null check(expected_quantity>0), actual_quantity integer not null check(actual_quantity>0), total_cost_cents bigint not null check(total_cost_cents>=0),
  notes text not null default '', request_id uuid not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(user_id,request_id),
  foreign key(recipe_id,user_id) references public.recipes(id,user_id)
);
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  product_id uuid, ingredient_id uuid, quantity numeric(18,6) not null check(quantity<>0), unit_cost_cents numeric(18,6) not null check(unit_cost_cents>=0),
  kind text not null check(kind in ('purchase','production','sale','loss','gift','personal','adjustment','cancellation')),
  reference_id uuid, reason text not null default '', movement_date date not null default current_date, request_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,user_id), unique(user_id,request_id),
  foreign key(product_id,user_id) references public.products(id,user_id), foreign key(ingredient_id,user_id) references public.ingredients(id,user_id),
  check((product_id is null)<>(ingredient_id is null)), check(product_id is null or quantity=trunc(quantity))
);

create table app_private.requests (
  user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null, operation text not null, payload jsonb not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);

create index customers_user_name on public.customers(user_id,lower(name));
create index customers_user_phone on public.customers(user_id,phone);
create index sales_user_date on public.sales(user_id,sale_date desc);
create index sales_customer_due on public.sales(user_id,customer_id,due_date) where cancelled_at is null;
create index sale_items_sale on public.sale_items(user_id,sale_id);
create index payments_user_date on public.payments(user_id,payment_date desc);
create index payment_allocations_sale on public.payment_allocations(user_id,sale_id);
create index receivable_adjustments_sale on public.receivable_adjustments(user_id,sale_id);
create index expenses_user_date on public.expenses(user_id,expense_date desc);
create index purchases_user_date on public.ingredient_purchases(user_id,purchase_date desc);
create index production_user_date on public.production_batches(user_id,production_date desc);
create index stock_movements_user_date on public.stock_movements(user_id,movement_date desc);

create function app_private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;

-- No private data is readable by anon. All tenant keys participate in foreign keys.
do $$ declare t text; begin
  foreach t in array array['profiles','customers','products','sales','sale_items','payments','payment_allocations','receivable_adjustments','expenses','ingredients','ingredient_purchases','ingredient_purchase_items','recipes','recipe_ingredients','production_batches','stock_movements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy own_read on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app_private.touch_updated_at()',t);
  end loop;
  foreach t in array array['customers','products','ingredients'] loop
    execute format('create policy own_insert on public.%I for insert to authenticated with check (user_id=(select auth.uid()))',t);
    execute format('create policy own_update on public.%I for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))',t);
    execute format('create policy own_delete on public.%I for delete to authenticated using (user_id=(select auth.uid()))',t);
  end loop;
end $$;
grant insert(id,user_id,name,phone,notes,archived), update(name,phone,notes,archived), delete on public.customers to authenticated;
grant insert(id,user_id,name,cash_price_cents,credit_price_cents,active,is_default), update(name,cash_price_cents,credit_price_cents,active,is_default), delete on public.products to authenticated;
grant insert(id,user_id,name,unit,minimum_stock), update(name,unit,minimum_stock), delete on public.ingredients to authenticated;
create policy own_expense_insert on public.expenses for insert to authenticated with check(user_id=(select auth.uid()) and purchase_id is null);
create policy own_expense_update on public.expenses for update to authenticated using(user_id=(select auth.uid()) and purchase_id is null) with check(user_id=(select auth.uid()) and purchase_id is null);
create policy own_expense_delete on public.expenses for delete to authenticated using(user_id=(select auth.uid()) and purchase_id is null);
grant insert(id,user_id,description,category,amount_cents,expense_date,method,supplier,notes), update(description,category,amount_cents,expense_date,method,supplier,notes), delete on public.expenses to authenticated;
create policy own_recipe_delete on public.recipes for delete to authenticated using(user_id=(select auth.uid()));
grant delete on public.recipes to authenticated;

create function app_private.protect_ingredient_unit() returns trigger language plpgsql set search_path='' as $$
begin
  if new.unit<>old.unit and (old.stock<>0 or exists(select 1 from public.stock_movements where ingredient_id=old.id) or exists(select 1 from public.recipe_ingredients where ingredient_id=old.id)) then
    raise exception 'A unidade de um ingrediente utilizado não pode ser alterada. Cadastre outro ingrediente.';
  end if;
  return new;
end $$;
create trigger protect_ingredient_unit before update on public.ingredients for each row execute function app_private.protect_ingredient_unit();

create function app_private.begin_operation() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
  if u is null or not exists(select 1 from public.profiles where user_id=u) then raise exception 'Sessão inválida. Entre novamente.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  return u;
end $$;
create function app_private.cached_request(u uuid, op text, data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r app_private.requests; req uuid; begin
  req=(data->>'request_id')::uuid;
  if req is null then raise exception 'Identificador da operação obrigatório.'; end if;
  select * into r from app_private.requests where user_id=u and request_id=req;
  if found then
    if r.operation<>op or r.payload<>data then raise exception 'Este identificador já foi usado em outra operação.'; end if;
    return r.result;
  end if;
  return null;
end $$;
create function app_private.finish_request(u uuid,op text,data jsonb,result jsonb) returns jsonb language plpgsql set search_path='' as $$
begin insert into app_private.requests(user_id,request_id,operation,payload,result) values(u,(data->>'request_id')::uuid,op,data,result); return result; end $$;
create function app_private.sale_balance(u uuid,s uuid) returns bigint language sql stable set search_path='' as $$
  select s.total_cents
    +coalesce((select sum(a.amount_cents) from public.receivable_adjustments a where a.user_id=u and a.sale_id=s.id),0)
    -coalesce((select sum(a.amount_cents) from public.payment_allocations a join public.payments p on p.id=a.payment_id and p.user_id=a.user_id where a.user_id=u and a.sale_id=s.id and p.voided_at is null),0)
  from public.sales s where s.id=$2 and s.user_id=$1 and s.cancelled_at is null
$$;

-- First successful signup claims the installation. Advisory locking also covers concurrent signups.
create function app_private.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare username text; p uuid; r uuid; ing uuid; item record; begin
  perform pg_advisory_xact_lock(2147483646,817042);
  if exists(select 1 from app_private.owner_registry) then raise exception 'O proprietário já foi cadastrado. Novos cadastros estão bloqueados.'; end if;
  username=lower(trim(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1))));
  if username !~ '^[a-z0-9_]{3,30}$' or new.email is distinct from username||'@brownieflow.internal' then raise exception 'Nome de usuário inválido.'; end if;
  insert into app_private.owner_registry(owner_id) values(new.id);
  insert into public.profiles(id,user_id,username,display_name) values(new.id,new.id,username,coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),username));
  insert into public.products(user_id,name,is_default) values(new.id,'Brownie tradicional',true) returning id into p;
  insert into public.recipes(user_id,product_id,name,yield_quantity,is_default) values(new.id,p,'Brownie tradicional',12,true) returning id into r;
  for item in select * from (values
    ('Farinha de trigo','g',0.299::numeric,150::numeric),
    ('Açúcar','g',0.2495::numeric,90::numeric),
    ('Achocolatado Chocky','g',1.4375::numeric,370::numeric),
    ('Ovos','un',43.95::numeric,3::numeric),
    ('Margarina','g',1.154::numeric,70::numeric)
  ) as defaults(name,unit,cost,quantity) loop
    insert into public.ingredients(user_id,name,unit,average_cost_cents) values(new.id,item.name,item.unit,item.cost) returning id into ing;
    insert into public.recipe_ingredients(user_id,recipe_id,ingredient_id,quantity) values(new.id,r,ing,item.quantity);
  end loop;
  return new;
end $$;
create trigger brownieflow_new_user after insert on auth.users for each row execute function app_private.handle_new_user();

create function public.create_sale(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; p public.products; c uuid; sid uuid; pid uuid;
  qty integer; price bigint; disc bigint; gross bigint; total bigint; paid bigint; sale_day date; due date; mode text;
begin
  cached=app_private.cached_request(u,'create_sale',p_data); if cached is not null then return cached; end if;
  c=nullif(p_data->>'customer_id','')::uuid;
  if c is not null and not exists(select 1 from public.customers where id=c and user_id=u and not archived) then raise exception 'Cliente não encontrado ou arquivado.'; end if;
  select * into p from public.products where id=(p_data->>'product_id')::uuid and user_id=u and active for update;
  if not found then raise exception 'Produto não encontrado ou inativo.'; end if;
  qty=(p_data->>'quantity')::integer; mode=p_data->>'modality'; disc=coalesce((p_data->>'discount_cents')::bigint,0);
  price=coalesce((p_data->>'unit_price_cents')::bigint,case when mode='credit' then p.credit_price_cents else p.cash_price_cents end);
  if qty is null or qty<=0 or price<0 or disc<0 or mode is null or mode not in ('cash','credit') then raise exception 'Quantidade, preço, desconto ou modalidade inválidos.'; end if;
  if mode='credit' and c is null then raise exception 'Selecione um cliente para vender fiado.'; end if;
  if p.stock<qty then raise exception 'Estoque insuficiente. Disponível: %.',p.stock; end if;
  gross=qty::bigint*price; total=gross-disc; paid=coalesce((p_data->>'immediate_payment_cents')::bigint,0);
  if total<0 or paid<0 or paid>total then raise exception 'Desconto ou pagamento excede o valor da venda.'; end if;
  sale_day=coalesce((p_data->>'sale_date')::date,current_date); due=nullif(p_data->>'due_date','')::date;
  if due is not null and due<sale_day then raise exception 'O vencimento não pode ser anterior à venda.'; end if;
  insert into public.sales(user_id,customer_id,sale_date,due_date,modality,gross_cents,discount_cents,total_cents,notes,request_id)
    values(u,c,sale_day,due,mode,gross,disc,total,coalesce(p_data->>'notes',''),(p_data->>'request_id')::uuid) returning id into sid;
  insert into public.sale_items(user_id,sale_id,product_id,quantity,unit_price_cents,unit_cost_cents) values(u,sid,p.id,qty,price,p.average_cost_cents);
  update public.products set stock=stock-qty where id=p.id;
  insert into public.stock_movements(user_id,product_id,quantity,unit_cost_cents,kind,reference_id,reason,movement_date)
    values(u,p.id,-qty,p.average_cost_cents,'sale',sid,'Venda',sale_day);
  if paid>0 then
    insert into public.payments(user_id,customer_id,payment_date,amount_cents,method,notes,request_id)
      values(u,c,sale_day,paid,coalesce(p_data->>'method','pix'),'Pagamento no registro da venda',gen_random_uuid()) returning id into pid;
    insert into public.payment_allocations(user_id,payment_id,sale_id,amount_cents) values(u,pid,sid,paid);
  end if;
  return app_private.finish_request(u,'create_sale',p_data,jsonb_build_object('id',sid));
end $$;

create function public.cancel_sale(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); s public.sales; item record; reason text:=trim(p_data->>'reason'); begin
  if reason is null or length(reason)<3 then raise exception 'Informe o motivo do cancelamento.'; end if;
  select * into s from public.sales where id=(p_data->>'sale_id')::uuid and user_id=u for update;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if s.cancelled_at is not null then return jsonb_build_object('id',s.id); end if;
  if exists(select 1 from public.payment_allocations a join public.payments p on p.id=a.payment_id and p.user_id=a.user_id where a.sale_id=s.id and a.user_id=u and p.voided_at is null) then raise exception 'Estorne os pagamentos vinculados antes de cancelar a venda.'; end if;
  for item in select * from public.sale_items where sale_id=s.id and user_id=u loop
    update public.products set average_cost_cents=(stock*average_cost_cents+item.quantity*item.unit_cost_cents)/(stock+item.quantity), stock=stock+item.quantity where id=item.product_id and user_id=u;
    insert into public.stock_movements(user_id,product_id,quantity,unit_cost_cents,kind,reference_id,reason,movement_date)
      values(u,item.product_id,item.quantity,item.unit_cost_cents,'cancellation',s.id,reason,current_date);
  end loop;
  update public.sales set cancelled_at=now(),cancel_reason=reason where id=s.id;
  return jsonb_build_object('id',s.id);
end $$;

create function public.record_payment(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; c uuid; pid uuid; amount bigint; remaining bigint; debt bigint; s record; selected uuid[]; total_due bigint:=0; day date;
begin
  cached=app_private.cached_request(u,'record_payment',p_data); if cached is not null then return cached; end if;
  c=nullif(p_data->>'customer_id','')::uuid; amount=(p_data->>'amount_cents')::bigint; day=coalesce((p_data->>'payment_date')::date,current_date);
  if amount is null or amount<=0 then raise exception 'O pagamento deve ser maior que zero.'; end if;
  if c is not null and not exists(select 1 from public.customers where id=c and user_id=u) then raise exception 'Cliente não encontrado.'; end if;
  if p_data ? 'sale_ids' then
    if jsonb_typeof(p_data->'sale_ids')<>'array' or jsonb_array_length(p_data->'sale_ids')=0 then raise exception 'Selecione ao menos uma venda.'; end if;
    select array_agg(value::uuid) into selected from jsonb_array_elements_text(p_data->'sale_ids');
    if cardinality(selected)<>(select count(distinct id) from unnest(selected) id) then raise exception 'Venda duplicada na alocação.'; end if;
    if cardinality(selected)<>(select count(*) from public.sales where user_id=u and id=any(selected) and cancelled_at is null and customer_id is not distinct from c) then raise exception 'As vendas devem pertencer ao cliente informado e não podem estar canceladas.'; end if;
  end if;
  if c is not null or selected is not null then
    for s in select id,sale_date from public.sales where user_id=u and cancelled_at is null and customer_id is not distinct from c and (selected is null or id=any(selected)) order by due_date nulls last,sale_date,created_at,id for update loop
      debt=app_private.sale_balance(u,s.id);
      if debt>0 then total_due=total_due+debt; end if;
    end loop;
    if amount>total_due then raise exception 'Pagamento excede o saldo das vendas selecionadas (% centavos).',total_due; end if;
  end if;
  insert into public.payments(user_id,customer_id,payment_date,amount_cents,method,notes,request_id)
    values(u,c,day,amount,p_data->>'method',coalesce(p_data->>'notes',''),(p_data->>'request_id')::uuid) returning id into pid;
  remaining=amount;
  if c is not null or selected is not null then
    for s in select id,sale_date from public.sales where user_id=u and cancelled_at is null and customer_id is not distinct from c and (selected is null or id=any(selected)) order by due_date nulls last,sale_date,created_at,id loop
      debt=least(remaining,app_private.sale_balance(u,s.id));
      if debt>0 then
        if day<s.sale_date then raise exception 'O pagamento não pode ser anterior à venda.'; end if;
        insert into public.payment_allocations(user_id,payment_id,sale_id,amount_cents) values(u,pid,s.id,debt); remaining=remaining-debt;
      end if;
      exit when remaining=0;
    end loop;
  end if;
  return app_private.finish_request(u,'record_payment',p_data,jsonb_build_object('id',pid));
end $$;

create function public.void_payment(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); p public.payments; reason text:=trim(p_data->>'reason'); begin
  if reason is null or length(reason)<3 then raise exception 'Informe o motivo do estorno.'; end if;
  select * into p from public.payments where id=(p_data->>'payment_id')::uuid and user_id=u for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if p.voided_at is null then update public.payments set voided_at=now(),void_reason=reason where id=p.id; end if;
  return jsonb_build_object('id',p.id);
end $$;

create function public.adjust_receivable(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; s public.sales; aid uuid; amount bigint; reason text:=trim(p_data->>'reason'); begin
  cached=app_private.cached_request(u,'adjust_receivable',p_data); if cached is not null then return cached; end if;
  select * into s from public.sales where id=(p_data->>'sale_id')::uuid and user_id=u and cancelled_at is null for update;
  if not found then raise exception 'Venda não encontrada ou cancelada.'; end if;
  amount=(p_data->>'amount_cents')::bigint;
  if amount is null or amount=0 or reason is null or length(reason)<3 then raise exception 'Informe um valor diferente de zero e uma justificativa.'; end if;
  if app_private.sale_balance(u,s.id)+amount<0 then raise exception 'O desconto excede o saldo ainda devido.'; end if;
  if coalesce((p_data->>'adjustment_date')::date,current_date)<s.sale_date then raise exception 'O ajuste não pode ser anterior à venda.'; end if;
  insert into public.receivable_adjustments(user_id,sale_id,amount_cents,reason,adjustment_date,request_id)
    values(u,s.id,amount,reason,coalesce((p_data->>'adjustment_date')::date,current_date),(p_data->>'request_id')::uuid) returning id into aid;
  return app_private.finish_request(u,'adjust_receivable',p_data,jsonb_build_object('id',aid));
end $$;

create function public.record_purchase(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; pid uuid; item jsonb; ing public.ingredients; qty numeric; cents bigint; total bigint:=0; day date;
begin
  cached=app_private.cached_request(u,'record_purchase',p_data); if cached is not null then return cached; end if;
  if p_data->'items' is null or jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')=0 then raise exception 'Adicione ingredientes à compra.'; end if;
  if jsonb_array_length(p_data->'items')<>(select count(distinct value->>'ingredient_id') from jsonb_array_elements(p_data->'items')) then raise exception 'Não repita o ingrediente na mesma compra.'; end if;
  for item in select value from jsonb_array_elements(p_data->'items') loop
    qty=(item->>'quantity')::numeric; cents=(item->>'total_cents')::bigint;
    if qty is null or qty<=0 or qty<>round(qty,6) or cents is null or cents<=0 then raise exception 'Quantidade e valor da compra devem ser positivos.'; end if;
    if not exists(select 1 from public.ingredients where id=(item->>'ingredient_id')::uuid and user_id=u) then raise exception 'Ingrediente não encontrado.'; end if;
    total=total+cents;
  end loop;
  day=coalesce((p_data->>'purchase_date')::date,current_date);
  insert into public.ingredient_purchases(user_id,purchase_date,supplier,total_cents,request_id)
    values(u,day,coalesce(p_data->>'supplier',''),total,(p_data->>'request_id')::uuid) returning id into pid;
  for item in select value from jsonb_array_elements(p_data->'items') loop
    select * into ing from public.ingredients where id=(item->>'ingredient_id')::uuid and user_id=u for update;
    qty=(item->>'quantity')::numeric; cents=(item->>'total_cents')::bigint;
    insert into public.ingredient_purchase_items(user_id,purchase_id,ingredient_id,quantity,total_cents) values(u,pid,ing.id,qty,cents);
    update public.ingredients set average_cost_cents=(stock*average_cost_cents+cents)/(stock+qty),stock=stock+qty where id=ing.id;
    insert into public.stock_movements(user_id,ingredient_id,quantity,unit_cost_cents,kind,reference_id,reason,movement_date)
      values(u,ing.id,qty,cents/qty,'purchase',pid,'Compra de insumos',day);
  end loop;
  insert into public.expenses(user_id,description,category,amount_cents,expense_date,method,supplier,notes,purchase_id)
    values(u,'Compra de ingredientes','Ingredientes',total,day,p_data->>'method',coalesce(p_data->>'supplier',''),coalesce(p_data->>'notes',''),pid);
  return app_private.finish_request(u,'record_purchase',p_data,jsonb_build_object('id',pid));
end $$;

create function public.record_production(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; rec public.recipes; item record; bid uuid; forms numeric; actual integer; expected integer; cost numeric:=0; cents bigint; day date;
begin
  cached=app_private.cached_request(u,'record_production',p_data); if cached is not null then return cached; end if;
  select * into rec from public.recipes where id=(p_data->>'recipe_id')::uuid and user_id=u for update;
  if not found then raise exception 'Receita não encontrada.'; end if;
  forms=(p_data->>'batches')::numeric; actual=(p_data->>'actual_quantity')::integer;
  if forms is null or forms<=0 or forms<>round(forms,6) or actual is null or actual<=0 then raise exception 'Informe as formas e a quantidade real produzida.'; end if;
  expected=round(forms*rec.yield_quantity);
  if expected<=0 then raise exception 'Quantidade de formas muito pequena.'; end if;
  if not exists(select 1 from public.recipe_ingredients where recipe_id=rec.id and user_id=u) then raise exception 'A receita não possui ingredientes.'; end if;
  for item in select ri.quantity,i.* from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id and i.user_id=ri.user_id where ri.recipe_id=rec.id and ri.user_id=u order by i.id for update of i loop
    if item.stock<item.quantity*forms then raise exception 'Estoque insuficiente de %: necessário %, disponível %.',item.name,item.quantity*forms,item.stock; end if;
    if item.quantity*forms<>round(item.quantity*forms,6) then raise exception 'Quantidade de ingrediente abaixo da precisão de estoque.'; end if;
    cost=cost+item.quantity*forms*item.average_cost_cents;
  end loop;
  cents=round(cost); day=coalesce((p_data->>'production_date')::date,current_date);
  insert into public.production_batches(user_id,recipe_id,production_date,batches,expected_quantity,actual_quantity,total_cost_cents,notes,request_id)
    values(u,rec.id,day,forms,expected,actual,cents,coalesce(p_data->>'notes',''),(p_data->>'request_id')::uuid) returning id into bid;
  for item in select ri.quantity,i.* from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id and i.user_id=ri.user_id where ri.recipe_id=rec.id and ri.user_id=u loop
    update public.ingredients set stock=stock-item.quantity*forms where id=item.id;
    insert into public.stock_movements(user_id,ingredient_id,quantity,unit_cost_cents,kind,reference_id,reason,movement_date)
      values(u,item.id,-item.quantity*forms,item.average_cost_cents,'production',bid,'Consumo na produção',day);
  end loop;
  update public.products set average_cost_cents=(stock*average_cost_cents+cents)/(stock+actual),stock=stock+actual where id=rec.product_id and user_id=u;
  insert into public.stock_movements(user_id,product_id,quantity,unit_cost_cents,kind,reference_id,reason,movement_date)
    values(u,rec.product_id,actual,cents::numeric/actual,'production',bid,'Produção de brownies',day);
  return app_private.finish_request(u,'record_production',p_data,jsonb_build_object('id',bid));
end $$;

create function public.adjust_stock(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; p uuid; i uuid; mid uuid; qty numeric; current_stock numeric; cost numeric; k text; reason text:=trim(p_data->>'reason');
begin
  cached=app_private.cached_request(u,'adjust_stock',p_data); if cached is not null then return cached; end if;
  p=nullif(p_data->>'product_id','')::uuid; i=nullif(p_data->>'ingredient_id','')::uuid; qty=(p_data->>'quantity')::numeric; k=p_data->>'kind';
  if (p is null)=(i is null) then raise exception 'Informe um produto ou um ingrediente.'; end if;
  if qty is null or qty=0 or qty<>round(qty,6) or k is null or k not in ('loss','gift','personal','adjustment') or reason is null or length(reason)<3 then raise exception 'Movimentação inválida. Informe quantidade, tipo e justificativa.'; end if;
  if k<>'adjustment' and qty>0 then raise exception 'Perdas, cortesias e consumo próprio devem reduzir o estoque.'; end if;
  if p is not null and qty<>trunc(qty) then raise exception 'Informe uma quantidade inteira de brownies.'; end if;
  if p is not null then select stock,average_cost_cents into current_stock,cost from public.products where id=p and user_id=u for update;
  else select stock,average_cost_cents into current_stock,cost from public.ingredients where id=i and user_id=u for update; end if;
  if not found then raise exception 'Item de estoque não encontrado.'; end if;
  if current_stock+qty<0 then raise exception 'A movimentação deixaria o estoque negativo. Registre primeiro um ajuste justificado de entrada.'; end if;
  if p is not null then update public.products set stock=stock+qty where id=p; else update public.ingredients set stock=stock+qty where id=i; end if;
  insert into public.stock_movements(user_id,product_id,ingredient_id,quantity,unit_cost_cents,kind,reason,movement_date,request_id)
    values(u,p,i,qty,cost,k,reason,coalesce((p_data->>'movement_date')::date,current_date),(p_data->>'request_id')::uuid) returning id into mid;
  return app_private.finish_request(u,'adjust_stock',p_data,jsonb_build_object('id',mid));
end $$;

create function public.save_recipe(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); rid uuid:=nullif(p_data->>'id','')::uuid; pid uuid:=(p_data->>'product_id')::uuid; item jsonb; qty numeric; yield_count integer; v_name text; v_default boolean;
begin
  v_name=trim(p_data->>'name'); yield_count=(p_data->>'yield_quantity')::integer; v_default=coalesce((p_data->>'is_default')::boolean,false);
  if v_name is null or length(v_name)=0 or yield_count is null or yield_count<=0 then raise exception 'Informe nome e rendimento da receita.'; end if;
  if not exists(select 1 from public.products where id=pid and user_id=u) then raise exception 'Produto não encontrado.'; end if;
  if rid is not null and not exists(select 1 from public.recipes where id=rid and user_id=u) then raise exception 'Receita não encontrada.'; end if;
  if p_data->'items' is null or jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')=0 then raise exception 'Inclua ingredientes na receita.'; end if;
  if jsonb_array_length(p_data->'items')<>(select count(distinct value->>'ingredient_id') from jsonb_array_elements(p_data->'items')) then raise exception 'Ingrediente repetido na receita.'; end if;
  if v_default then update public.recipes set is_default=false where user_id=u and public.recipes.is_default; end if;
  if rid is null then insert into public.recipes(user_id,product_id,name,yield_quantity,is_default) values(u,pid,v_name,yield_count,v_default) returning id into rid;
  else
    update public.recipes set product_id=pid,name=v_name,yield_quantity=yield_count,is_default=v_default where id=rid;
    delete from public.recipe_ingredients where recipe_id=rid and user_id=u;
  end if;
  for item in select value from jsonb_array_elements(p_data->'items') loop
    qty=(item->>'quantity')::numeric;
    if qty is null or qty<=0 or qty<>round(qty,6) then raise exception 'Quantidade de ingrediente inválida.'; end if;
    if not exists(select 1 from public.ingredients where id=(item->>'ingredient_id')::uuid and user_id=u) then raise exception 'Ingrediente não encontrado.'; end if;
    insert into public.recipe_ingredients(user_id,recipe_id,ingredient_id,quantity) values(u,rid,(item->>'ingredient_id')::uuid,qty);
  end loop;
  return jsonb_build_object('id',rid);
end $$;

create function public.update_profile(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); v_username text:=lower(trim(p_data->>'username')); old_username text; new_email text; begin
  select p.username into old_username from public.profiles p where user_id=u for update;
  v_username=coalesce(v_username,old_username);
  if v_username !~ '^[a-z0-9_]{3,30}$' then raise exception 'Use de 3 a 30 letras minúsculas, números ou sublinhado no usuário.'; end if;
  if exists(select 1 from public.profiles p where p.username=v_username and user_id<>u) then raise exception 'Este nome de usuário já está em uso.'; end if;
  update public.profiles set username=v_username,
    display_name=coalesce(p_data->>'display_name',display_name),business_name=coalesce(p_data->>'business_name',business_name),
    due_days=coalesce((p_data->>'due_days')::integer,due_days),whatsapp_template=coalesce(p_data->>'whatsapp_template',whatsapp_template),
    low_stock_threshold=coalesce((p_data->>'low_stock_threshold')::integer,low_stock_threshold),theme=coalesce(p_data->>'theme',theme) where user_id=u;
  if v_username<>old_username then
    new_email=v_username||'@brownieflow.internal';
    update auth.users set email=new_email,raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('username',v_username),updated_at=now() where id=u;
    update auth.identities set identity_data=jsonb_set(identity_data,'{email}',to_jsonb(new_email)),updated_at=now() where user_id=u and provider='email';
  end if;
  return jsonb_build_object('id',u);
end $$;

create function public.set_default_product(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); pid uuid:=(p_data->>'product_id')::uuid; begin
  perform 1 from public.products where id=pid and user_id=u and active for update;
  if not found then raise exception 'Selecione um produto ativo da sua conta.'; end if;
  update public.products set is_default=false where user_id=u and is_default and id<>pid;
  update public.products set is_default=true where id=pid and user_id=u;
  return jsonb_build_object('id',pid);
end $$;

-- PostgreSQL grants function EXECUTE to PUBLIC by default: explicitly close that surface.
revoke all on all functions in schema app_private from public,anon,authenticated;
revoke all on all tables in schema app_private from public,anon,authenticated;
do $$ declare fn text; begin
  foreach fn in array array['create_sale','cancel_sale','record_payment','void_payment','adjust_receivable','record_purchase','record_production','adjust_stock','save_recipe','update_profile','set_default_product'] loop
    execute format('revoke all on function public.%I(jsonb) from public,anon',fn);
    execute format('grant execute on function public.%I(jsonb) to authenticated',fn);
  end loop;
end $$;

-- Supabase creates this publication. Embedded PostgreSQL tests do not need it.
do $$ declare t text; begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    foreach t in array array['profiles','customers','products','sales','sale_items','payments','payment_allocations','receivable_adjustments','expenses','ingredients','ingredient_purchases','ingredient_purchase_items','recipes','recipe_ingredients','production_batches','stock_movements'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        execute format('alter publication supabase_realtime add table public.%I',t);
      end if;
    end loop;
  end if;
end $$;

commit;
