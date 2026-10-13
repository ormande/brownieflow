import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  Layers3,
  ShieldCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  ArrowUpRight,
} from "lucide-react";
import { Navigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../lib/auth";
import { isConfigured, supabase, usernameEmail } from "../lib/supabase";
import { Button, Input, Field } from "../components/ui";
import { readableError } from "../lib/data";
import { useInstallation } from "../lib/installation";
const schema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, "Use de 3 a 30 letras minúsculas, números ou _."),
  password: z.string().min(8, "Use pelo menos 8 caracteres."),
  confirmation: z.string(),
});
type Values = z.infer<typeof schema>;
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <span className="brand-mark">
        <Layers3 size={22} strokeWidth={2.5} />
      </span>
      <span>
        Brownie<span className="brand-light">Flow</span>
        <i />
      </span>
    </div>
  );
}
export default function Auth() {
  const { user } = useAuth();
  const [signup, setSignup] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const installation = useInstallation(!user);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { username: "", password: "", confirmation: "" },
  });
  if (user) return <Navigate to="/" replace />;
  async function submit(values: Values) {
    if (!supabase) return;
    if (!installation.data?.installed) {
      toast.error("Prepare o banco de dados antes de entrar ou criar a conta.");
      return;
    }
    if (signup && (installation.data.hasOwner || !installation.data.emailReady)) {
      toast.error(
        installation.data.hasOwner
          ? "A conta do proprietário já foi criada."
          : "Desative a confirmação de e-mail no Supabase antes de criar a conta.",
      );
      return;
    }
    if (signup && values.password !== values.confirmation) {
      form.setError("confirmation", {
        message: "As senhas precisam ser iguais.",
      });
      return;
    }
    setBusy(true);
    try {
      const credentials = {
        email: usernameEmail(values.username),
        password: values.password,
      };
      const result = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: { data: { username: values.username } },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        toast.error(
          "Desative a confirmação de e-mail no Supabase para concluir o acesso. Consulte o README.",
        );
      else
        toast.success(
          signup ? "Sua conta está pronta. Bem-vindo!" : "Bom ter você por aqui.",
        );
    } catch (error) {
      const message = readableError(error);
      toast.error(
        /Invalid login credentials/i.test(message)
          ? "Usuário ou senha incorretos."
          : /Database error saving new user|registration|signup|cadastro/i.test(message)
            ? "Cadastro indisponível. O proprietário pode já ter criado a conta; confira a configuração do Supabase."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="story-main">
          <div className="eyebrow">
            <span className="status-dot" /> MAIS CONTROLE. MAIS TRANQUILIDADE.
          </div>
          <h1>
            Seu negócio,
            <br />
            no ponto <em>certo.</em>
          </h1>
          <p>
            Da primeira fornada ao último Pix.
            <br />
            Tudo o que seu negócio precisa para crescer com organização.
          </p>
          <div className="story-illustration" aria-hidden="true">
            <div className="illustration-top">
              <span className="mini-icon">
                <ChartNoAxesCombined size={21} />
              </span>
              <span>
                Uma receita de organização
                <small>Produzir. Vender. Crescer.</small>
              </span>
              <ArrowUpRight size={20} />
            </div>
            <div className="illustration-bars">
              {[28, 42, 36, 61, 50, 76, 67, 92, 82, 110, 101, 132].map((height, i) => (
                <div key={i} style={{ height }} />
              ))}
            </div>
            <div className="illustration-footer">
              <span>
                <Check size={15} /> Vendas organizadas
              </span>
              <span>
                <Check size={15} /> Caixa em dia
              </span>
            </div>
          </div>
        </div>
        <div className="story-bottom">
          <span>Feito para quem faz acontecer.</span>
          <span>BrownieFlow © {new Date().getFullYear()}</span>
        </div>
      </section>
      <section className="auth-content">
        <div className="auth-mobile-brand">
          <Brand />
        </div>
        <div className="auth-form">
          <span className="eyebrow">SEU ESPAÇO DE GESTÃO</span>
          <h2>
            {!isConfigured
              ? "Vamos preparar a casa."
              : signup
                ? "Comece uma nova receita."
                : "Bom ter você de volta."}
          </h2>
          <p className="auth-description">
            {!isConfigured
              ? "O BrownieFlow está instalado. Conecte seu banco de dados para começar a operar."
              : signup
                ? "Crie a conta do proprietário para começar."
                : "Entre na sua conta e acompanhe seu negócio."}
          </p>
          {!isConfigured ? (
            <div className="setup-steps">
              <div>
                <span>01</span>
                <section>
                  <h3>Crie seu projeto Supabase</h3>
                  <p>Use um projeto dedicado ao BrownieFlow.</p>
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir Supabase <ArrowUpRight size={14} />
                  </a>
                </section>
              </div>
              <div>
                <span>02</span>
                <section>
                  <h3>Prepare o banco</h3>
                  <p>
                    Execute a migração SQL e desative a confirmação de e-mail. O passo a
                    passo está no README.
                  </p>
                </section>
              </div>
              <div>
                <span>03</span>
                <section>
                  <h3>Conecte e comece</h3>
                  <p>
                    Copie <code>.env.example</code> para <code>.env</code>, preencha a URL
                    e a chave pública e reinicie o servidor.
                  </p>
                </section>
              </div>
              <div className="setup-note">
                <ShieldCheck size={19} />
                <span>Nenhuma venda de exemplo. Seus dados começam com você.</span>
              </div>
            </div>
          ) : installation.isPending ? (
            <div className="setup-note" role="status">
              <LoaderCircle size={18} className="spin" />
              Verificando sua conexão…
            </div>
          ) : installation.isError || !installation.data?.installed ? (
            <div className="stack">
              <div className="setup-note">
                <ShieldCheck size={20} />
                <p>
                  {installation.isError
                    ? "Não foi possível verificar o banco. Confira a conexão e tente novamente."
                    : "A conexão com o projeto está configurada. Falta preparar o banco para receber seus registros."}
                </p>
              </div>
              {!installation.isError && (
                <div className="setup-steps">
                  <div>
                    <span>01</span>
                    <section>
                      <h3>Prepare o banco</h3>
                      <p>
                        No SQL Editor do Supabase, execute o arquivo{" "}
                        <code>supabase/setup.sql</code>. Em um banco já instalado, aplique
                        somente as novas migrações.
                      </p>
                    </section>
                  </div>
                  <div>
                    <span>02</span>
                    <section>
                      <h3>Configure o primeiro acesso</h3>
                      <p>
                        Desative a confirmação de e-mail em Authentication → Providers →
                        Email. Depois, volte para criar a conta do proprietário.
                      </p>
                    </section>
                  </div>
                </div>
              )}
              <Button
                disabled={installation.isFetching}
                onClick={() => void installation.refetch()}
              >
                Verificar configuração novamente
              </Button>
              <a
                className="text-link"
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
              >
                Abrir painel Supabase
                <ArrowUpRight size={14} />
              </a>
            </div>
          ) : (
            <>
              {signup && !installation.data.emailReady && (
                <div className="notice notice-amber">
                  Desative a confirmação de e-mail no Supabase antes do cadastro.{" "}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void installation.refetch()}
                  >
                    Verificar
                  </Button>
                </div>
              )}
              <form onSubmit={form.handleSubmit(submit)} className="stack">
                <Field
                  label="Nome de usuário"
                  error={form.formState.errors.username?.message}
                >
                  <Input
                    autoComplete="username"
                    placeholder="seu_usuario"
                    autoCapitalize="none"
                    spellCheck={false}
                    {...form.register("username")}
                  />
                </Field>
                <Field label="Senha" error={form.formState.errors.password?.message}>
                  <span className="password-wrap">
                    <Input
                      type={show ? "text" : "password"}
                      autoComplete={signup ? "new-password" : "current-password"}
                      placeholder="Pelo menos 8 caracteres"
                      {...form.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {show ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </Field>
                {signup && (
                  <Field
                    label="Confirmar senha"
                    error={form.formState.errors.confirmation?.message}
                  >
                    <Input
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      {...form.register("confirmation")}
                    />
                  </Field>
                )}
                <Button
                  type="submit"
                  disabled={busy || (signup && !installation.data.emailReady)}
                  className="auth-submit"
                >
                  {busy ? <LoaderCircle size={18} className="spin" /> : null}
                  {signup ? "Criar minha conta" : "Entrar na minha conta"}
                  <ArrowRight size={18} />
                </Button>
              </form>
              {import.meta.env.VITE_ALLOW_SIGNUP !== "false" &&
                !installation.data.hasOwner && (
                  <div className="auth-toggle">
                    {signup ? "Já tem uma conta?" : "Primeiro acesso?"}{" "}
                    <button
                      onClick={() => {
                        setSignup(!signup);
                        form.clearErrors();
                      }}
                    >
                      {signup ? "Entrar" : "Criar conta do proprietário"}
                    </button>
                  </div>
                )}
              <p className="auth-security">
                <ShieldCheck size={16} /> Acesso privado. Seus dados protegidos.
              </p>
            </>
          )}
          <p className="auth-footnote">Um ingrediente a menos para você se preocupar.</p>
        </div>
      </section>
    </main>
  );
}
