export interface BaseRow {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}
export type Method = "pix" | "cash" | "card" | "transfer" | "other";
export interface Profile extends BaseRow {
  username: string;
  display_name: string;
  business_name: string;
  due_days: number;
  whatsapp_template: string;
  low_stock_threshold: number;
  theme: "light" | "dark" | "system";
}
export interface Customer extends BaseRow {
  name: string;
  phone: string;
  notes: string;
  archived: boolean;
}
export interface Product extends BaseRow {
  name: string;
  cash_price_cents: number;
  credit_price_cents: number;
  stock: number;
  average_cost_cents: number;
  active: boolean;
  is_default: boolean;
}
export interface Sale extends BaseRow {
  customer_id: string | null;
  sale_date: string;
  due_date: string | null;
  modality: "cash" | "credit";
  gross_cents: number;
  discount_cents: number;
  total_cents: number;
  notes: string;
  cancelled_at: string | null;
  request_id: string;
}
export interface SaleItem extends BaseRow {
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
}
export interface Payment extends BaseRow {
  customer_id: string | null;
  payment_date: string;
  amount_cents: number;
  method: Method;
  notes: string;
  voided_at: string | null;
  void_reason: string | null;
  request_id: string;
}
export interface PaymentAllocation extends BaseRow {
  payment_id: string;
  sale_id: string;
  amount_cents: number;
}
export interface ReceivableAdjustment extends BaseRow {
  sale_id: string;
  amount_cents: number;
  reason: string;
  adjustment_date: string;
}
export type ExpenseCategory =
  | "Ingredientes"
  | "Embalagens"
  | "Gás"
  | "Energia elétrica"
  | "Transporte"
  | "Equipamentos"
  | "Manutenção"
  | "Outros";
export interface Expense extends BaseRow {
  description: string;
  category: ExpenseCategory;
  amount_cents: number;
  expense_date: string;
  method: Method;
  supplier: string;
  notes: string;
  purchase_id: string | null;
}
export interface Ingredient extends BaseRow {
  name: string;
  unit: "g" | "ml" | "un";
  stock: number;
  average_cost_cents: number;
  minimum_stock: number;
}
export interface IngredientPurchase extends BaseRow {
  purchase_date: string;
  supplier: string;
  total_cents: number;
  request_id: string;
}
export interface IngredientPurchaseItem extends BaseRow {
  purchase_id: string;
  ingredient_id: string;
  quantity: number;
  total_cents: number;
}
export interface Recipe extends BaseRow {
  product_id: string;
  name: string;
  yield_quantity: number;
  is_default: boolean;
}
export interface RecipeIngredient extends BaseRow {
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
}
export interface ProductionBatch extends BaseRow {
  recipe_id: string;
  production_date: string;
  batches: number;
  expected_quantity: number;
  actual_quantity: number;
  total_cost_cents: number;
  notes: string;
  request_id: string;
}
export interface StockMovement extends BaseRow {
  product_id: string | null;
  ingredient_id: string | null;
  quantity: number;
  unit_cost_cents: number;
  kind:
    | "purchase"
    | "production"
    | "sale"
    | "loss"
    | "gift"
    | "personal"
    | "adjustment"
    | "cancellation";
  reference_id: string | null;
  reason: string;
  movement_date: string;
}
export interface AppData {
  profiles: Profile[];
  customers: Customer[];
  products: Product[];
  sales: Sale[];
  sale_items: SaleItem[];
  payments: Payment[];
  payment_allocations: PaymentAllocation[];
  receivable_adjustments: ReceivableAdjustment[];
  expenses: Expense[];
  ingredients: Ingredient[];
  ingredient_purchases: IngredientPurchase[];
  ingredient_purchase_items: IngredientPurchaseItem[];
  recipes: Recipe[];
  recipe_ingredients: RecipeIngredient[];
  production_batches: ProductionBatch[];
  stock_movements: StockMovement[];
}
export type TableName = keyof AppData;
