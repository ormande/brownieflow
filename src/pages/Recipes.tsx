import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChefHat, Pencil, Plus, Trash2, Wheat } from "lucide-react";
import type { AppData, Recipe } from "../types";
import { useAction, useAppData } from "../lib/data";
import { money, quantity } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  CustomSelect,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
} from "../components/ui";
import {
  FormError,
  OperationState,
  recipeMetrics,
} from "../components/operations/helpers";

const recipeSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome para a receita."),
  product_id: z.string().min(1, "Escolha o produto."),
  yield_quantity: z
    .number()
    .int("Use um número inteiro.")
    .min(1, "O rendimento mínimo é 1."),
  is_default: z.boolean(),
  items: z
    .array(
      z.object({
        ingredient_id: z.string().min(1, "Escolha um ingrediente."),
        quantity: z.number().positive("Informe uma quantidade maior que zero.").finite(),
      }),
    )
    .min(1, "Inclua pelo menos um ingrediente.")
    .refine(
      (items) => new Set(items.map((item) => item.ingredient_id)).size === items.length,
      "Use apenas uma linha para cada ingrediente.",
    ),
});
type RecipeValues = z.infer<typeof recipeSchema>;

function RecipeForm({
  recipe,
  data,
  onClose,
}: {
  recipe?: Recipe;
  data: AppData;
  onClose: () => void;
}) {
  const action = useAction();
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RecipeValues>({
    resolver: zodResolver(recipeSchema),
    defaultValues: {
      name: recipe?.name ?? "",
      product_id:
        recipe?.product_id ??
        data.products.find((row) => row.is_default)?.id ??
        data.products[0]?.id ??
        "",
      yield_quantity: recipe?.yield_quantity ?? 12,
      is_default: recipe?.is_default ?? false,
      items: recipe
        ? data.recipe_ingredients
            .filter((row) => row.recipe_id === recipe.id)
            .map((row) => ({
              ingredient_id: row.ingredient_id,
              quantity: Number(row.quantity),
            }))
        : [{ ingredient_id: "", quantity: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const yieldQuantity = watch("yield_quantity");
  const cost = items.reduce(
    (sum, item) =>
      sum +
      (Number(item.quantity) || 0) *
        Number(
          data.ingredients.find((row) => row.id === item.ingredient_id)
            ?.average_cost_cents ?? 0,
        ),
    0,
  );
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
      title={recipe ? "Editar ficha técnica" : "Nova ficha técnica"}
      description="Defina ingredientes e rendimento de uma forma. Os custos acompanham o custo médio dos insumos."
    >
      <form
        className="stack"
        onSubmit={handleSubmit(async (values) => {
          try {
            await action.run("save_recipe", {
              ...(recipe ? { id: recipe.id } : {}),
              ...values,
            });
            onClose();
          } catch {
            /* action reports validation failures */
          }
        })}
      >
        <Field label="Nome da receita" error={errors.name?.message}>
          <Input {...register("name")} autoFocus placeholder="Ex.: Brownie tradicional" />
        </Field>
        <div className="form-grid">
          <Field label="Produto produzido" error={errors.product_id?.message}>
            <CustomSelect
              value={watch("product_id")}
              onChange={(value) =>
                setValue("product_id", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              placeholder="Selecione..."
              options={data.products.map((product) => ({
                value: product.id,
                label: product.name,
              }))}
            />
          </Field>
          <Field label="Brownies por forma" error={errors.yield_quantity?.message}>
            <Input
              type="number"
              min="1"
              step="1"
              {...register("yield_quantity", { valueAsNumber: true })}
            />
          </Field>
        </div>
        <div className="ops-form-list">
          {fields.map((field, index) => {
            const ingredient = data.ingredients.find(
              (row) => row.id === items[index]?.ingredient_id,
            );
            return (
              <div key={field.id} className="ops-form-row ops-recipe-row">
                <Field
                  label="Ingrediente"
                  error={errors.items?.[index]?.ingredient_id?.message}
                >
                  <CustomSelect
                    value={items[index]?.ingredient_id ?? ""}
                    onChange={(value) =>
                      setValue(`items.${index}.ingredient_id`, value, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    placeholder="Selecione..."
                    options={data.ingredients.map((row) => ({
                      value: row.id,
                      label: row.name,
                    }))}
                  />
                </Field>
                <Field
                  label={`Quantidade (${ingredient?.unit ?? "base"})`}
                  error={errors.items?.[index]?.quantity?.message}
                >
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remover ingrediente ${index + 1}`}
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                >
                  <Trash2 size={17} />
                </Button>
              </div>
            );
          })}
        </div>
        <FormError message={errors.items?.root?.message ?? errors.items?.message} />
        <Button
          type="button"
          variant="secondary"
          onClick={() => append({ ingredient_id: "", quantity: 0 })}
        >
          <Plus size={16} />
          Adicionar ingrediente
        </Button>
        <label className="ops-stock">
          <input type="checkbox" {...register("is_default")} /> Usar como receita padrão
        </label>
        <div className="ops-form-summary">
          <div>
            <span className="muted">Custo da forma</span>
            <strong style={{ display: "block" }}>{money(cost)}</strong>
          </div>
          <div>
            <span className="muted">Custo por brownie</span>
            <strong style={{ display: "block" }}>
              {money(yieldQuantity > 0 ? cost / yieldQuantity : 0)}
            </strong>
          </div>
        </div>
        <p className="ops-fine ops-hint">
          Alterações valem para novas produções. O custo dos lotes já registrados
          permanece preservado.
        </p>
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={action.pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending}>
            {action.pending ? "Salvando..." : "Salvar ficha técnica"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Recipes() {
  const query = useAppData();
  const data = query.data;
  const action = useAction();
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const defaultRecipe = data?.recipes.find((row) => row.is_default) ?? data?.recipes[0];
  const defaultMetrics =
    data && defaultRecipe ? recipeMetrics(defaultRecipe, data) : null;
  return (
    <div className="stack">
      <PageHeader
        title="Receitas e custos"
        description="Cada ingrediente conta. Conheça o custo da sua produção."
        action={
          <Button
            onClick={() => setEditing("new")}
            disabled={!data?.products.length || !data?.ingredients.length}
          >
            <Plus size={18} />
            Nova receita
          </Button>
        }
      />
      <OperationState loading={query.isLoading} error={query.error} retry={query.refetch}>
        {data && (
          <>
            <div className="grid-3">
              <Stat
                label="Fichas técnicas"
                value={data.recipes.length}
                hint="Receitas da operação"
                icon={<ChefHat size={20} />}
              />
              <Stat
                label="Custo por brownie"
                value={defaultMetrics ? money(defaultMetrics.unitCost) : "—"}
                hint={
                  defaultRecipe
                    ? `Receita padrão · ${defaultRecipe.name}`
                    : "Cadastre uma receita"
                }
                icon={<Wheat size={20} />}
              />
              <Stat
                label="Rendimento padrão"
                value={defaultRecipe ? `${defaultRecipe.yield_quantity} un` : "—"}
                hint="Por receita / forma"
                icon={<ChefHat size={20} />}
              />
            </div>
            {!data.recipes.length ? (
              <Card>
                <Empty
                  title="Sua primeira ficha técnica"
                  description="Cadastre os ingredientes em Estoque e crie uma receita para calcular custos e registrar produções."
                  action={
                    <Button
                      onClick={() => setEditing("new")}
                      disabled={!data.products.length || !data.ingredients.length}
                    >
                      Criar receita
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="ops-recipe-grid">
                {[...data.recipes]
                  .sort(
                    (a, b) =>
                      Number(b.is_default) - Number(a.is_default) ||
                      a.name.localeCompare(b.name),
                  )
                  .map((recipe) => {
                    const { lines, cost, unitCost, possible } = recipeMetrics(
                      recipe,
                      data,
                    );
                    const product = data.products.find(
                      (row) => row.id === recipe.product_id,
                    );
                    const hasProduction = data.production_batches.some(
                      (row) => row.recipe_id === recipe.id,
                    );
                    return (
                      <Card key={recipe.id}>
                        <div className="ops-header">
                          <div>
                            <div className="ops-stock">
                              <ChefHat size={20} />
                              <h2 className="section-title">{recipe.name}</h2>
                            </div>
                            <p className="muted">
                              {quantity(recipe.yield_quantity)} brownies por forma
                            </p>
                          </div>
                          {recipe.is_default && <Badge tone="green">Padrão</Badge>}
                        </div>
                        <div className="ops-recipe-cost">
                          <strong>{money(cost)}</strong>
                          <span className="muted">por forma</span>
                        </div>
                        <div>
                          {lines.map((line) => (
                            <div className="ops-recipe-line" key={line.id}>
                              <span>
                                {line.ingredient?.name ?? "Ingrediente indisponível"}
                              </span>
                              <span className="muted ops-number">
                                {quantity(Number(line.quantity))} {line.ingredient?.unit}
                              </span>
                              <strong className="ops-number">{money(line.cost)}</strong>
                            </div>
                          ))}
                        </div>
                        <div className="ops-recipe-footer">
                          <div>
                            <span className="muted">Custo por brownie</span>
                            <strong>{money(unitCost)}</strong>
                          </div>
                          <div>
                            <span className="muted">Capacidade atual</span>
                            <strong>
                              {possible} {possible === 1 ? "forma" : "formas"}
                            </strong>
                          </div>
                          <div>
                            <span className="muted">Margem à vista / un.</span>
                            <strong>
                              {product ? money(product.cash_price_cents - unitCost) : "—"}
                            </strong>
                          </div>
                          <div>
                            <span className="muted">Margem fiado / un.</span>
                            <strong>
                              {product
                                ? money(product.credit_price_cents - unitCost)
                                : "—"}
                            </strong>
                          </div>
                        </div>
                        <div className="ops-actions" style={{ marginTop: 22 }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(recipe)}
                          >
                            <Pencil size={15} />
                            Editar ficha
                          </Button>
                          {!hasProduction && (
                            <ConfirmButton
                              title={`Excluir a receita ${recipe.name}?`}
                              description="A receita não tem lotes registrados. Os ingredientes serão preservados."
                              variant="danger"
                              onConfirm={() => action.remove("recipes", recipe.id)}
                            >
                              <Trash2 size={15} />
                              Excluir
                            </ConfirmButton>
                          )}
                        </div>
                      </Card>
                    );
                  })}
              </div>
            )}
            <div className="ops-note">
              <Wheat size={20} />
              <p>
                Os custos são calculados pelos preços médios atuais dos ingredientes. A
                margem exibida considera apenas ingredientes, antes de embalagens, taxas e
                outras despesas. Preços de referência são usados até a primeira compra.
              </p>
            </div>
          </>
        )}
      </OperationState>
      {editing && data && (
        <RecipeForm
          recipe={editing === "new" ? undefined : editing}
          data={data}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
