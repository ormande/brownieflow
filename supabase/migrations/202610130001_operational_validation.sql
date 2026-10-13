-- Additive hardening for existing installations. Do not reapply the initial migration.
begin;

-- PostgreSQL numeric considers NaN greater than ordinary numbers: >= 0 alone is
-- insufficient. Monetary integers must also survive the JSON -> JavaScript boundary.
do $$ declare col record; begin
  for col in
    select table_name,column_name,data_type from information_schema.columns
    where table_schema='public' and table_name=any(array[
      'products','sales','sale_items','payments','payment_allocations',
      'receivable_adjustments','expenses','ingredients','ingredient_purchases',
      'ingredient_purchase_items','recipes','recipe_ingredients',
      'production_batches','stock_movements'
    ]) and data_type in ('bigint','numeric')
  loop
    if col.data_type='bigint' then
      execute format('alter table public.%I add constraint %I check (%I between -9007199254740991 and 9007199254740991)',
        col.table_name,col.table_name||'_'||col.column_name||'_safe_integer',col.column_name);
    else
      execute format('alter table public.%I add constraint %I check (%I not in (''NaN''::numeric,''Infinity''::numeric,''-Infinity''::numeric))',
        col.table_name,col.table_name||'_'||col.column_name||'_finite',col.column_name);
    end if;
  end loop;
end $$;

-- Previous releases allowed credit sales without a due date. Preserve those
-- sales and apply the owner's configured term before enforcing the invariant.
update public.sales s set due_date=s.sale_date+p.due_days
from public.profiles p where p.user_id=s.user_id and s.modality='credit' and s.due_date is null;
alter table public.sales add constraint sales_credit_requires_due_date check(modality<>'credit' or due_date is not null);

create or replace function public.create_sale(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if mode='credit' and due is null then raise exception 'Informe o vencimento da venda fiada.'; end if;
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

create or replace function public.adjust_receivable(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); cached jsonb; s public.sales; aid uuid; amount bigint; adjusted_total numeric; reason text:=trim(p_data->>'reason'); begin
  cached=app_private.cached_request(u,'adjust_receivable',p_data); if cached is not null then return cached; end if;
  select * into s from public.sales where id=(p_data->>'sale_id')::uuid and user_id=u and cancelled_at is null for update;
  if not found then raise exception 'Venda não encontrada ou cancelada.'; end if;
  amount=(p_data->>'amount_cents')::bigint;
  if amount is null or amount=0 or reason is null or length(reason)<3 then raise exception 'Informe um valor diferente de zero e uma justificativa.'; end if;
  if amount not between -9007199254740991 and 9007199254740991 then raise exception 'Valor fora do limite financeiro permitido.'; end if;
  select s.total_cents::numeric+coalesce(sum(a.amount_cents),0)+amount into adjusted_total
    from public.receivable_adjustments a where a.sale_id=s.id and a.user_id=u;
  if adjusted_total>9007199254740991 then raise exception 'O ajuste excede o limite financeiro da venda.'; end if;
  if app_private.sale_balance(u,s.id)::numeric+amount<0 then raise exception 'O desconto excede o saldo ainda devido.'; end if;
  if coalesce((p_data->>'adjustment_date')::date,current_date)<s.sale_date then raise exception 'O ajuste não pode ser anterior à venda.'; end if;
  insert into public.receivable_adjustments(user_id,sale_id,amount_cents,reason,adjustment_date,request_id)
    values(u,s.id,amount,reason,coalesce((p_data->>'adjustment_date')::date,current_date),(p_data->>'request_id')::uuid) returning id into aid;
  return app_private.finish_request(u,'adjust_receivable',p_data,jsonb_build_object('id',aid));
end $$;

create or replace function public.update_profile(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
    -- Match the pending-token invalidation performed by Supabase Auth's admin
    -- update. Email identity provider_id/sub remain the user UUID, not the email.
    update auth.users set email=new_email,
      raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||jsonb_build_object('username',v_username),
      confirmation_token='',confirmation_sent_at=null,recovery_token='',recovery_sent_at=null,
      email_change='',email_change_token_current='',email_change_token_new='',email_change_sent_at=null,email_change_confirm_status=0,
      phone_change='',phone_change_token='',phone_change_sent_at=null,
      reauthentication_token='',reauthentication_sent_at=null,updated_at=now() where id=u;
    update auth.identities set identity_data=jsonb_set(coalesce(identity_data,'{}'::jsonb),'{email}',to_jsonb(new_email)),updated_at=now() where user_id=u and provider='email';
    if to_regclass('auth.one_time_tokens') is not null then
      delete from auth.one_time_tokens where user_id=u;
    end if;
  end if;
  return jsonb_build_object('id',u);
end $$;

create or replace function public.set_default_product(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=app_private.begin_operation(); pid uuid:=(p_data->>'product_id')::uuid; begin
  perform 1 from public.products where id=pid and user_id=u and active for update;
  if not found then raise exception 'Selecione um produto ativo da sua conta.'; end if;
  update public.products set is_default=false where user_id=u and is_default and id<>pid;
  update public.products set is_default=true where id=pid and user_id=u;
  return jsonb_build_object('id',pid);
end $$;

-- CREATE OR REPLACE retains existing privileges; repeat the intended grants
-- here so these routines remain closed even if a prior install drifted.
revoke all on function public.create_sale(jsonb),public.adjust_receivable(jsonb),public.update_profile(jsonb),public.set_default_product(jsonb) from public,anon;
grant execute on function public.create_sale(jsonb),public.adjust_receivable(jsonb),public.update_profile(jsonb),public.set_default_product(jsonb) to authenticated;

-- One SQL statement observes one MVCC snapshot: totals cannot mix a sale read
-- before a commit with its allocations read after that commit. RLS still runs
-- with the authenticated caller's permissions, never with the function owner.
create function public.get_app_data() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'profiles',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.profiles t where t.user_id=(select auth.uid())),
    'customers',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.customers t where t.user_id=(select auth.uid())),
    'products',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.products t where t.user_id=(select auth.uid())),
    'sales',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.sales t where t.user_id=(select auth.uid())),
    'sale_items',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.sale_items t where t.user_id=(select auth.uid())),
    'payments',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.payments t where t.user_id=(select auth.uid())),
    'payment_allocations',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.payment_allocations t where t.user_id=(select auth.uid())),
    'receivable_adjustments',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.receivable_adjustments t where t.user_id=(select auth.uid())),
    'expenses',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.expenses t where t.user_id=(select auth.uid())),
    'ingredients',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.ingredients t where t.user_id=(select auth.uid())),
    'ingredient_purchases',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.ingredient_purchases t where t.user_id=(select auth.uid())),
    'ingredient_purchase_items',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.ingredient_purchase_items t where t.user_id=(select auth.uid())),
    'recipes',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.recipes t where t.user_id=(select auth.uid())),
    'recipe_ingredients',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.recipe_ingredients t where t.user_id=(select auth.uid())),
    'production_batches',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.production_batches t where t.user_id=(select auth.uid())),
    'stock_movements',(select coalesce(jsonb_agg(t order by t.created_at,t.id),'[]'::jsonb) from public.stock_movements t where t.user_id=(select auth.uid()))
  )
$$;
revoke all on function public.get_app_data() from public,anon;
grant execute on function public.get_app_data() to authenticated;

-- The signup screen must verify the migration and permanent owner lock before
-- calling Auth. This public endpoint intentionally reveals only installation
-- readiness, never an owner id, username, count or business record.
create function public.installation_status() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'installed',true,
    'has_owner',exists(select 1 from app_private.owner_registry),
    'schema_version','202610130001'
  )
$$;
revoke all on function public.installation_status() from public;
grant execute on function public.installation_status() to anon,authenticated;

commit;
