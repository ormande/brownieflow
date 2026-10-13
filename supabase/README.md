# Banco do BrownieFlow

## Aplicação da migração

Use um projeto Supabase vazio e execute `setup.sql` no SQL Editor, ou aplique todos os arquivos de `migrations/` em ordem de nome. O arquivo combinado é gerado com `npm run db:prepare`; as migrações versionadas são a fonte de verdade. Como alternativa, execute na raiz do projeto:

```sh
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Cada migração é transacional. O SQL Editor deve executá-la integralmente, com a função administrativa padrão `postgres`. Ela não deve ser executada por `authenticated`. Alterações futuras devem ser novas migrações versionadas.

Em instalações existentes, aplique somente as migrações ainda não executadas. `202610130001_operational_validation.sql` adiciona limites numéricos, vencimento obrigatório no fiado, leitura consistente por `get_app_data()` e proteção da troca de usuário. Vendas fiadas antigas sem vencimento recebem a data da venda mais o prazo atual do perfil. A migração recusa dados preexistentes não finitos ou acima do limite financeiro; se falhar por isso, revise os registros com backup antes de corrigir sua origem. Ela não elimina nem substitui valores financeiros silenciosamente.

Para desenvolvimento com Docker, `npx supabase start` usa `config.toml`; `npx supabase db reset` reaplica as migrações e **apaga os dados locais**. Não use reset para atualizar uma instalação em uso.

## Autenticação privada

Antes de habilitar o cadastro, a interface deve confirmar `installation_status()` com `installed: true` e versão `202610130001`. Essa RPC pode ser chamada sem login e retorna somente `installed`, `has_owner` e `schema_version`. Falha ou ausência da RPC bloqueia o cadastro: criar o usuário antes de instalar o gatilho do banco produziria uma conta sem perfil nem registros iniciais. `has_owner: true` oculta o cadastro, enquanto o gatilho continua impondo o bloqueio no servidor.

1. Em **Authentication → Sign In / Providers**, mantenha o provedor **Email** habilitado e desative **Confirm email**. No ambiente local isso já consta no `config.toml`.
2. Cadastre a conta do proprietário pela aplicação antes de disponibilizar sua URL. O primeiro cadastro bem-sucedido ocupa permanentemente a instalação. Um bloqueio transacional no gatilho `auth.users` impede cadastros posteriores, incluindo duas tentativas simultâneas.
3. Após criar o proprietário, também desabilite **Allow new users to sign up** no painel do Supabase. O gatilho continua sendo uma segunda proteção, independente dessa configuração.
4. Use apenas a chave **publishable/anon** no frontend; nunca a chave `service_role`.

O identificador de login é `username@brownieflow.internal`, com username normalizado para letras minúsculas e a expressão `^[a-z0-9_]{3,30}$`. O email é um identificador técnico e não recebe mensagens. Senhas são gerenciadas exclusivamente pelo Supabase Auth. A recuperação automática por email não funciona com esse identificador; uma senha esquecida exige recuperação administrativa pelo dono do projeto Supabase. Não anuncie recuperação por email na interface.

`update_profile` atualiza perfil, email de `auth.users` e `identity_data.email` da identidade de email na mesma transação. Preserva o `provider_id`/`sub` e outras identidades; a coluna de email da identidade é gerada a partir do JSON no Supabase. A troca invalida tokens pendentes de confirmação, recuperação, troca de contato e reautenticação, incluindo `auth.one_time_tokens` quando disponível. Essa RPC não recebe nem manipula senhas. A alteração de senha deve usar `supabase.auth.updateUser({ password })`, com uma sessão válida. Depois de alterar username, novos logins devem utilizar o novo nome.

O caminho SQL é específico para este login interno com Email/senha e confirmação desabilitada. Ele não passa pela API administrativa, não envia notificações/hook de Auth, não revoga sessões existentes e não reemite JWTs; as claims antigas podem persistir até renovar a sessão. Não use esse fluxo como troca de email público, SSO ou recuperação de conta. As tabelas do Auth são administradas pelo Supabase: após atualizações, homologue login com novo username, rejeição do antigo, refresh, troca de senha e invalidade dos tokens antigos no projeto hospedado. Referências verificadas: [estrutura das identidades](https://supabase.com/docs/guides/auth/identities), [implementação administrativa de alteração de email](https://github.com/supabase/auth/blob/master/internal/api/admin.go) e [invalidação de tokens](https://github.com/supabase/auth/blob/master/internal/models/user.go).

`app_private.owner_registry` deliberadamente não é apagado quando o usuário é removido. Excluir acidentalmente a conta não reabre cadastros públicos. Recuperação da instalação é uma operação administrativa, com backup e revisão manual; a aplicação não possui comando para remover esse bloqueio.

## Segurança e regras contábeis

- As 16 tabelas de aplicação possuem `user_id`, RLS de leitura e chaves estrangeiras compostas `(id,user_id)`. Assim, um registro não pode apontar para uma entidade de outro usuário.
- Clientes e despesas avulsas admitem CRUD próprio. Produtos e ingredientes admitem apenas metadados; `stock` e `average_cost_cents` não podem ser gravados diretamente pelo cliente. Fichas são salvas por RPC e podem ser excluídas somente quando não possuem lote referenciando-as.
- `set_default_product({ product_id })` troca o produto padrão atomicamente e aceita somente um produto ativo do próprio usuário.
- Vendas, itens, recebimentos, alocações, ajustes, compras, lotes e movimentos somente são alterados pelas RPCs. Despesas geradas por compra não podem ser alteradas/excluídas diretamente.
- As RPCs operacionais validam `auth.uid()` e usam `SECURITY DEFINER` com `search_path` vazio. Execução anônima é revogada para dados e operações privadas. Somente `installation_status()` admite leitura anônima dos três indicadores descritos acima. Todas as operações de dinheiro e estoque do mesmo usuário compartilham um bloqueio transacional para impedir concorrência de saldo/estoque.
- A RPC de leitura `get_app_data()` é a exceção intencional: `STABLE SECURITY INVOKER`, com RLS e filtro explícito de usuário. As 16 coleções vêm em uma única consulta/snapshot, com arrays vazios e ordenação determinística; não mistura saldos de antes de uma transação com alocações de depois dela. É um agregado JSON, não uma listagem sujeita ao limite de linhas do PostgREST. A aplicação carrega o histórico completo; volumes muito grandes exigirão consultas agregadas/paginação com snapshot no futuro.
- RPCs com `request_id` guardam a resposta e o conteúdo da operação no schema não exposto `app_private`. Repetir a mesma chave e conteúdo devolve a resposta original; reutilizar a chave com outro conteúdo é erro. O cliente deve conservar a chave enquanto o resultado de uma tentativa for incerto.
- Valores financeiros são inteiros em centavos. Quantidades e custos unitários usam `numeric`, com seis casas para insumos. O custo total do lote é arredondado uma vez para centavos; o custo por unidade pode ter frações de centavo.
- Cada valor financeiro inteiro e o valor ajustado total de cada venda ficam no intervalo seguro de inteiros do JavaScript, até 9.007.199.254.740.991 centavos. Quantidades, custos e mínimos de estoque rejeitam `NaN` e infinitos no próprio banco, mesmo se enviados diretamente à API. Uma venda fiada exige cliente e vencimento igual ou posterior à data da venda.
- O preço bruto, desconto inicial, ajustes posteriores e pagamentos são registrados separadamente. O saldo é `total_cents + ajustes - alocações de pagamentos não estornados`. O status é derivado; não há coluna editável de “pago”.
- Recebimentos são alocados por vencimento e data de venda. Pagamentos a clientes não podem exceder a dívida das vendas selecionadas. Um pagamento sem cliente e sem vendas permanece sem vínculo, visível para futura conciliação.
- Estornos preservam pagamentos e alocações. Cancelamento de venda exige estorno dos pagamentos ativos vinculados e devolve o estoque somente uma vez. O custo histórico da venda é usado na devolução.
- Uma compra gera exatamente uma despesa e atualiza estoque/custo médio ponderado em uma única transação. Produção consome insumos e transfere seu custo para produtos acabados, sem criar outra despesa de caixa.
- Estoque negativo é bloqueado. Em uma divergência física confirmada, registre primeiro uma entrada de ajuste com justificativa, que será auditável no histórico. Perdas, cortesias e consumo próprio só podem retirar estoque.
- Custos históricos são snapshots no momento do lançamento. Lançamentos com data retroativa não recalculam os custos dos lançamentos já registrados; a média é atualizada na ordem de gravação.

## Dados iniciais

O gatilho de criação do proprietário insere apenas perfil, Brownie tradicional (R$5 à vista/R$6 fiado), ficha com rendimento 12 e cinco ingredientes com preços de referência. Os estoques iniciais são **zero**. Não existem vendas, recebimentos, despesas, compras, lotes ou movimentações fictícias. Registre compras ou ajustes físicos justificados antes de produzir/vender.

## Testes

```sh
npm test -- tests/database.test.ts tests/review.test.ts
```

A suíte aplica todas as migrações ordenadas no PostgreSQL embarcado PGlite, cria os papéis `anon`/`authenticated` e simula apenas a camada de autenticação. Ela testa RLS e permissões, snapshot de leitura, cadastro único, idempotência, limites financeiros e valores não finitos, saldo, descontos, pagamento parcial em várias compras, estorno, cancelamento, rollback, custo ponderado, consumo de produção e conservação de estoque. O segundo usuário dos testes é criado administrativamente apenas para verificar isolamento; não existe em dados da aplicação.

O PGlite tem uma conexão e não executa o serviço Supabase Auth/PostgREST/Realtime. Conexões realmente concorrentes, emissão/renovação de tokens, troca de senha, login após mudança de username e entrega de eventos precisam de um teste de homologação no projeto Supabase configurado. A migração registra as tabelas na publicação `supabase_realtime` quando essa publicação existe.

No projeto hospedado, em 13/10/2026, foram confirmados a aplicação das migrações, `installation_status().schema_version = '202610130001'`, RLS nas 16 tabelas privadas e bloqueio de `get_app_data()` para anônimos (`401`/`42501`). O proprietário criou a conta; a sessão persistiu após reinício do servidor local, e a interface consultou a receita padrão com cinco ingredientes/rendimento 12 e dados operacionais zerados. **Confirm email** foi desativado; **Allow new users to sign up** e `VITE_ALLOW_SIGNUP` foram desabilitados após o cadastro. Login após logout, renovação de token e alterações de usuário/senha ainda exigem homologação real.

`verify-rollback.sql` é uma verificação operacional opcional para revisão e execução integral no SQL Editor como `postgres`, depois de criar o proprietário. Usa uma única transação com `ROLLBACK`, define a identidade antes de assumir `authenticated` e valida compra/produção/venda com desconto/pagamento parcial/quitação e idempotência. Exige receita padrão com rendimento 12. Execute sem outras gravações simultâneas; compare a contagem final com o aviso `CONTAGEM ANTES`. Os registros temporários e tokens de idempotência são revertidos. Se algum assert interromper o editor, execute `ROLLBACK` para encerrar a transação abortada. Não execute trechos nem substitua a reversão por confirmação. O script passou no PGlite e foi executado integralmente no Supabase hospedado em 13/10/2026. O resultado final confirmou o rollback e 11 contagens operacionais zeradas, inclusive `app_private.requests`; nenhum lançamento de teste permaneceu.

Não há backup automático implementado pela aplicação. Configure a política de backups no Supabase antes de operar com dados reais e conserve as exportações CSV conforme sua rotina.
