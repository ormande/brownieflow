import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, CheckCircle2, ChefHat, Flame, Package, Plus } from "lucide-react";
import type { AppData } from "../types";
import { useAction, useAppData } from "../lib/data";
import { dateLabel, money, quantity, today } from "../lib/format";
import {
  Badge,
  Button,
  Card,
  CustomSelect,
  DatePicker,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Stat,
  Textarea,
} from "../components/ui";
import {
  OperationState,
  recipeMetrics,
  useRequestToken,
} from "../components/operations/helpers";

const productionSchema = z.object({
  recipe_id: z.string().min(1, "Escolha uma receita."),
  production_date: z.string().min(1, "Informe a data."),
  batches: z.number().positive("Informe uma quantidade maior que zero.").finite(),
  actual_quantity: z
    .number()
    .int("Informe um número inteiro.")
    .min(1, "Informe pelo menos 1 brownie."),
  notes: z.string(),
});
type ProductionValues = z.infer<typeof productionSchema>;

function ProductionForm({ data, onClose }: { data: AppData; onClose: () => void }) {
  const action = useAction();
  const token = useRequestToken();
  const defaultRecipe = data.recipes.find((row) => row.is_default) ?? data.recipes[0];
  const {
    register,
    watch,
    setValue,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProductionValues>({
    resolver: zodResolver(productionSchema),
    defaultValues: {
      recipe_id: defaultRecipe?.id ?? "",
      production_date: today(),
      batches: 1,
      actual_quantity: defaultRecipe?.yield_quantity ?? 12,
      notes: "",
    },
  });
  const recipeId = watch("recipe_id");
  const batches = watch("batches");
  const actual = watch("actual_quantity");
  const recipe = data.recipes.find((row) => row.id === recipeId);
  const metrics = recipe ? recipeMetrics(recipe, data) : null;
  const validBatches = Number.isFinite(batches) && batches > 0 ? batches : 0;
  const expected = Math.round((recipe?.yield_quantity ?? 0) * validBatches);
  const totalCost = Math.round((metrics?.cost ?? 0) * validBatches);
  const shortage =
    metrics?.lines.some(
      (line) =>
        Number(line.ingredient?.stock ?? 0) + 0.0000001 <
        Number(line.quantity) * validBatches,
    ) ?? true;
  useEffect(() => {
    setValue("actual_quantity", expected, { shouldValidate: false });
  }, [expected, setValue]);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
      title="Registrar produção"
      description="O lote consome ingredientes e adiciona os brownies prontos ao estoque em uma única operação."
    >
      <form
        className="stack"
        onSubmit={handleSubmit(async (values) => {
          if (shortage || !metrics?.lines.length) {
            setError("batches", {
              message: "Não há ingredientes suficientes para essa produção.",
            });
            return;
          }
          if (expected < 1) {
            setError("batches", {
              message: "A quantidade de formas deve render pelo menos 1 brownie.",
            });
            return;
          }
          try {
            await action.run("record_production", {
              request_id: token.current(),
              ...values,
            });
            token.renew();
            onClose();
          } catch {
            /* safe retry retains request id */
          }
        })}
      >
        <Field label="Ficha técnica" error={errors.recipe_id?.message}>
          <CustomSelect
            value={recipeId}
            onChange={(value) =>
              setValue("recipe_id", value, { shouldDirty: true, shouldValidate: true })
            }
            placeholder="Selecione..."
            options={data.recipes.map((row) => ({
              value: row.id,
              label: `${row.name} · ${row.yield_quantity} un/forma`,
            }))}
          />
        </Field>
        <div className="form-grid">
          <Field label="Data da produção" error={errors.production_date?.message}>
            <DatePicker
              value={watch("production_date")}
              onChange={(value) =>
                setValue("production_date", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </Field>
          <Field label="Quantidade de formas" error={errors.batches?.message}>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              {...register("batches", { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field
          label="Brownies produzidos de fato"
          hint={`Rendimento previsto: ${quantity(expected)} brownies. Ajuste se o rendimento real for diferente.`}
          error={errors.actual_quantity?.message}
        >
          <Input
            type="number"
            min="1"
            step="1"
            {...register("actual_quantity", { valueAsNumber: true })}
          />
        </Field>
        {metrics && (
          <div>
            <h3 className="section-title">Consumo de ingredientes</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ingrediente</th>
                    <th>Necessário</th>
                    <th>Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.lines.map((line) => {
                    const required = Number(line.quantity) * validBatches;
                    const stock = Number(line.ingredient?.stock ?? 0);
                    return (
                      <tr key={line.id}>
                        <td>{line.ingredient?.name}</td>
                        <td className="ops-number">
                          {quantity(required)} {line.ingredient?.unit}
                        </td>
                        <td
                          className={`ops-number ${stock < required ? "ops-negative" : ""}`}
                        >
                          {quantity(stock)} {line.ingredient?.unit}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {shortage ? (
          <div className="ops-note ops-danger">
            <AlertTriangle size={19} />
            <p>
              Faltam ingredientes para essa quantidade. Registre as compras em Estoque ou
              reduza as formas antes de confirmar.
            </p>
          </div>
        ) : (
          <div className="ops-note ops-good">
            <CheckCircle2 size={19} />
            <p>
              Ingredientes suficientes. A disponibilidade será conferida novamente ao
              salvar.
            </p>
          </div>
        )}
        <div className="ops-form-summary">
          <div>
            <span className="muted">Custo estimado do lote</span>
            <strong style={{ display: "block" }}>{money(totalCost)}</strong>
          </div>
          <div>
            <span className="muted">Custo por unidade real</span>
            <strong style={{ display: "block" }}>
              {money(actual > 0 ? totalCost / actual : 0)}
            </strong>
          </div>
        </div>
        <Field label="Observações (opcional)">
          <Textarea
            {...register("notes")}
            rows={2}
            placeholder="Rendimento, ajustes de forno, observações do lote..."
          />
        </Field>
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={action.pending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={action.pending || shortage || !metrics?.lines.length}
          >
            {action.pending ? "Registrando..." : "Confirmar produção"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Production() {
  const query = useAppData();
  const data = query.data;
  const [open, setOpen] = useState(false);
  const [recipeFilter, setRecipeFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(50);
  const todayBatches =
    data?.production_batches.filter((row) => row.production_date === today()) ?? [];
  const producedToday = todayBatches.reduce((sum, row) => sum + row.actual_quantity, 0);
  const stock = data?.products.reduce((sum, row) => sum + Number(row.stock), 0) ?? 0;
  const batches = (data?.production_batches ?? [])
    .filter(
      (row) =>
        (!recipeFilter || row.recipe_id === recipeFilter) &&
        (!from || row.production_date >= from) &&
        (!to || row.production_date <= to),
    )
    .sort(
      (a, b) =>
        b.production_date.localeCompare(a.production_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  const periodProduced = batches.reduce((sum, row) => sum + row.actual_quantity, 0);
  const periodCost = batches.reduce((sum, row) => sum + Number(row.total_cost_cents), 0);
  return (
    <div className="stack">
      <PageHeader
        title="Produção"
        description="Da receita à fornada, com custos e estoque sempre em dia."
        action={
          <Button onClick={() => setOpen(true)} disabled={!data?.recipes.length}>
            <Plus size={18} />
            Registrar produção
          </Button>
        }
      />
      <OperationState loading={query.isLoading} error={query.error} retry={query.refetch}>
        {data && (
          <>
            <div className="grid-4">
              <Stat
                label="Produzidos hoje"
                value={quantity(producedToday)}
                hint={`${quantity(todayBatches.reduce((sum, row) => sum + Number(row.batches), 0))} formas registradas`}
                icon={<Flame size={20} />}
              />
              <Stat
                label="Prontos para vender"
                value={quantity(stock)}
                hint="Brownies disponíveis agora"
                icon={<Package size={20} />}
              />
              <Stat
                label="Produção no filtro"
                value={quantity(periodProduced)}
                hint={`${batches.length} lotes registrados`}
                icon={<ChefHat size={20} />}
              />
              <Stat
                label="Custo no filtro"
                value={money(periodCost)}
                hint="Custo histórico dos ingredientes"
                icon={<WheatIcon />}
              />
            </div>
            <Card>
              <div className="ops-header">
                <div>
                  <h2 className="section-title">O que dá para produzir agora?</h2>
                  <p className="muted">
                    Capacidade por receita usando o estoque disponível.
                  </p>
                </div>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/estoque">Ver estoque</Link>
                </Button>
              </div>
              {data.recipes.length ? (
                <div className="ops-capacity">
                  {data.recipes.map((recipe) => {
                    const metrics = recipeMetrics(recipe, data);
                    return (
                      <div className="ops-capacity-item" key={recipe.id}>
                        <span className="muted">{recipe.name}</span>
                        <strong>
                          {quantity(metrics.possible)}{" "}
                          <span style={{ fontSize: 14, fontWeight: 500 }}>formas</span>
                        </strong>
                        <span className="ops-fine">
                          Até {quantity(metrics.possible * recipe.yield_quantity)}{" "}
                          brownies
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty
                  title="Cadastre a primeira receita"
                  description="A ficha técnica permite calcular o consumo e a capacidade de produção."
                  action={
                    <Button asChild variant="secondary">
                      <Link to="/receitas">Ir para receitas</Link>
                    </Button>
                  }
                />
              )}
              <p className="ops-fine" style={{ marginBottom: 0 }}>
                Cada capacidade é calculada separadamente. Receitas que compartilham
                insumos disputam o mesmo estoque.
              </p>
            </Card>
            <Card>
              <div className="ops-header">
                <div>
                  <h2 className="section-title">Histórico de fornadas</h2>
                  <p className="muted">
                    Rendimento real e custo preservado de cada lote.
                  </p>
                </div>
              </div>
              <div className="toolbar">
                <Field label="Receita">
                  <CustomSelect
                    value={recipeFilter}
                    onChange={(value) => {
                      setRecipeFilter(value);
                      setLimit(50);
                    }}
                    options={[
                      { value: "", label: "Todas as receitas" },
                      ...data.recipes.map((row) => ({ value: row.id, label: row.name })),
                    ]}
                  />
                </Field>
                <Field label="De">
                  <DatePicker value={from} max={to || undefined} onChange={setFrom} />
                </Field>
                <Field label="Até">
                  <DatePicker min={from} value={to} onChange={setTo} />
                </Field>
                {(from || to || recipeFilter) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                      setRecipeFilter("");
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
              {batches.length ? (
                <>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Data / receita</th>
                          <th>Formas</th>
                          <th>Previsto</th>
                          <th>Produzido</th>
                          <th>Custo do lote</th>
                          <th>Custo / un.</th>
                          <th>Observações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.slice(0, limit).map((batch) => (
                          <tr key={batch.id}>
                            <td>
                              <strong>{dateLabel(batch.production_date)}</strong>
                              <span className="ops-subtitle">
                                {data.recipes.find((row) => row.id === batch.recipe_id)
                                  ?.name ?? "Receita"}
                              </span>
                            </td>
                            <td>{quantity(Number(batch.batches))}</td>
                            <td>{batch.expected_quantity} un</td>
                            <td>
                              <Badge
                                tone={
                                  batch.actual_quantity < batch.expected_quantity
                                    ? "amber"
                                    : "green"
                                }
                              >
                                {batch.actual_quantity} un
                              </Badge>
                            </td>
                            <td className="amount">{money(batch.total_cost_cents)}</td>
                            <td>
                              {money(batch.total_cost_cents / batch.actual_quantity)}
                            </td>
                            <td>{batch.notes || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {batches.length > limit && (
                    <Button
                      variant="secondary"
                      onClick={() => setLimit((current) => current + 50)}
                    >
                      Mostrar mais lotes
                    </Button>
                  )}
                </>
              ) : (
                <Empty
                  title="Nenhuma fornada neste período"
                  description="Registre uma produção para consumir os insumos e abastecer o estoque de brownies."
                  action={
                    <Button onClick={() => setOpen(true)} disabled={!data.recipes.length}>
                      Registrar produção
                    </Button>
                  }
                />
              )}
            </Card>
          </>
        )}
      </OperationState>
      {open && data && <ProductionForm data={data} onClose={() => setOpen(false)} />}
    </div>
  );
}

function WheatIcon() {
  return <ChefHat size={20} />;
}
