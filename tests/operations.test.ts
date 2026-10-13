import { describe, expect, it } from "vitest";
import type { AppData, Ingredient, Recipe } from "../src/types";
import { recipeMetrics } from "../src/components/operations/helpers";

const base = {
  user_id: "owner",
  created_at: "2026-10-08T12:00:00Z",
  updated_at: "2026-10-08T12:00:00Z",
};
const recipe: Recipe = {
  ...base,
  id: "recipe",
  product_id: "brownie",
  name: "Tradicional",
  yield_quantity: 12,
  is_default: true,
};
function example(): AppData {
  const values: [string, Ingredient["unit"], number, number, number][] = [
    ["Farinha", "g", 1000, 299 / 1000, 150],
    ["Açúcar", "g", 2000, 499 / 2000, 90],
    ["Chocky", "g", 400, 575 / 400, 370],
    ["Ovos", "un", 20, 879 / 20, 3],
    ["Margarina", "g", 500, 577 / 500, 70],
  ];
  return {
    profiles: [],
    customers: [],
    products: [],
    sales: [],
    sale_items: [],
    payments: [],
    payment_allocations: [],
    receivable_adjustments: [],
    expenses: [],
    ingredient_purchases: [],
    ingredient_purchase_items: [],
    production_batches: [],
    stock_movements: [],
    recipes: [recipe],
    ingredients: values.map(([name, unit, stock, average_cost_cents], index) => ({
      ...base,
      id: String(index),
      name,
      unit,
      stock,
      average_cost_cents,
      minimum_stock: 0,
    })),
    recipe_ingredients: values.map(([, , , , amount], index) => ({
      ...base,
      id: `line-${index}`,
      ingredient_id: String(index),
      recipe_id: recipe.id,
      quantity: amount,
    })),
  };
}

describe("Ficha técnica e capacidade real de produção", () => {
  it("usa os preços de referência sem arredondar cada grama ou ingrediente", () => {
    const metrics = recipeMetrics(recipe, example());
    expect(metrics.cost).toBeCloseTo(811.81, 6);
    expect(metrics.unitCost).toBeCloseTo(67.6508333333, 6);
    expect(
      metrics.lines.find((line) => line.ingredient?.name === "Açúcar")?.cost,
    ).toBeCloseTo(22.455, 6);
  });

  it("limita a capacidade pelo insumo que termina primeiro e só conta formas inteiras", () => {
    const data = example();
    expect(recipeMetrics(recipe, data).possible).toBe(1);
    data.ingredients[2].stock = 740;
    expect(recipeMetrics(recipe, data).possible).toBe(2);
    data.ingredients[0].stock = 299.99;
    expect(recipeMetrics(recipe, data).possible).toBe(1);
  });

  it("recalcula custos e rendimento com os valores atuais e não com preços fixos", () => {
    const data = example();
    data.ingredients[2].average_cost_cents = 2;
    const metrics = recipeMetrics({ ...recipe, yield_quantity: 10 }, data);
    expect(metrics.cost).toBeCloseTo(1019.935, 6);
    expect(metrics.unitCost).toBeCloseTo(101.9935, 6);
  });

  it("não oferece produção quando falta um ingrediente ou a ficha está vazia", () => {
    const data = example();
    data.ingredients[3].stock = 0;
    expect(recipeMetrics(recipe, data).possible).toBe(0);
    data.ingredients = data.ingredients.filter((row) => row.id !== "3");
    expect(recipeMetrics(recipe, data).possible).toBe(0);
    data.recipe_ingredients = [];
    expect(recipeMetrics(recipe, data).possible).toBe(0);
    expect(recipeMetrics(recipe, data).cost).toBe(0);
  });
});
