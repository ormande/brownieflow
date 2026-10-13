import { useRef, type ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import type { AppData, Recipe } from "../../types";
import { Button, Card } from "../ui";
import "./operations.css";

export function useRequestToken() {
  const token = useRef(crypto.randomUUID());
  return {
    current: () => token.current,
    renew: () => {
      token.current = crypto.randomUUID();
    },
  };
}

export function OperationState({
  loading,
  error,
  retry,
  children,
}: {
  loading: boolean;
  error: unknown;
  retry: () => unknown;
  children: ReactNode;
}) {
  if (loading)
    return (
      <Card className="ops-state" aria-live="polite">
        <Loader2 className="ops-spin" />
        <h2>Carregando sua operação</h2>
        <p className="muted">Buscando os registros salvos com segurança.</p>
      </Card>
    );
  if (error)
    return (
      <Card className="ops-state" role="alert">
        <AlertCircle />
        <h2>Não foi possível carregar os dados</h2>
        <p className="muted">Verifique sua conexão e tente novamente.</p>
        <Button variant="secondary" onClick={() => void retry()}>
          Tentar novamente
        </Button>
      </Card>
    );
  return <>{children}</>;
}

export function recipeLines(recipeId: string, data: AppData) {
  return data.recipe_ingredients
    .filter((item) => item.recipe_id === recipeId)
    .map((item) => {
      const ingredient = data.ingredients.find((row) => row.id === item.ingredient_id);
      return {
        ...item,
        ingredient,
        cost: Number(item.quantity) * Number(ingredient?.average_cost_cents ?? 0),
      };
    });
}

export function recipeMetrics(recipe: Recipe, data: AppData) {
  const lines = recipeLines(recipe.id, data);
  const cost = lines.reduce((sum, line) => sum + line.cost, 0);
  const possible =
    lines.length && lines.every((line) => line.ingredient && Number(line.quantity) > 0)
      ? Math.max(
          0,
          Math.floor(
            Math.min(
              ...lines.map(
                (line) => Number(line.ingredient!.stock) / Number(line.quantity),
              ),
            ),
          ),
        )
      : 0;
  return { lines, cost, unitCost: cost / recipe.yield_quantity, possible };
}

export const movementLabels: Record<string, string> = {
  purchase: "Compra de insumos",
  production: "Produção",
  sale: "Venda",
  loss: "Perda",
  gift: "Cortesia",
  personal: "Consumo próprio",
  adjustment: "Ajuste de estoque",
  cancellation: "Cancelamento de venda",
};
export const paymentMethods = [
  ["pix", "Pix"],
  ["cash", "Dinheiro"],
  ["card", "Cartão"],
  ["transfer", "Transferência"],
  ["other", "Outro"],
] as const;

export function FormError({ message }: { message?: string }) {
  return message ? (
    <p className="ops-error" role="alert">
      {message}
    </p>
  ) : null;
}
