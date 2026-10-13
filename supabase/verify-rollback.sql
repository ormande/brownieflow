-- BrownieFlow: verificação transacional opcional no SQL Editor, após criar o dono.
-- Execute o arquivo INTEIRO como postgres, sem outras gravações na aplicação.
-- Nunca troque ROLLBACK por COMMIT nem execute apenas trechos deste arquivo.
-- Todos os cadastros, compras, lotes, vendas, pagamentos e tokens de idempotência
-- desta verificação são descartados. Não há ALTER/DELETE/TRUNCATE ou mudança de gatilhos.
-- Um assert lança erro e aborta a transação; execute ROLLBACK se o editor parar
-- antes da última instrução. Uma transação abortada não confirma gravações.

begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local idle_in_transaction_session_timeout='30s';

-- Defina a identidade enquanto ainda há acesso administrativo. O restante do
-- fluxo será executado com as permissões reais de authenticated e com RLS.
do $$
declare owner_id uuid; baseline jsonb;
begin
  if (select count(*) from public.profiles)<>1 then
    raise exception 'Verificação exige exatamente um proprietário com perfil criado.';
  end if;
  select id into owner_id from public.profiles;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text,0));
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
  select jsonb_build_object(
    'customers',(select count(*) from public.customers where user_id=owner_id),
    'sales',(select count(*) from public.sales where user_id=owner_id),
    'sale_items',(select count(*) from public.sale_items where user_id=owner_id),
    'payments',(select count(*) from public.payments where user_id=owner_id),
    'payment_allocations',(select count(*) from public.payment_allocations where user_id=owner_id),
    'ingredient_purchases',(select count(*) from public.ingredient_purchases where user_id=owner_id),
    'ingredient_purchase_items',(select count(*) from public.ingredient_purchase_items where user_id=owner_id),
    'expenses',(select count(*) from public.expenses where user_id=owner_id),
    'production_batches',(select count(*) from public.production_batches where user_id=owner_id),
    'stock_movements',(select count(*) from public.stock_movements where user_id=owner_id),
    'idempotency_requests',(select count(*) from app_private.requests where user_id=owner_id)
  ) into baseline;
  raise notice 'CONTAGEM ANTES: %',baseline;
end $$;

set local role authenticated;

do $$
declare
  owner_id uuid:=auth.uid(); recipe public.recipes; product public.products;
  v_customer_id uuid; v_purchase_id uuid; v_production_id uuid; v_sale_id uuid; v_payment_id uuid;
  payload jsonb; result jsonb; duplicate jsonb; ingredient_baseline jsonb; ingredient_count integer;
  row record; balance bigint; expense_count integer;
begin
  if current_user<>'authenticated' or owner_id is null then
    raise exception 'Identidade/permissões de teste não foram aplicadas.';
  end if;
  if public.installation_status()->>'schema_version'<>'202610130001' then
    raise exception 'Aplique todas as migrações antes da verificação.';
  end if;
  select * into recipe from public.recipes where user_id=owner_id and is_default;
  if not found or recipe.yield_quantity<>12 then
    raise exception 'Verificação exige receita padrão com rendimento de 12 unidades.';
  end if;
  select * into product from public.products where id=recipe.product_id and user_id=owner_id and active;
  if not found then raise exception 'Produto ativo da receita padrão não encontrado.'; end if;
  select count(*),jsonb_object_agg(i.id::text,i.stock)
    into ingredient_count,ingredient_baseline
    from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id and i.user_id=ri.user_id
    where ri.recipe_id=recipe.id and ri.user_id=owner_id;
  if ingredient_count=0 then raise exception 'Receita sem ingredientes.'; end if;

  -- Compre o equivalente a duas formas. O preço usa apenas a referência
  -- existente e este lançamento será revertido integralmente.
  select jsonb_build_object(
    'request_id',gen_random_uuid(),'purchase_date',current_date,'method','pix',
    'supplier','Verificação transacional','notes','Descartar com ROLLBACK',
    'items',jsonb_agg(jsonb_build_object(
      'ingredient_id',i.id,'quantity',ri.quantity*2,
      'total_cents',greatest(1,round(ri.quantity*2*i.average_cost_cents))
    ) order by i.id)
  ) into payload
  from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id and i.user_id=ri.user_id
  where ri.recipe_id=recipe.id and ri.user_id=owner_id;
  result=public.record_purchase(payload); duplicate=public.record_purchase(payload);
  if result is distinct from duplicate then raise exception 'Compra não é idempotente.'; end if;
  v_purchase_id=(result->>'id')::uuid;
  select count(*) into expense_count from public.expenses e where e.purchase_id=v_purchase_id;
  if expense_count<>1 then raise exception 'Compra gerou quantidade incorreta de despesas: %.',expense_count; end if;
  if (select count(*) from public.ingredient_purchase_items pi where pi.purchase_id=v_purchase_id)<>ingredient_count then
    raise exception 'Compra não registrou exatamente os ingredientes da receita.';
  end if;
  if (select e.amount_cents from public.expenses e where e.purchase_id=v_purchase_id)
    is distinct from (select p.total_cents from public.ingredient_purchases p where p.id=v_purchase_id) then
    raise exception 'Despesa e total da compra divergentes.';
  end if;
  for row in select i.id,i.stock,ri.quantity from public.recipe_ingredients ri
    join public.ingredients i on i.id=ri.ingredient_id and i.user_id=ri.user_id
    where ri.recipe_id=recipe.id and ri.user_id=owner_id loop
    if row.stock<>(ingredient_baseline->>row.id::text)::numeric+row.quantity*2 then
      raise exception 'Compra duplicada ou entrada de insumo incorreta.';
    end if;
  end loop;
  raise notice 'PASSOU: compra idempotente, entrada de insumos e uma única despesa.';

  payload=jsonb_build_object('request_id',gen_random_uuid(),'recipe_id',recipe.id,
    'production_date',current_date,'batches',1,'actual_quantity',12,'notes','Descartar com ROLLBACK');
  result=public.record_production(payload); duplicate=public.record_production(payload);
  if result is distinct from duplicate then raise exception 'Produção não é idempotente.'; end if;
  v_production_id=(result->>'id')::uuid;
  if (select p.stock from public.products p where p.id=product.id)<>product.stock+12 then
    raise exception 'Produção não adicionou exatamente 12 brownies.';
  end if;
  if (select count(*) from public.stock_movements sm where sm.reference_id=v_production_id and sm.kind='production')<>ingredient_count+1 then
    raise exception 'Movimentos da produção divergentes.';
  end if;
  for row in select i.id,i.stock,ri.quantity from public.recipe_ingredients ri
    join public.ingredients i on i.id=ri.ingredient_id and i.user_id=ri.user_id
    where ri.recipe_id=recipe.id and ri.user_id=owner_id loop
    if row.stock<>(ingredient_baseline->>row.id::text)::numeric+row.quantity then
      raise exception 'Consumo dos insumos da produção incorreto.';
    end if;
  end loop;
  raise notice 'PASSOU: uma forma, 12 brownies, consumo correto e produção idempotente.';

  insert into public.customers(name,notes)
    values('Verificação transacional','Cadastro temporário: descartar com ROLLBACK') returning id into v_customer_id;
  payload=jsonb_build_object('request_id',gen_random_uuid(),'customer_id',v_customer_id,'product_id',product.id,
    'quantity',1,'modality','credit','unit_price_cents',600,'discount_cents',200,
    'sale_date',current_date,'due_date',current_date+7,'immediate_payment_cents',0,'notes','Descartar com ROLLBACK');
  result=public.create_sale(payload); duplicate=public.create_sale(payload);
  if result is distinct from duplicate then raise exception 'Venda não é idempotente.'; end if;
  v_sale_id=(result->>'id')::uuid;
  if not exists(select 1 from public.sales s where s.id=v_sale_id and s.gross_cents=600 and s.discount_cents=200 and s.total_cents=400) then
    raise exception 'Venda não preservou bruto 600, desconto 200 e total 400 centavos.';
  end if;
  if (select p.stock from public.products p where p.id=product.id)<>product.stock+11 then
    raise exception 'Venda não retirou exatamente uma unidade.';
  end if;
  raise notice 'PASSOU: venda fiada idempotente, desconto preservado e saída de uma unidade.';

  payload=jsonb_build_object('request_id',gen_random_uuid(),'customer_id',v_customer_id,'amount_cents',200,
    'payment_date',current_date,'method','pix','sale_ids',jsonb_build_array(v_sale_id),'notes','Descartar com ROLLBACK');
  result=public.record_payment(payload); duplicate=public.record_payment(payload);
  if result is distinct from duplicate then raise exception 'Pagamento parcial não é idempotente.'; end if;
  v_payment_id=(result->>'id')::uuid;
  select s.total_cents-coalesce(sum(a.amount_cents) filter(where p.voided_at is null),0)
    into balance from public.sales s left join public.payment_allocations a on a.sale_id=s.id
    left join public.payments p on p.id=a.payment_id where s.id=v_sale_id group by s.total_cents;
  if balance<>200 or (select count(*) from public.payments p where p.customer_id=v_customer_id)<>1 then
    raise exception 'Pagamento parcial/idempotência incorretos; saldo esperado 200.';
  end if;
  if (select a.amount_cents from public.payment_allocations a where a.payment_id=v_payment_id and a.sale_id=v_sale_id) is distinct from 200::bigint then
    raise exception 'Pagamento parcial não foi alocado à venda.';
  end if;
  raise notice 'PASSOU: pagamento parcial de 200, saldo 200 e nenhum recebimento duplicado.';

  payload=jsonb_set(payload,'{request_id}',to_jsonb(gen_random_uuid()::text));
  result=public.record_payment(payload); duplicate=public.record_payment(payload);
  if result is distinct from duplicate then raise exception 'Quitação não é idempotente.'; end if;
  select s.total_cents-coalesce(sum(a.amount_cents) filter(where p.voided_at is null),0)
    into balance from public.sales s left join public.payment_allocations a on a.sale_id=s.id
    left join public.payments p on p.id=a.payment_id where s.id=v_sale_id group by s.total_cents;
  if balance<>0 or (select count(*) from public.payments p where p.customer_id=v_customer_id)<>2 then
    raise exception 'Quitação incorreta; saldo esperado zero e exatamente dois recebimentos.';
  end if;
  raise notice 'PASSOU: quitação de mais 200, saldo zero e exatamente dois recebimentos.';
  raise notice 'ASSERTS CONCLUÍDOS. A próxima instrução descarta todas as gravações desta verificação.';
end $$;

rollback;

-- Apenas contagens; compare com CONTAGEM ANTES nos notices. Nenhum dado pessoal,
-- identificador de usuário ou registro de negócio é exibido.
select 'ROLLBACK executado; compare com CONTAGEM ANTES' as verificacao,
  jsonb_build_object(
    'customers',(select count(*) from public.customers where user_id=p.id),
    'sales',(select count(*) from public.sales where user_id=p.id),
    'sale_items',(select count(*) from public.sale_items where user_id=p.id),
    'payments',(select count(*) from public.payments where user_id=p.id),
    'payment_allocations',(select count(*) from public.payment_allocations where user_id=p.id),
    'ingredient_purchases',(select count(*) from public.ingredient_purchases where user_id=p.id),
    'ingredient_purchase_items',(select count(*) from public.ingredient_purchase_items where user_id=p.id),
    'expenses',(select count(*) from public.expenses where user_id=p.id),
    'production_batches',(select count(*) from public.production_batches where user_id=p.id),
    'stock_movements',(select count(*) from public.stock_movements where user_id=p.id),
    'idempotency_requests',(select count(*) from app_private.requests where user_id=p.id)
  ) as contagem_depois
from public.profiles p;
