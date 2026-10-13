# BrownieFlow

Sistema pessoal de produção, vendas e finanças para uma operação de brownies. React + TypeScript + Vite, Supabase Auth/PostgreSQL, Tailwind CSS, componentes no padrão shadcn/ui sobre Radix, TanStack Query, React Hook Form + Zod e Recharts.

Não existe modo de demonstração nos registros da aplicação. O cadastro do proprietário cria somente configurações, produto, ingredientes e receita padrão. Vendas, caixa e estoques começam zerados.

## Executar localmente

Requisito: Node.js 22.12+ ou 24 LTS e npm. Use um projeto Supabase dedicado.

```sh
npm ci
```

Copie `.env.example` para `.env` e configure:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
VITE_ALLOW_SIGNUP=true
```

Use uma chave publishable (`sb_publishable_…`) ou a chave legada `anon`. Não use chave secreta nem `service_role` no frontend. As variáveis `VITE_` são públicas no bundle. `.env` está ignorado pelo Git. Nunca substitua um `.env` configurado pelo exemplo durante uma atualização.

```sh
npm run dev
```

Abra `http://127.0.0.1:5173`. Quando as variáveis mudarem, reinicie o servidor. O aplicativo verifica a instalação e bloqueia o cadastro enquanto as migrações estiverem ausentes.

## Preparar o Supabase

1. No projeto Supabase novo, abra **SQL Editor → New query** e execute o conteúdo de `supabase/setup.sql`. Esse arquivo reúne as migrações em ordem. Em uma instalação existente, execute **somente as migrações ainda não aplicadas**, disponíveis em `supabase/migrations`.
2. Em **Authentication → Sign In / Providers**, mantenha o provedor **Email** habilitado e desative **Confirm email**. O login usa `nome_de_usuario@brownieflow.internal`; esse endereço é um identificador técnico, sem caixa de entrada.
3. Configure a Site URL do Auth para sua URL local e depois para a URL HTTPS definitiva.
4. Abra o aplicativo e crie sua conta de proprietário. Use de 3 a 30 caracteres no usuário (letras minúsculas, números e `_`) e senha com pelo menos 8 caracteres.
5. Depois do primeiro cadastro, desative **Allow new users to sign up** no Supabase e defina `VITE_ALLOW_SIGNUP=false` no frontend. O banco também impede cadastros adicionais de forma transacional, e a interface oculta o cadastro quando o proprietário já existe.

Alternativamente, use a CLI oficial:

```sh
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase db push
```

Para regenerar o SQL combinado após adicionar migrações:

```sh
npm run db:prepare
```

Detalhes de RLS, permissões, autenticação e migrações estão em [supabase/README.md](supabase/README.md). O arquivo combinado é um artefato de instalação; `supabase/migrations` é a fonte de verdade.

### Acesso e recuperação

A senha é tratada exclusivamente pelo Supabase Auth. O aplicativo não armazena senhas em tabelas. O SDK está configurado para persistir a sessão e renová-la automaticamente; sair limpa o cache de dados privados da interface.

Nome de exibição, nome de usuário e senha podem ser alterados em Configurações. Trocar o nome de usuário atualiza o identificador interno; use o novo nome no próximo acesso. Como o endereço interno não recebe e-mails, não há recuperação automática por e-mail. Se esquecer a senha, o administrador do projeto deve usar as ferramentas administrativas do Supabase para redefini-la. Não exclua a conta para tentar reabrir cadastros: o bloqueio da instalação permanece por segurança.

## Primeiros registros

1. **Configurações:** confira os preços do Brownie tradicional (R$5 à vista e R$6 fiado), nome do negócio, vencimento e mensagem de cobrança.
2. **Receitas:** confira a ficha padrão de 12 brownies: 150 g de farinha, 90 g de açúcar, 370 g de Chocky, 3 ovos e 70 g de margarina. Todos os valores são editáveis.
3. **Estoque → Nova compra:** informe as quantidades na unidade base (g, ml ou un) e o valor total de cada item. Uma compra de 1 kg deve entrar como 1.000 g quando o ingrediente usa g. O custo médio é ponderado; a compra gera uma única despesa de caixa.
4. **Produção:** escolha a receita, o número de formas e o rendimento real. A confirmação consome ingredientes, gera o lote e abastece o estoque de brownies.
5. **Nova venda:** selecione cliente/produto/quantidade/modalidade. Confirme separadamente se recebeu nada, parte ou todo o valor. Vender à vista não quita automaticamente a venda.
6. **Cobranças / Recebimentos:** registre pagamentos parciais ou integrais. Um recebimento pode ser alocado a várias compras do mesmo cliente. O WhatsApp abre com a mensagem para revisão e envio manual.

## Módulos

| Área                | Funcionalidades                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Visão geral         | Indicadores do dia e período, faturamento/caixa, custos estimados, gráficos e clientes com saldo                                               |
| Vendas              | Registro rápido, cliente recente/novo, preço por modalidade, desconto em R$/%, pagamento imediato opcional, repetição e cancelamento auditável |
| Clientes            | Pesquisa por nome/telefone, cadastro, edição, arquivamento e histórico de compras/pagamentos/descontos                                         |
| Cobranças           | Vencidas, vencendo hoje, parciais, quitadas, filtro por cliente, ajuste justificado e mensagem WhatsApp                                        |
| Recebimentos        | Pix/dinheiro/cartão/transferência/outro, alocação automática ou por vendas, estorno e registros sem vínculo                                    |
| Despesas            | Categorias, fornecedor, forma de pagamento, filtros e CRUD de lançamentos avulsos                                                              |
| Estoque             | Insumos/produtos, compras, custo ponderado, perdas, cortesias, consumo próprio, ajustes e movimentações                                        |
| Receitas e produção | Fichas técnicas, rendimento configurável/real, consumo, custo histórico e capacidade de produção                                               |
| Planejamento        | Formas/dias, mix à vista/fiado ou preço médio, insumos necessários, reposição e margem                                                         |
| Relatórios          | Períodos, faturamento/caixa/resultado estimado, rankings e CSV de vendas, recebimentos, clientes e despesas                                    |
| Configurações       | Negócio, usuário/senha, produtos/preços/padrão, vencimento, alertas, tema e cobrança                                                           |

## Regras financeiras e de estoque

- **Faturamento:** valor das vendas na data da venda. O bruto preserva o preço original; descontos ficam separados.
- **Recebimento:** entrada efetiva na data informada no pagamento, mesmo quando a venda ocorreu em outro mês.
- **Saldo devedor:** total da venda + ajustes posteriores − pagamentos ativos alocados. Pagamentos estornados não quitam dívida. O estado financeiro é calculado, sem coluna manual de “pago”.
- **Caixa:** recebimentos ativos − despesas pagas no período. Custo estimado de produção não gera outra saída de caixa.
- **Contribuição estimada:** vendas líquidas e ajustes, menos custo histórico dos produtos vendidos. É uma estimativa antes de despesas não incorporadas ao custo; não é lucro contábil.
- Os saldos pendentes dos relatórios são os saldos **atuais** das vendas selecionadas. Não são uma reconstrução histórica da posição de caixa em uma data passada.
- Custo de lote/produto usa a média ponderada disponível na ordem de gravação. Datas retroativas não recalculam movimentos já registrados.
- Uma compra cria insumos, movimento e uma única despesa na mesma transação. A despesa vinculada não admite alteração independente.
- Correção de recebimentos: estorne o registro com justificativa e lance o correto. O original permanece no histórico. Pagamentos sem cliente e sem alocação ficam identificados para conciliação futura.
- Cancelar uma venda restaura o estoque uma vez; antes, os recebimentos vinculados precisam ser estornados.
- Estoque negativo é bloqueado. Divergência física exige ajuste justificado antes da venda/produção. Não use ajustes para ocultar perdas.
- Operações financeiras e de estoque possuem validação no PostgreSQL, bloqueio transacional por usuário e identificador idempotente. A interface não anuncia sucesso quando o servidor não confirma. Em resultado incerto, mantenha os dados da tentativa e confira o histórico antes de criar outra operação.

## Arquitetura

Os pacotes Radix UI estão fixados em versões compatíveis e devem ser atualizados em conjunto. Cópias diferentes de `react-focus-scope` e `react-dismissable-layer` fazem os modais bloquear o foco e os cliques de calendários e seletores. Os testes de interface cobrem esses controles dentro do formulário de venda em computador e celular.

```text
src/
  components/ui.tsx           Componentes acessíveis reutilizáveis
  components/Shell.tsx        Navegação desktop/mobile e ações globais
  components/finance/         Formulários e históricos financeiros
  components/operations/      Formulários e cálculos operacionais
  lib/auth.tsx                Sessão e logout Supabase
  lib/data.ts                 Consulta, cache, Realtime e mutações
  lib/installation.ts         Verificação anônima da instalação
  lib/finance.ts              Cálculos e exportação CSV
  pages/                     Telas por módulo
  types.ts                   Tipos de domínio
supabase/migrations/          Esquema, RLS e RPCs versionadas
tests/                       Testes unitários, SQL e navegador
```

As 16 tabelas privadas possuem `user_id`, RLS e relações que preservam o proprietário. Campos de estoque/custo não admitem gravação direta pelo cliente. Operações que afetam várias tabelas executam por RPC atômica. Funções privilegiadas usam `search_path` fixo e permissões explícitas. `installation_status` só revela a versão e se a conta do proprietário existe.

`get_app_data()` retorna as 16 coleções do usuário num único snapshot PostgreSQL, com RLS e permissões do usuário autenticado (`SECURITY INVOKER`). A interface mantém cache por usuário, atualiza após mutações, recebe eventos Realtime e confere novamente a cada 30 segundos. Esta primeira versão carrega o histórico completo; para volume elevado, evolua para consultas agregadas e páginas por módulo. O cache de dados privados fica apenas na memória do aplicativo.

## Verificação

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Os testes SQL executam as migrações reais em PGlite/PostgreSQL, com papéis `anon` e `authenticated`, cobrindo RLS, isolamento, descontos, pagamentos parciais, estorno, idempotência, rollback e estoque. Os testes de navegador executam desktop e celular; dados e rede de teste são isolados em `tests/e2e`, sem fazer parte do app nem escrever no Supabase real.

Em 13/10/2026, as migrações foram aplicadas no projeto Supabase configurado. Foram verificados a versão `202610130001` em `installation_status()`, RLS nas 16 tabelas privadas e a recusa de `get_app_data()` para acesso anônimo (`401`/`42501`). O proprietário criou a conta, a sessão persistiu após reiniciar o servidor local e a interface leu a receita padrão com cinco ingredientes e rendimento de 12, mantendo registros financeiros e estoques zerados. **Confirm email** ficou desativado, e novos cadastros foram bloqueados no Auth e no frontend. Login após logout, renovação de token e troca de usuário/senha permanecem sem validação real registrada.

A verificação `supabase/verify-rollback.sql` também passou no Supabase hospedado em 13/10/2026: compra com uma única despesa, produção de 12 unidades, venda de R$6 com R$2 de desconto, pagamento parcial de R$2 e quitação dos R$2 restantes. A repetição dos mesmos identificadores não duplicou operações. Após `ROLLBACK`, as 11 contagens operacionais verificadas retornaram a zero, inclusive os registros de idempotência. A verificação não deixou lançamentos de teste no sistema. No ambiente local, passaram 90 testes de regras/banco, 27 verificações de interface em desktop/celular e o build de produção.

Testes locais não substituem a homologação do Supabase hospedado: os fluxos de Auth ainda pendentes, Realtime e concorrência entre conexões devem ser conferidos no projeto configurado. Novas instalações também precisam validar seu próprio cadastro inicial. Não grave vendas fictícias permanentes no projeto de produção para isso; mantenha um projeto separado para homologação. As instruções da verificação transacional estão em [supabase/README.md](supabase/README.md).

## Publicar o frontend

```sh
npm ci
npm run build
npm run preview
```

O diretório `dist` contém os arquivos estáticos. Vercel e Netlify têm configurações incluídas; importe este repositório, defina o comando `npm run build`, saída `dist` e as mesmas variáveis públicas de ambiente. Elas são incorporadas durante o build: alterações exigem uma nova publicação. Após a conta inicial, use `VITE_ALLOW_SIGNUP=false`.

Outros servidores devem servir `index.html` para rotas da aplicação, como `/vendas`, e manter os arquivos de `assets` e o service worker em suas URLs originais. Use HTTPS, mantenha `sw.js` sem cache duradouro e atualize a Site URL do Supabase para o domínio definitivo. O projeto é configurado para publicação na raiz do domínio.

## Instalar como PWA

Após publicar em HTTPS, use “Instalar aplicativo” no Chrome/Edge/Android. Quando disponível, o aplicativo também mostra a ação de instalação na barra superior. No Safari/iPhone, use Compartilhar → Adicionar à Tela de Início. O manifest, ícones e service worker são gerados no build.

O service worker armazena os arquivos da interface. Autenticação e gravações exigem rede; não há fila de vendas offline. Dados já carregados podem ser consultados enquanto a página permanecer aberta, mas recarregar sem conexão pode impedir a leitura. Uma nova versão mostra aviso antes de atualizar.

## Operação e manutenção

Configure backups no Supabase e faça exportações CSV conforme sua rotina. A aplicação não faz integração bancária, emissão fiscal ou envio automático de mensagens. Correções de compras já confirmadas, restauração de backups e recuperação de conta são operações administrativas; não altere manualmente tabelas de saldo/estoque sem reconciliar o histórico.

Documentação oficial: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Vite](https://vite.dev/guide/), [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite).
