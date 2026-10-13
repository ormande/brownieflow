import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChefHat,
  CircleHelp,
  Package,
  TrendingUp,
  Wheat,
} from "lucide-react";
import { useAppData } from "../lib/data";
import { money, quantity, toCents } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  PageHeader,
  Select,
  Stat,
} from "../components/ui";
import { OperationState, recipeMetrics } from "../components/operations/helpers";

export default function Planning() {
  const query = useAppData();
  const data = query.data;
  const [recipeId, setRecipeId] = useState("");
  const [formsPerDay, setFormsPerDay] = useState("3");
  const [days, setDays] = useState("5");
  const [pricing, setPricing] = useState<"mix" | "average">("mix");
  const [creditPercent, setCreditPercent] = useState("30");
  const [averagePrice, setAveragePrice] = useState<string | null>(null);
  const recipe =
    data?.recipes.find((row) => row.id === recipeId) ??
    data?.recipes.find((row) => row.is_default) ??
    data?.recipes[0];
  const metrics = data && recipe ? recipeMetrics(recipe, data) : null;
  const product = data?.products.find((row) => row.id === recipe?.product_id);
  const formsNumber = Number(formsPerDay);
  const daysNumber = Number(days);
  const creditNumber = Number(creditPercent);
  const averageDisplay =
    averagePrice === null ? String((product?.cash_price_cents ?? 0) / 100) : averagePrice;
  const validForms =
    formsPerDay !== "" && Number.isFinite(formsNumber) && formsNumber > 0;
  const validDays = days !== "" && Number.isInteger(daysNumber) && daysNumber > 0;
  const validCredit =
    creditPercent !== "" &&
    Number.isFinite(creditNumber) &&
    creditNumber >= 0 &&
    creditNumber <= 100;
  const validAverage =
    averageDisplay !== "" &&
    Number.isFinite(Number(averageDisplay)) &&
    Number(averageDisplay) >= 0;
  const valid =
    validForms && validDays && (pricing === "mix" ? validCredit : validAverage);
  const forms = valid ? formsNumber * daysNumber : 0;
  const units = Math.round(forms * (recipe?.yield_quantity ?? 0));
  const ingredientCost = Math.round(forms * (metrics?.cost ?? 0));
  const unitPrice =
    pricing === "average"
      ? toCents(Number(averageDisplay) || 0)
      : (product?.cash_price_cents ?? 0) * (1 - creditNumber / 100) +
        ((product?.credit_price_cents ?? 0) * creditNumber) / 100;
  const revenue = valid ? Math.round(units * unitPrice) : 0;
  const margin = revenue - ingredientCost;
  const marginPercent = revenue ? (margin / revenue) * 100 : 0;
  const needs =
    metrics?.lines.map((line) => {
      const required = Number(line.quantity) * forms;
      const stock = Number(line.ingredient?.stock ?? 0);
      const missing = Math.max(0, required - stock);
      return {
        ...line,
        required,
        stock,
        missing,
        totalCost: required * Number(line.ingredient?.average_cost_cents ?? 0),
        missingCost: missing * Number(line.ingredient?.average_cost_cents ?? 0),
      };
    }) ?? [];
  const purchaseEstimate = needs.reduce((sum, line) => sum + line.missingCost, 0);
  const needsPurchase = needs.some((line) => line.missing > 0);
  return (
    <div className="stack">
      <PageHeader
        title="Planejamento"
        description="Transforme suas próximas fornadas em um plano claro."
      />
      <OperationState loading={query.isLoading} error={query.error} retry={query.refetch}>
        {data &&
          (!recipe || !metrics ? (
            <Card>
              <Empty
                title="Uma receita para começar a planejar"
                description="Crie sua ficha técnica com ingredientes e rendimento para projetar produção, custos e vendas."
                action={
                  <Button asChild>
                    <Link to="/receitas">Criar ficha técnica</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="ops-planning">
                <Card className="stack">
                  <div className="ops-stock">
                    <CalendarDays size={20} />
                    <h2 className="section-title" style={{ margin: 0 }}>
                      Seu plano de produção
                    </h2>
                  </div>
                  <Field label="Receita">
                    <Select
                      value={recipe.id}
                      onChange={(event) => {
                        setRecipeId(event.target.value);
                        setAveragePrice(null);
                      }}
                    >
                      {data.recipes.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="form-grid">
                    <Field
                      label="Formas por dia"
                      error={
                        !validForms ? "Informe uma quantidade maior que zero." : undefined
                      }
                    >
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={formsPerDay}
                        onChange={(event) => setFormsPerDay(event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Dias de produção"
                      error={
                        !validDays
                          ? "Informe um número inteiro maior que zero."
                          : undefined
                      }
                    >
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={days}
                        onChange={(event) => setDays(event.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="ops-form-summary">
                    <span>Rendimento da ficha técnica</span>
                    <strong>
                      {recipe.yield_quantity}{" "}
                      <span style={{ fontSize: 12 }}>un / forma</span>
                    </strong>
                  </div>
                  <Field label="Como estimar as vendas">
                    <Select
                      value={pricing}
                      onChange={(event) =>
                        setPricing(event.target.value as "mix" | "average")
                      }
                    >
                      <option value="mix">Mix entre à vista e fiado</option>
                      <option value="average">Preço médio por brownie</option>
                    </Select>
                  </Field>
                  {pricing === "mix" ? (
                    <>
                      <Field
                        label="Percentual vendido fiado"
                        error={
                          !validCredit ? "Use um percentual entre 0 e 100." : undefined
                        }
                      >
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={creditPercent}
                          onChange={(event) => setCreditPercent(event.target.value)}
                        />
                      </Field>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        aria-label="Percentual vendido fiado"
                        value={validCredit ? creditNumber : 0}
                        onChange={(event) => setCreditPercent(event.target.value)}
                        style={{ width: "100%", accentColor: "#a56b47" }}
                      />
                      <div className="ops-recipe-line">
                        <span>
                          À vista · {validCredit ? quantity(100 - creditNumber) : "—"}%
                        </span>
                        <strong>{money(product?.cash_price_cents ?? 0)}</strong>
                        <span className="muted">/ un.</span>
                      </div>
                      <div className="ops-recipe-line">
                        <span>Fiado · {validCredit ? quantity(creditNumber) : "—"}%</span>
                        <strong>{money(product?.credit_price_cents ?? 0)}</strong>
                        <span className="muted">/ un.</span>
                      </div>
                    </>
                  ) : (
                    <Field
                      label="Preço médio de venda (R$)"
                      error={!validAverage ? "Informe um preço válido." : undefined}
                    >
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={averageDisplay}
                        onChange={(event) => setAveragePrice(event.target.value)}
                      />
                    </Field>
                  )}
                  <p className="ops-fine ops-hint">
                    A projeção usa os custos e preços atuais. Ela não registra produções,
                    vendas nem despesas.
                  </p>
                </Card>
                <div className="stack">
                  <div className="ops-hero">
                    <p>Faturamento potencial</p>
                    <strong>{valid ? money(revenue) : "—"}</strong>
                    <p>
                      {valid
                        ? `${quantity(units)} brownies × ${money(unitPrice)} de preço médio`
                        : "Ajuste os campos para calcular a projeção."}
                    </p>
                  </div>
                  <div className="grid-2">
                    <Stat
                      label="Receitas no período"
                      value={valid ? quantity(forms) : "—"}
                      hint={`${validForms ? quantity(formsNumber) : "—"} formas por dia`}
                      icon={<ChefHat size={18} />}
                    />
                    <Stat
                      label="Brownies previstos"
                      value={valid ? quantity(units) : "—"}
                      hint={`${recipe.yield_quantity} por forma`}
                      icon={<Package size={18} />}
                    />
                    <Stat
                      label="Custo de ingredientes"
                      value={valid ? money(ingredientCost) : "—"}
                      hint={
                        valid
                          ? `${money(metrics.cost * formsNumber)} por dia de produção`
                          : "Corrija o plano para calcular"
                      }
                      icon={<Wheat size={18} />}
                    />
                    <Stat
                      label="Margem estimada"
                      value={valid ? money(margin) : "—"}
                      hint={
                        valid
                          ? `${quantity(marginPercent)}% antes das demais despesas`
                          : "Corrija o plano para calcular"
                      }
                      icon={<TrendingUp size={18} />}
                    />
                  </div>
                  <Card>
                    <div className="ops-header">
                      <div>
                        <h2 className="section-title">Seu estoque acompanha o plano?</h2>
                        <p className="muted">
                          Capacidade com os ingredientes disponíveis agora.
                        </p>
                      </div>
                      <Badge tone={needsPurchase ? "amber" : "green"}>
                        {needsPurchase ? "Reposição necessária" : "Insumos disponíveis"}
                      </Badge>
                    </div>
                    <div className="ops-form-summary">
                      <span>Você pode produzir agora</span>
                      <strong>{quantity(metrics.possible)} formas</strong>
                    </div>
                    <div className="ops-progress" aria-hidden="true">
                      <span
                        style={{
                          width: `${forms > 0 ? Math.min(100, (metrics.possible / forms) * 100) : 0}%`,
                        }}
                      />
                    </div>
                    <p className="ops-fine" style={{ marginBottom: 0 }}>
                      {forms > 0
                        ? `${quantity(Math.min(100, (metrics.possible / forms) * 100))}% do plano coberto pelo estoque atual.`
                        : "Defina as formas e os dias de produção."}{" "}
                      {needsPurchase
                        ? `Reposição estimada: ${money(purchaseEstimate)}, pelo custo médio atual.`
                        : ""}
                    </p>
                  </Card>
                </div>
              </div>
              <Card>
                <div className="ops-header">
                  <div>
                    <h2 className="section-title">Lista de insumos do plano</h2>
                    <p className="muted">
                      Quantidade total para {valid ? quantity(forms) : "—"} formas de{" "}
                      {recipe.name.toLocaleLowerCase("pt-BR")}.
                    </p>
                  </div>
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/estoque">Gerenciar estoque</Link>
                  </Button>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ingrediente</th>
                        <th>Necessário</th>
                        <th>Em estoque</th>
                        <th>Falta comprar</th>
                        <th>Custo do consumo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {needs.map((line) => (
                        <tr key={line.id}>
                          <td>
                            <strong>
                              {line.ingredient?.name ?? "Ingrediente indisponível"}
                            </strong>
                          </td>
                          <td className="ops-number">
                            {quantity(line.required)} {line.ingredient?.unit}
                          </td>
                          <td className="ops-number">
                            {quantity(line.stock)} {line.ingredient?.unit}
                          </td>
                          <td>
                            <Badge tone={line.missing > 0 ? "amber" : "green"}>
                              {line.missing > 0
                                ? `${quantity(line.missing)} ${line.ingredient?.unit}`
                                : "Coberto"}
                            </Badge>
                          </td>
                          <td className="amount">{money(line.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>
                          <strong>Total de ingredientes consumidos</strong>
                        </td>
                        <td className="amount">
                          <strong>{money(ingredientCost)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
              <div className="ops-note">
                <CircleHelp size={20} />
                <p>
                  A projeção pressupõe a venda de todos os brownies produzidos, sem perdas
                  ou descontos. Faturamento potencial não representa dinheiro recebido:
                  vendas fiadas entram no caixa quando forem pagas. A margem considera
                  ingredientes; embalagens, energia, taxas e outras despesas devem ser
                  descontadas para apurar o resultado.
                </p>
              </div>
            </>
          ))}
      </OperationState>
    </div>
  );
}
