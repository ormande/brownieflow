import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Boxes,
  Package,
  Pencil,
  Plus,
  ShoppingBag,
  Trash2,
  Wheat,
} from "lucide-react";
import type { Ingredient } from "../types";
import { useAction, useAppData } from "../lib/data";
import { dateLabel, money, quantity } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  Empty,
  Input,
  PageHeader,
  Select,
  Stat,
} from "../components/ui";
import {
  IngredientForm,
  PurchaseForm,
  StockAdjustmentForm,
} from "../components/operations/InventoryForms";
import { movementLabels, OperationState } from "../components/operations/helpers";

export default function Inventory() {
  const query = useAppData();
  const data = query.data;
  const action = useAction();
  const [tab, setTab] = useState<"products" | "ingredients" | "history" | "purchases">(
    "products",
  );
  const [search, setSearch] = useState("");
  const [historyTarget, setHistoryTarget] = useState("");
  const [kind, setKind] = useState("");
  const [ingredientForm, setIngredientForm] = useState<Ingredient | "new" | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(50);
  const threshold = data?.profiles[0]?.low_stock_threshold ?? 12;
  const lowIngredients =
    data?.ingredients.filter((row) => Number(row.stock) <= Number(row.minimum_stock)) ??
    [];
  const lowProducts =
    data?.products.filter((row) => row.active && Number(row.stock) <= threshold) ?? [];
  const totalProducts =
    data?.products.reduce((sum, row) => sum + Number(row.stock), 0) ?? 0;
  const ingredientsValue =
    data?.ingredients.reduce(
      (sum, row) => sum + Number(row.stock) * Number(row.average_cost_cents),
      0,
    ) ?? 0;
  const history = useMemo(
    () =>
      (data?.stock_movements ?? [])
        .filter(
          (row) =>
            (!kind || row.kind === kind) &&
            (!historyTarget ||
              (historyTarget.startsWith("product:")
                ? row.product_id === historyTarget.slice(8)
                : row.ingredient_id === historyTarget.slice(11))),
        )
        .sort(
          (a, b) =>
            b.movement_date.localeCompare(a.movement_date) ||
            b.created_at.localeCompare(a.created_at),
        ),
    [data?.stock_movements, historyTarget, kind],
  );
  const filter = search.trim().toLocaleLowerCase("pt-BR");
  const visibleIngredients =
    data?.ingredients.filter((row) =>
      row.name.toLocaleLowerCase("pt-BR").includes(filter),
    ) ?? [];
  const visibleProducts =
    data?.products.filter((row) =>
      row.name.toLocaleLowerCase("pt-BR").includes(filter),
    ) ?? [];
  function showHistory(target: string) {
    setHistoryTarget(target);
    setTab("history");
    setHistoryLimit(50);
  }
  return (
    <div className="stack">
      <PageHeader
        title="Estoque"
        description="Tudo no lugar para a próxima fornada."
        action={
          <div className="ops-actions">
            <Button
              variant="secondary"
              onClick={() => setAdjustTarget("")}
              disabled={!data}
            >
              <ArrowDownUp size={17} />
              Movimentar
            </Button>
            <Button
              onClick={() => setPurchaseOpen(true)}
              disabled={!data?.ingredients.length}
            >
              <ShoppingBag size={17} />
              Registrar compra
            </Button>
          </div>
        }
      />
      <OperationState loading={query.isLoading} error={query.error} retry={query.refetch}>
        {data && (
          <>
            <div className="grid-4">
              <Stat
                label="Brownies disponíveis"
                value={quantity(totalProducts)}
                hint="Produtos acabados em estoque"
                icon={<Package size={20} />}
              />
              <Stat
                label="Ingredientes cadastrados"
                value={data.ingredients.length}
                hint="Insumos da sua operação"
                icon={<Wheat size={20} />}
              />
              <Stat
                label="Valor dos insumos"
                value={money(ingredientsValue)}
                hint="Estoque pelo custo médio"
                icon={<Boxes size={20} />}
              />
              <Stat
                label="Precisam de atenção"
                value={lowIngredients.length + lowProducts.length}
                hint="Itens no mínimo ou abaixo"
                icon={<AlertTriangle size={20} />}
              />
            </div>
            {(lowIngredients.length > 0 || lowProducts.length > 0) && (
              <div className="ops-note">
                <AlertTriangle size={20} />
                <p>
                  <strong>Hora de repor.</strong>{" "}
                  {[...lowProducts, ...lowIngredients].map((row) => row.name).join(", ")}{" "}
                  {lowProducts.length + lowIngredients.length === 1 ? "está" : "estão"}{" "}
                  com estoque baixo.
                </p>
              </div>
            )}
            <Card>
              <div className="ops-tabs" aria-label="Visão do estoque">
                {(
                  [
                    ["products", "Brownies"],
                    ["ingredients", "Ingredientes"],
                    ["history", "Movimentações"],
                    ["purchases", "Compras"],
                  ] as const
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={tab === key ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setTab(key)}
                    aria-pressed={tab === key}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {(tab === "products" || tab === "ingredients") && (
                <div className="ops-header">
                  <Input
                    className="ops-filter"
                    placeholder={
                      tab === "products" ? "Buscar produto..." : "Buscar ingrediente..."
                    }
                    aria-label="Buscar no estoque"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {tab === "ingredients" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setIngredientForm("new")}
                    >
                      <Plus size={16} />
                      Novo ingrediente
                    </Button>
                  )}
                </div>
              )}
              {tab === "products" &&
                (visibleProducts.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Produto</th>
                          <th>Disponível</th>
                          <th>Custo médio / un.</th>
                          <th>Situação</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProducts.map((product) => (
                          <tr key={product.id}>
                            <td>
                              <strong>{product.name}</strong>
                              {product.is_default && (
                                <span className="ops-subtitle">Produto padrão</span>
                              )}
                            </td>
                            <td className="ops-number">
                              {quantity(Number(product.stock))} un
                            </td>
                            <td>{money(Number(product.average_cost_cents))}</td>
                            <td>
                              <Badge
                                tone={
                                  !product.active
                                    ? "neutral"
                                    : Number(product.stock) <= threshold
                                      ? "amber"
                                      : "green"
                                }
                              >
                                {!product.active
                                  ? "Inativo"
                                  : Number(product.stock) <= threshold
                                    ? "Estoque baixo"
                                    : "Disponível"}
                              </Badge>
                            </td>
                            <td>
                              <div className="ops-actions">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => showHistory(`product:${product.id}`)}
                                >
                                  Histórico
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setAdjustTarget(`product:${product.id}`)}
                                >
                                  Movimentar
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Nenhum produto encontrado"
                    description="Os produtos são gerenciados em Configurações."
                  />
                ))}
              {tab === "ingredients" &&
                (visibleIngredients.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Ingrediente</th>
                          <th>Em estoque</th>
                          <th>Mínimo</th>
                          <th>Custo médio</th>
                          <th>Valor em estoque</th>
                          <th>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleIngredients.map((ingredient) => {
                          const used =
                            data.recipe_ingredients.some(
                              (row) => row.ingredient_id === ingredient.id,
                            ) ||
                            data.stock_movements.some(
                              (row) => row.ingredient_id === ingredient.id,
                            ) ||
                            data.ingredient_purchase_items.some(
                              (row) => row.ingredient_id === ingredient.id,
                            );
                          const costScale = ingredient.unit === "un" ? 1 : 1000;
                          return (
                            <tr key={ingredient.id}>
                              <td>
                                <strong>{ingredient.name}</strong>
                              </td>
                              <td>
                                <span className="ops-stock">
                                  <span
                                    className={`ops-dot ${Number(ingredient.stock) <= Number(ingredient.minimum_stock) ? "low" : ""}`}
                                  />
                                  <span className="ops-number">
                                    {quantity(Number(ingredient.stock))} {ingredient.unit}
                                  </span>
                                </span>
                                {Number(ingredient.stock) <=
                                  Number(ingredient.minimum_stock) && (
                                  <span className="ops-subtitle">Estoque baixo</span>
                                )}
                              </td>
                              <td className="ops-number">
                                {quantity(Number(ingredient.minimum_stock))}{" "}
                                {ingredient.unit}
                              </td>
                              <td>
                                {money(Number(ingredient.average_cost_cents) * costScale)}
                                <span className="ops-subtitle">
                                  por{" "}
                                  {ingredient.unit === "g"
                                    ? "kg"
                                    : ingredient.unit === "ml"
                                      ? "litro"
                                      : "unidade"}
                                </span>
                              </td>
                              <td>
                                {money(
                                  Number(ingredient.stock) *
                                    Number(ingredient.average_cost_cents),
                                )}
                              </td>
                              <td>
                                <div className="ops-actions">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    aria-label={`Editar ${ingredient.name}`}
                                    onClick={() => setIngredientForm(ingredient)}
                                  >
                                    <Pencil size={15} />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      showHistory(`ingredient:${ingredient.id}`)
                                    }
                                  >
                                    Histórico
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      setAdjustTarget(`ingredient:${ingredient.id}`)
                                    }
                                  >
                                    Movimentar
                                  </Button>
                                  {!used && Number(ingredient.stock) === 0 && (
                                    <ConfirmButton
                                      title={`Excluir ${ingredient.name}?`}
                                      description="O ingrediente ainda não tem movimentos nem está em receitas e pode ser excluído."
                                      variant="danger"
                                      onConfirm={() =>
                                        action.remove("ingredients", ingredient.id)
                                      }
                                    >
                                      <Trash2 size={15} />
                                      Excluir
                                    </ConfirmButton>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title={
                      filter
                        ? "Nenhum ingrediente encontrado"
                        : "Comece pelos ingredientes"
                    }
                    description="Cadastre seus insumos e registre as compras para abastecer o estoque."
                    action={
                      !filter ? (
                        <Button onClick={() => setIngredientForm("new")}>
                          Cadastrar ingrediente
                        </Button>
                      ) : undefined
                    }
                  />
                ))}
              {tab === "history" && (
                <>
                  <div className="toolbar">
                    <Select
                      aria-label="Filtrar item"
                      value={historyTarget}
                      onChange={(event) => {
                        setHistoryTarget(event.target.value);
                        setHistoryLimit(50);
                      }}
                    >
                      <option value="">Todos os itens</option>
                      <optgroup label="Brownies">
                        {data.products.map((row) => (
                          <option key={row.id} value={`product:${row.id}`}>
                            {row.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Ingredientes">
                        {data.ingredients.map((row) => (
                          <option key={row.id} value={`ingredient:${row.id}`}>
                            {row.name}
                          </option>
                        ))}
                      </optgroup>
                    </Select>
                    <Select
                      aria-label="Filtrar tipo de movimento"
                      value={kind}
                      onChange={(event) => {
                        setKind(event.target.value);
                        setHistoryLimit(50);
                      }}
                    >
                      <option value="">Todos os movimentos</option>
                      {Object.entries(movementLabels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {history.length ? (
                    <>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Data</th>
                              <th>Item</th>
                              <th>Movimento</th>
                              <th>Quantidade</th>
                              <th>Custo do movimento</th>
                              <th>Justificativa</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.slice(0, historyLimit).map((row) => {
                              const ingredient = data.ingredients.find(
                                (item) => item.id === row.ingredient_id,
                              );
                              const product = data.products.find(
                                (item) => item.id === row.product_id,
                              );
                              return (
                                <tr key={row.id}>
                                  <td>{dateLabel(row.movement_date)}</td>
                                  <td>
                                    {ingredient?.name ?? product?.name ?? "Item removido"}
                                  </td>
                                  <td>{movementLabels[row.kind] ?? row.kind}</td>
                                  <td
                                    className={`ops-number ${Number(row.quantity) >= 0 ? "ops-positive" : "ops-negative"}`}
                                  >
                                    {Number(row.quantity) > 0 ? "+" : ""}
                                    {quantity(Number(row.quantity))}{" "}
                                    {ingredient?.unit ?? "un"}
                                  </td>
                                  <td>
                                    {money(
                                      Math.abs(Number(row.quantity)) *
                                        Number(row.unit_cost_cents),
                                    )}
                                  </td>
                                  <td>{row.reason || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {history.length > historyLimit && (
                        <Button
                          variant="secondary"
                          onClick={() => setHistoryLimit((current) => current + 50)}
                        >
                          Mostrar mais movimentos ({history.length - historyLimit})
                        </Button>
                      )}
                    </>
                  ) : (
                    <Empty
                      title="Nenhum movimento neste filtro"
                      description="Compras, produções e vendas aparecerão aqui automaticamente."
                    />
                  )}
                </>
              )}
              {tab === "purchases" &&
                (data.ingredient_purchases.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Fornecedor</th>
                          <th>Itens comprados</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.ingredient_purchases]
                          .sort(
                            (a, b) =>
                              b.purchase_date.localeCompare(a.purchase_date) ||
                              b.created_at.localeCompare(a.created_at),
                          )
                          .map((purchase) => (
                            <tr key={purchase.id}>
                              <td>{dateLabel(purchase.purchase_date)}</td>
                              <td>{purchase.supplier || "Não informado"}</td>
                              <td>
                                {data.ingredient_purchase_items
                                  .filter((item) => item.purchase_id === purchase.id)
                                  .map((item) => {
                                    const ingredient = data.ingredients.find(
                                      (row) => row.id === item.ingredient_id,
                                    );
                                    return (
                                      <span className="ops-subtitle" key={item.id}>
                                        {ingredient?.name ?? "Ingrediente"} ·{" "}
                                        {quantity(Number(item.quantity))}{" "}
                                        {ingredient?.unit} · {money(item.total_cents)}
                                      </span>
                                    );
                                  })}
                              </td>
                              <td className="amount">{money(purchase.total_cents)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="O estoque começa com a primeira compra"
                    description="Registre os insumos comprados. O pagamento também aparece em Despesas, sem duplicação."
                    action={
                      <Button
                        onClick={() => setPurchaseOpen(true)}
                        disabled={!data.ingredients.length}
                      >
                        Registrar compra
                      </Button>
                    }
                  />
                ))}
            </Card>
            <p className="ops-fine">
              O valor do estoque usa o custo médio ponderado. Compras geram despesas;
              produzir e vender registram consumo de estoque, sem lançar a compra
              novamente no caixa.
            </p>
          </>
        )}
      </OperationState>
      {ingredientForm && (
        <IngredientForm
          ingredient={ingredientForm === "new" ? undefined : ingredientForm}
          unitLocked={
            ingredientForm !== "new" &&
            (Number(ingredientForm.stock) !== 0 ||
              !!data?.recipe_ingredients.some(
                (row) => row.ingredient_id === ingredientForm.id,
              ) ||
              !!data?.stock_movements.some(
                (row) => row.ingredient_id === ingredientForm.id,
              ))
          }
          onClose={() => setIngredientForm(null)}
        />
      )}
      {purchaseOpen && data && (
        <PurchaseForm data={data} onClose={() => setPurchaseOpen(false)} />
      )}
      {adjustTarget !== null && data && (
        <StockAdjustmentForm
          data={data}
          initialTarget={adjustTarget}
          onClose={() => setAdjustTarget(null)}
        />
      )}
    </div>
  );
}
