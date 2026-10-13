# Verificação no navegador

Execute `npx playwright install chromium` uma vez e depois `npm run test:e2e`.

Os testes iniciam um servidor Vite exclusivo em `http://127.0.0.1:4175` e abrem Chromium em desktop (1440 × 1000) e celular (390 × 844). Não precisam de `.env` nem acessam uma conta Supabase real: `fixtures.ts` intercepta HTTP e WebSocket do domínio fictício do teste e injeta a sessão apenas no contexto descartável do navegador. Produtos com estoque e clientes de teste existem somente nesses arquivos.

A suíte verifica navegação protegida, validação de entrada, estados vazios dos módulos, adaptação à largura da tela, navegação móvel, tema persistente, acessibilidade por teclado do modal, payloads monetários em centavos, venda à vista pendente, desconto percentual no fiado e preservação da operação após erro de rede. Ela verifica o comportamento da interface e o contrato das requisições. Não substitui a validação de autenticação ou funções do Supabase publicado; as regras do banco são exercitadas separadamente por `tests/database.test.ts` e `tests/review.test.ts`.

Capturas do painel e do formulário nos dois tamanhos ficam em `test-results/`. Falhas incluem screenshot e trace. O relatório HTML fica em `playwright-report/index.html`.
