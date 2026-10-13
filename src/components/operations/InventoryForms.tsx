import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import type { AppData, Ingredient } from "../../types";
import { useAction } from "../../lib/data";
import { money, quantity, today, toCents } from "../../lib/format";
import { Button, Field, Input, Modal, Select, Textarea } from "../ui";
import { FormError, paymentMethods, useRequestToken } from "./helpers";

const ingredientSchema = z.object({
  name: z.string().trim().min(2, "Informe pelo menos 2 caracteres."),
  unit: z.enum(["g", "ml", "un"]),
  minimum_stock: z.number().min(0, "Use zero ou um valor maior.").finite(),
});
type IngredientFormValues = z.infer<typeof ingredientSchema>;

export function IngredientForm({
  ingredient,
  unitLocked = false,
  onClose,
}: {
  ingredient?: Ingredient;
  unitLocked?: boolean;
  onClose: () => void;
}) {
  const action = useAction();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientSchema),
    defaultValues: {
      name: ingredient?.name ?? "",
      unit: ingredient?.unit ?? "g",
      minimum_stock: Number(ingredient?.minimum_stock ?? 0),
    },
  });
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
      title={ingredient ? "Editar ingrediente" : "Novo ingrediente"}
      description="Cadastre o insumo na unidade em que ele será usado nas receitas."
    >
      <form
        className="stack"
        onSubmit={handleSubmit(async (values) => {
          try {
            await action.save("ingredients", values, ingredient?.id);
            onClose();
          } catch {
            /* useAction shows the error */
          }
        })}
      >
        <Field label="Nome do ingrediente" error={errors.name?.message}>
          <Input
            {...register("name")}
            placeholder="Ex.: Chocolate meio amargo"
            autoFocus
          />
        </Field>
        <div className="form-grid">
          <Field
            label="Unidade base"
            hint={
              unitLocked
                ? "A unidade é preservada para manter o histórico."
                : "Converta kg para g e litros para ml."
            }
            error={errors.unit?.message}
          >
            <Select {...register("unit")} disabled={unitLocked}>
              <option value="g">Gramas (g)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="un">Unidades (un)</option>
            </Select>
          </Field>
          <Field label="Estoque mínimo" error={errors.minimum_stock?.message}>
            <Input
              {...register("minimum_stock", { valueAsNumber: true })}
              type="number"
              min="0"
              step="0.001"
            />
          </Field>
        </div>
        {!ingredient && (
          <p className="ops-fine">
            O estoque começa em zero. Registre uma compra para adicionar quantidade e
            custo ao ingrediente.
          </p>
        )}
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
            {action.pending ? "Salvando..." : "Salvar ingrediente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const purchaseSchema = z.object({
  purchase_date: z.string().min(1, "Informe a data."),
  supplier: z.string(),
  method: z.enum(["pix", "cash", "card", "transfer", "other"]),
  notes: z.string(),
  items: z
    .array(
      z.object({
        ingredient_id: z.string().min(1, "Selecione um ingrediente."),
        quantity: z.number().positive("Informe uma quantidade maior que zero.").finite(),
        total: z.number().positive("Informe o valor pago.").finite(),
      }),
    )
    .min(1)
    .refine(
      (items) => new Set(items.map((item) => item.ingredient_id)).size === items.length,
      "Adicione cada ingrediente apenas uma vez.",
    ),
});
type PurchaseValues = z.infer<typeof purchaseSchema>;

export function PurchaseForm({ data, onClose }: { data: AppData; onClose: () => void }) {
  const action = useAction();
  const token = useRequestToken();
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<PurchaseValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      purchase_date: today(),
      supplier: "",
      method: "pix",
      notes: "",
      items: [{ ingredient_id: data.ingredients[0]?.id ?? "", quantity: 0, total: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = watch("items");
  const total = items.reduce((sum, item) => sum + toCents(Number(item.total) || 0), 0);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
      title="Registrar compra de insumos"
      description="A compra atualiza o estoque, o custo médio e gera uma única despesa no caixa."
    >
      <form
        className="stack"
        onSubmit={handleSubmit(async (values) => {
          try {
            await action.run("record_purchase", {
              request_id: token.current(),
              purchase_date: values.purchase_date,
              supplier: values.supplier,
              method: values.method,
              notes: values.notes,
              items: values.items.map((item) => ({
                ingredient_id: item.ingredient_id,
                quantity: item.quantity,
                total_cents: toCents(item.total),
              })),
            });
            token.renew();
            onClose();
          } catch {
            /* safe retry retains request id */
          }
        })}
      >
        <div className="form-grid">
          <Field label="Data da compra" error={errors.purchase_date?.message}>
            <Input type="date" {...register("purchase_date")} />
          </Field>
          <Field label="Pagamento">
            <Select {...register("method")}>
              {paymentMethods.map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Fornecedor (opcional)">
          <Input {...register("supplier")} placeholder="Mercado, distribuidor..." />
        </Field>
        <div className="ops-form-list">
          {fields.map((field, index) => {
            const ingredient = data.ingredients.find(
              (row) => row.id === items[index]?.ingredient_id,
            );
            return (
              <div key={field.id} className="ops-form-row">
                <Field
                  label="Ingrediente"
                  error={errors.items?.[index]?.ingredient_id?.message}
                >
                  <Select {...register(`items.${index}.ingredient_id`)}>
                    <option value="">Selecione...</option>
                    {data.ingredients.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </Select>
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
                <Field
                  label="Total pago (R$)"
                  error={errors.items?.[index]?.total?.message}
                >
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    {...register(`items.${index}.total`, { valueAsNumber: true })}
                  />
                </Field>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
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
          onClick={() => append({ ingredient_id: "", quantity: 0, total: 0 })}
        >
          <Plus size={16} />
          Adicionar ingrediente
        </Button>
        <p className="ops-fine ops-hint">
          Informe a quantidade total na unidade base: um pacote de 1 kg equivale a 1.000
          g. O valor é o total pago pelo item, não o preço por grama.
        </p>
        <Field label="Observações (opcional)">
          <Textarea {...register("notes")} rows={2} />
        </Field>
        <div className="ops-form-summary">
          <span>Total da compra</span>
          <strong>{money(total)}</strong>
        </div>
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={action.pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending || !data.ingredients.length}>
            {action.pending ? "Registrando..." : "Confirmar compra"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const adjustmentSchema = z.object({
  target: z.string().min(1, "Selecione um item."),
  kind: z.enum(["loss", "gift", "personal", "adjustment"]),
  quantity: z
    .number()
    .finite()
    .refine((value) => value !== 0, "Informe uma quantidade diferente de zero."),
  reason: z.string().trim().min(3, "Descreva o motivo do movimento."),
  movement_date: z.string().min(1, "Informe a data."),
});
type AdjustmentValues = z.infer<typeof adjustmentSchema>;

export function StockAdjustmentForm({
  data,
  initialTarget,
  onClose,
}: {
  data: AppData;
  initialTarget?: string;
  onClose: () => void;
}) {
  const action = useAction();
  const token = useRequestToken();
  const [submissionError, setSubmissionError] = useState("");
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<AdjustmentValues>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      target: initialTarget ?? "",
      kind: "loss",
      quantity: 1,
      reason: "",
      movement_date: today(),
    },
  });
  const target = watch("target");
  const kind = watch("kind");
  const amount = watch("quantity");
  const [entity, id] = target.split(":");
  const selected =
    entity === "product"
      ? data.products.find((row) => row.id === id)
      : data.ingredients.find((row) => row.id === id);
  const signedQuantity =
    kind === "adjustment" ? Number(amount) : -Math.abs(Number(amount));
  const resultingStock =
    Number(selected?.stock ?? 0) + (Number.isFinite(signedQuantity) ? signedQuantity : 0);
  const unit =
    entity === "ingredient"
      ? (data.ingredients.find((row) => row.id === id)?.unit ?? "")
      : "un";
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !action.pending) onClose();
      }}
      title="Movimentar estoque"
      description="Perdas, cortesias e consumo próprio reduzem o estoque. Todo movimento fica no histórico."
    >
      <form
        className="stack"
        onSubmit={handleSubmit(async (values) => {
          if (!selected) {
            setSubmissionError("Selecione um item válido.");
            return;
          }
          if (resultingStock < 0) {
            setSubmissionError(
              "A quantidade excede o estoque disponível. Corrija o valor antes de continuar.",
            );
            return;
          }
          if (entity === "product" && !Number.isInteger(signedQuantity)) {
            setSubmissionError("Use uma quantidade inteira para brownies.");
            return;
          }
          setSubmissionError("");
          try {
            await action.run("adjust_stock", {
              request_id: token.current(),
              product_id: entity === "product" ? id : null,
              ingredient_id: entity === "ingredient" ? id : null,
              quantity: signedQuantity,
              kind: values.kind,
              reason: values.reason,
              movement_date: values.movement_date,
            });
            token.renew();
            onClose();
          } catch {
            /* useAction shows the error */
          }
        })}
      >
        <Field label="Produto ou ingrediente" error={errors.target?.message}>
          <Select {...register("target")}>
            <option value="">Selecione...</option>
            <optgroup label="Produtos acabados">
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
        </Field>
        <Field label="Tipo de movimento">
          <Select {...register("kind")}>
            <option value="loss">Perda</option>
            <option value="gift">Cortesia</option>
            <option value="personal">Consumo próprio</option>
            <option value="adjustment">Ajuste manual</option>
          </Select>
        </Field>
        <div className="form-grid">
          <Field
            label={`Quantidade (${unit || "base"})`}
            hint={
              kind === "adjustment"
                ? "Positivo adiciona; negativo retira."
                : "Informe a quantidade a retirar."
            }
            error={errors.quantity?.message}
          >
            <Input
              type="number"
              step={entity === "product" ? "1" : "0.001"}
              {...register("quantity", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Data" error={errors.movement_date?.message}>
            <Input type="date" {...register("movement_date")} />
          </Field>
        </div>
        {selected && (
          <div className={`ops-note ${resultingStock < 0 ? "ops-danger" : ""}`}>
            <AlertTriangle size={19} />
            <p>
              Disponível:{" "}
              <strong>
                {quantity(Number(selected.stock))} {unit}
              </strong>
              . Após o movimento:{" "}
              <strong>
                {quantity(resultingStock)} {unit}
              </strong>
              .
              {kind === "adjustment" &&
                signedQuantity > 0 &&
                " Entradas manuais usam o custo médio atual; compras devem ser registradas pela ação de compra."}
            </p>
          </div>
        )}
        <Field label="Justificativa" error={errors.reason?.message}>
          <Textarea
            {...register("reason")}
            rows={3}
            placeholder="Descreva o que aconteceu..."
          />
        </Field>
        <FormError message={submissionError} />
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={action.pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={action.pending || resultingStock < 0}>
            {action.pending ? "Registrando..." : "Confirmar movimento"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
