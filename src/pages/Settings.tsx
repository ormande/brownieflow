import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Building2,
  KeyRound,
  Palette,
  Package,
  Plus,
  Save,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAction, useAppData, readableError } from "../lib/data";
import { useTheme } from "../lib/theme";
import { supabase } from "../lib/supabase";
import { money, toCents } from "../lib/format";
import {
  Button,
  Card,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
  Badge,
} from "../components/ui";
import type { Product, Profile } from "../types";
const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Informe seu nome."),
  business_name: z.string().trim().min(2, "Informe o nome do negócio."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, "Use 3 a 30 letras, números ou _."),
  due_days: z.number().int().min(0).max(365),
  low_stock_threshold: z.number().int().min(0),
  whatsapp_template: z.string().trim().min(5, "Informe o texto de cobrança."),
  theme: z.enum(["system", "light", "dark"]),
});
type ProfileValues = z.infer<typeof profileSchema>;
function ProfileForm({ profile }: { profile: Profile }) {
  const action = useAction();
  const { theme, setTheme } = useTheme();
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: profile.display_name,
      business_name: profile.business_name,
      username: profile.username,
      due_days: profile.due_days,
      low_stock_threshold: profile.low_stock_threshold,
      whatsapp_template: profile.whatsapp_template,
      theme,
    },
  });
  return (
    <form
      className="stack"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await action.run("update_profile", values);
          setTheme(values.theme);
          if (values.username !== profile.username)
            toast.info("Nome de usuário alterado. Use o novo nome no próximo acesso.");
        } catch {
          /* toast central */
        }
      })}
    >
      <Card>
        <div className="settings-card-heading">
          <Building2 size={21} />
          <div>
            <h2>Seu negócio</h2>
            <p className="muted">Um espaço com a sua identidade.</p>
          </div>
        </div>
        <div className="form-grid">
          <Field
            label="Nome do negócio"
            error={form.formState.errors.business_name?.message}
          >
            <Input {...form.register("business_name")} />
          </Field>
          <Field label="Seu nome" error={form.formState.errors.display_name?.message}>
            <Input {...form.register("display_name")} />
          </Field>
          <Field
            label="Nome de usuário"
            hint="Letras minúsculas, números e _. É o nome usado para entrar."
            error={form.formState.errors.username?.message}
          >
            <Input autoComplete="username" {...form.register("username")} />
          </Field>
          <Field
            label="Vencimento padrão (dias após a venda)"
            error={form.formState.errors.due_days?.message}
          >
            <Input
              type="number"
              min="0"
              max="365"
              {...form.register("due_days", { valueAsNumber: true })}
            />
          </Field>
          <Field
            label="Alerta de estoque de brownies"
            hint="Quantidade a partir da qual avisamos que o estoque está baixo."
            error={form.formState.errors.low_stock_threshold?.message}
          >
            <Input
              type="number"
              min="0"
              {...form.register("low_stock_threshold", { valueAsNumber: true })}
            />
          </Field>
          <Field label="Tema">
            <Select {...form.register("theme")}>
              <option value="system">Acompanhar o dispositivo</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card>
        <div className="settings-card-heading">
          <Palette size={21} />
          <div>
            <h2>Do seu jeito</h2>
            <p className="muted">Personalize a mensagem de cobrança.</p>
          </div>
        </div>
        <Field
          label="Texto para o WhatsApp"
          hint="Use {nome} e {valor}. A mensagem abre para você revisar e enviar manualmente."
          error={form.formState.errors.whatsapp_template?.message}
        >
          <Textarea rows={4} {...form.register("whatsapp_template")} />
        </Field>
      </Card>
      <div className="form-actions">
        <Button type="submit" disabled={action.pending}>
          <Save size={17} />
          {action.pending ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}
const productSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome."),
  cash: z.string().refine((v) => toCents(v) > 0, "Informe um preço maior que zero."),
  credit: z.string().refine((v) => toCents(v) > 0, "Informe um preço maior que zero."),
  active: z.boolean(),
});
function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const action = useAction();
  const creationId = useRef(crypto.randomUUID());
  const form = useForm<z.infer<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? "",
      cash: ((product?.cash_price_cents ?? 500) / 100).toFixed(2).replace(".", ","),
      credit: ((product?.credit_price_cents ?? 600) / 100).toFixed(2).replace(".", ","),
      active: product?.active ?? true,
    },
  });
  return (
    <form
      className="stack"
      onSubmit={form.handleSubmit(async (values) => {
        try {
          await action.save(
            "products",
            {
              ...(!product ? { id: creationId.current } : {}),
              name: values.name,
              cash_price_cents: toCents(values.cash),
              credit_price_cents: toCents(values.credit),
              active: values.active,
            },
            product?.id,
          );
          onClose();
        } catch {
          /* central toast */
        }
      })}
    >
      <Field label="Nome do produto" error={form.formState.errors.name?.message}>
        <Input {...form.register("name")} />
      </Field>
      <div className="form-grid">
        <Field label="Preço à vista (R$)" error={form.formState.errors.cash?.message}>
          <Input inputMode="decimal" {...form.register("cash")} />
        </Field>
        <Field label="Preço fiado (R$)" error={form.formState.errors.credit?.message}>
          <Input inputMode="decimal" {...form.register("credit")} />
        </Field>
      </div>
      <label className="checkbox-label">
        <input type="checkbox" {...form.register("active")} />
        Produto ativo para vendas
      </label>
      <p className="field-hint">
        Você pode escolher o produto padrão na lista de produtos. O rendimento é editado
        na ficha técnica, em Receitas.
      </p>
      <div className="form-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={action.pending}>
          Salvar produto
        </Button>
      </div>
    </form>
  );
}
const passwordSchema = z
  .object({
    password: z.string().min(8, "Use pelo menos 8 caracteres."),
    confirmation: z.string(),
  })
  .refine((v) => v.password === v.confirmation, {
    path: ["confirmation"],
    message: "As senhas precisam ser iguais.",
  });
function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "", confirmation: "" },
  });
  return (
    <Card>
      <div className="settings-card-heading">
        <KeyRound size={21} />
        <div>
          <h2>Segurança da conta</h2>
          <p className="muted">Atualize sua senha de acesso.</p>
        </div>
      </div>
      <form
        className="stack"
        onSubmit={form.handleSubmit(async (values) => {
          setBusy(true);
          try {
            const result = await supabase!.auth.updateUser({
              password: values.password,
            });
            if (result.error) throw result.error;
            form.reset();
            toast.success("Senha alterada com sucesso.");
          } catch (error) {
            toast.error(readableError(error));
          } finally {
            setBusy(false);
          }
        })}
      >
        <div className="form-grid">
          <Field label="Nova senha" error={form.formState.errors.password?.message}>
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
          </Field>
          <Field
            label="Confirmar nova senha"
            error={form.formState.errors.confirmation?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("confirmation")}
            />
          </Field>
        </div>
        <div className="security-note">
          <ShieldCheck size={19} />
          <p>
            Seu login usa um identificador interno. Não há recuperação por e-mail; se
            perder a senha, o administrador do projeto deverá redefini-la no Supabase.
          </p>
        </div>
        <div className="form-actions">
          <Button type="submit" variant="secondary" disabled={busy}>
            {busy ? "Alterando…" : "Alterar senha"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
export default function Settings() {
  const { data } = useAppData();
  const action = useAction();
  const [product, setProduct] = useState<Product>();
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const profile = data.profiles[0];
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Os detalhes que deixam o BrownieFlow com a sua cara."
      />
      <div className="settings-layout">
        <div className="stack">
          {profile && <ProfileForm profile={profile} />}
          <PasswordForm />
        </div>
        <div className="stack">
          <Card>
            <div className="card-heading">
              <div>
                <h2>Seus produtos</h2>
                <p>Preços e disponibilidade para venda</p>
              </div>
              <Package size={21} />
            </div>
            {data.products.map((p) => (
              <div className="product-setting" key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <div className="muted">
                    {money(p.cash_price_cents)} à vista · {money(p.credit_price_cents)}{" "}
                    fiado
                  </div>
                  {p.is_default && <Badge tone="green">Padrão</Badge>}
                  {!p.active && <Badge>Inativo</Badge>}
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setProduct(p);
                      setOpen(true);
                    }}
                  >
                    Editar
                  </Button>
                  {!p.is_default && p.active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={action.pending}
                      onClick={async () => {
                        try {
                          await action.run("set_default_product", { product_id: p.id });
                        } catch {
                          /* central toast */
                        }
                      }}
                    >
                      Tornar padrão
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button
              className="w-full mt-4"
              variant="secondary"
              onClick={() => {
                setProduct(undefined);
                setOpen(true);
              }}
            >
              <Plus size={16} />
              Adicionar produto
            </Button>
            <Button asChild variant="ghost" className="w-full mt-4">
              <Link to="/receitas">Editar receitas e rendimento padrão</Link>
            </Button>
          </Card>
          <Card className="settings-help">
            <span className="eyebrow">CADA DETALHE CONTA</span>
            <h3>Seu ponto de partida.</h3>
            <p>
              Preços, receitas e custos de referência já estão cadastrados. Registre suas
              compras de ingredientes e sua primeira produção para abastecer o estoque.
            </p>
            <p>
              A preferência de tema é salva neste dispositivo. As demais configurações
              acompanham sua conta.
            </p>
          </Card>
        </div>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={product ? "Editar produto" : "Novo produto"}
      >
        {open && <ProductForm product={product} onClose={() => setOpen(false)} />}
      </Modal>
    </>
  );
}
