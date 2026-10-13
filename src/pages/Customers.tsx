import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Archive,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmButton,
  CustomSelect,
  Empty,
  Field,
  Input,
  PageHeader,
  Stat,
} from "../components/ui";
import { useAction, useAppData } from "../lib/data";
import { dateLabel, methodLabel, money } from "../lib/format";
import { saleBalance } from "../lib/finance";
import type { Customer, Sale } from "../types";
import CustomerForm from "../components/finance/CustomerForm";
import PaymentForm from "../components/finance/PaymentForm";
import SaleTable from "../components/finance/SaleTable";
import SaleDetail from "../components/finance/SaleDetail";
import SaleForm from "../components/SaleForm";
import {
  LoadingData,
  matchesCustomer,
  saleQuantity,
  whatsappUrl,
} from "../components/finance/shared";

export default function Customers() {
  const { data } = useAppData();
  const action = useAction();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer>();
  if (!data) return <LoadingData />;
  const customers = data.customers
    .filter(
      (c) =>
        matchesCustomer(c, search) &&
        (filter === "all" || c.archived === (filter === "archived")),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const debt = (id: string) =>
    data.sales
      .filter((s) => s.customer_id === id && !s.cancelled_at)
      .reduce((n, s) => n + saleBalance(s, data), 0);
  const create = () => {
    setEditing(undefined);
    setOpen(true);
  };
  return (
    <div className="stack">
      <PageHeader
        title="Clientes"
        description="Um pouco mais perto de quem adora seus brownies."
        action={
          <Button onClick={create}>
            <Plus size={18} /> Novo cliente
          </Button>
        }
      />
      <div className="grid-3">
        <Stat
          label="Clientes ativos"
          value={data.customers.filter((c) => !c.archived).length}
          icon={<Users size={19} />}
        />
        <Stat
          label="Clientes com saldo aberto"
          value={data.customers.filter((c) => debt(c.id) > 0).length}
        />
        <Stat
          label="Total a receber de clientes"
          value={money(data.customers.reduce((n, c) => n + debt(c.id), 0))}
          icon={<Wallet size={19} />}
        />
      </div>
      <Card>
        <div className="toolbar">
          <Field label="Pesquisar cliente">
            <div style={{ position: "relative" }}>
              <Search
                size={17}
                style={{ position: "absolute", left: 13, top: 13, opacity: 0.5 }}
              />
              <Input
                style={{ paddingLeft: 38, minWidth: 240 }}
                placeholder="Nome ou telefone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </Field>
          <Field label="Exibir">
            <CustomSelect
              value={filter}
              onChange={setFilter}
              options={[
                { value: "active", label: "Clientes ativos" },
                { value: "archived", label: "Arquivados" },
                { value: "all", label: "Todos" },
              ]}
            />
          </Field>
        </div>
      </Card>
      <Card>
        {customers.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Última compra</th>
                  <th>Compras</th>
                  <th>Saldo aberto</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const sales = data.sales
                    .filter((s) => s.customer_id === c.id && !s.cancelled_at)
                    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/clientes/${c.id}`}>
                          <strong>{c.name}</strong>
                        </Link>
                        {c.archived && <Badge>Arquivado</Badge>}
                        <small
                          className="muted"
                          style={{ display: "block", marginTop: 4 }}
                        >
                          {c.phone || "Sem telefone"}
                        </small>
                      </td>
                      <td>{dateLabel(sales[0]?.sale_date)}</td>
                      <td>
                        {sales.length} ·{" "}
                        {money(sales.reduce((n, s) => n + s.total_cents, 0))}
                      </td>
                      <td className="amount">{money(debt(c.id))}</td>
                      <td>
                        <div className="toolbar" style={{ gap: 4 }}>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar ${c.name}`}
                            onClick={() => {
                              setEditing(c);
                              setOpen(true);
                            }}
                          >
                            <Pencil size={16} />
                          </Button>
                          <ConfirmButton
                            variant="ghost"
                            title={
                              c.archived ? "Restaurar cliente?" : "Arquivar cliente?"
                            }
                            description="O histórico de compras e pagamentos será preservado."
                            onConfirm={() =>
                              action.save("customers", { archived: !c.archived }, c.id)
                            }
                          >
                            <Archive size={16} />
                            <span className="sr-only">
                              {c.archived ? "Restaurar" : "Arquivar"}
                            </span>
                          </ConfirmButton>
                          <Button variant="ghost" size="icon" asChild>
                            <Link
                              to={`/clientes/${c.id}`}
                              aria-label={`Abrir histórico de ${c.name}`}
                            >
                              <ArrowUpRight size={18} />
                            </Link>
                          </Button>
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
              search ? "Cliente não encontrado" : "Sua lista de clientes começa aqui"
            }
            description={
              search
                ? "Tente outro nome ou telefone."
                : "Cadastre um cliente e acompanhe seu histórico de compras."
            }
            action={
              <Button onClick={create}>
                <Plus size={17} /> Cadastrar cliente
              </Button>
            }
          />
        )}
      </Card>
      <CustomerForm open={open} onOpenChange={setOpen} customer={editing} />
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data } = useAppData();
  const action = useAction();
  const [edit, setEdit] = useState(false);
  const [payment, setPayment] = useState(false);
  const [detail, setDetail] = useState<Sale>();
  const [repeat, setRepeat] = useState<string>();
  const [saleOpen, setSaleOpen] = useState(false);
  if (!data) return <LoadingData />;
  const customer = data.customers.find((c) => c.id === id);
  if (!customer)
    return (
      <Empty
        title="Cliente não encontrado"
        description="O cadastro não existe ou não está disponível nesta conta."
        action={
          <Button asChild>
            <Link to="/clientes">Voltar para clientes</Link>
          </Button>
        }
      />
    );
  const sales = data.sales
    .filter((s) => s.customer_id === customer.id)
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date));
  const active = sales.filter((s) => !s.cancelled_at);
  const payments = data.payments
    .filter((p) => p.customer_id === customer.id)
    .sort((a, b) => b.payment_date.localeCompare(a.payment_date));
  const balance = active.reduce((n, s) => n + saleBalance(s, data), 0);
  const adjustments = data.receivable_adjustments.filter((a) =>
    active.some((s) => s.id === a.sale_id),
  );
  return (
    <div className="stack">
      <Button variant="ghost" style={{ alignSelf: "flex-start" }} asChild>
        <Link to="/clientes">
          <ArrowLeft size={17} /> Clientes
        </Link>
      </Button>
      <PageHeader
        title={customer.name}
        description={`${customer.phone || "Sem telefone"} · Cliente desde ${dateLabel(customer.created_at)}`}
        action={
          <div className="toolbar">
            <Button variant="secondary" onClick={() => setEdit(true)}>
              <Pencil size={16} /> Editar
            </Button>
            <>
              {customer.phone && balance > 0 && (
                <Button variant="secondary" asChild>
                  <a
                    href={whatsappUrl(
                      customer.phone,
                      customer.name,
                      balance,
                      data.profiles[0]?.whatsapp_template,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Revisar cobrança no WhatsApp"
                  >
                    <MessageCircle size={17} /> Cobrar
                  </a>
                </Button>
              )}
            </>
            <Button onClick={() => setPayment(true)} disabled={balance <= 0}>
              <Wallet size={17} /> Receber pagamento
            </Button>
          </div>
        }
      />
      {customer.notes && (
        <Card>
          <p className="eyebrow">Sobre este cliente</p>
          <p>{customer.notes}</p>
        </Card>
      )}
      {customer.archived && <Badge>Cliente arquivado</Badge>}
      <div className="grid-4">
        <Stat
          label="Brownies comprados"
          value={active.reduce((n, s) => n + saleQuantity(s.id, data), 0)}
          hint={`${active.length} compras realizadas`}
        />
        <Stat
          label="Total das compras"
          value={money(active.reduce((n, s) => n + s.total_cents, 0))}
          hint="Após descontos da venda"
        />
        <Stat label="Saldo devedor" value={money(balance)} />
        <Stat label="Última compra" value={dateLabel(active[0]?.sale_date)} />
      </div>
      <Card>
        <h2 className="section-title" style={{ marginBottom: 20 }}>
          Histórico de compras
        </h2>
        {sales.length ? (
          <SaleTable
            sales={sales}
            data={data}
            onView={setDetail}
            onRepeat={(s) => {
              setRepeat(s.id);
              setSaleOpen(true);
            }}
          />
        ) : (
          <Empty
            title="Ainda sem compras"
            description="As vendas deste cliente aparecerão aqui."
          />
        )}
      </Card>
      <div className="grid-2">
        <Card>
          <h2 className="section-title">Pagamentos realizados</h2>
          {payments.length ? (
            payments.map((p) => (
              <div className="list-row" key={p.id}>
                <div>
                  <strong>{methodLabel[p.method]}</strong>
                  <small className="muted" style={{ display: "block", marginTop: 4 }}>
                    {dateLabel(p.payment_date)}
                    {p.voided_at ? " · Estornado" : ""}
                  </small>
                  {p.notes && (
                    <small className="muted" style={{ display: "block" }}>
                      {p.notes}
                    </small>
                  )}
                </div>
                <strong
                  style={{ textDecoration: p.voided_at ? "line-through" : undefined }}
                >
                  {money(p.amount_cents)}
                </strong>
              </div>
            ))
          ) : (
            <Empty
              title="Nenhum recebimento"
              description="Os pagamentos vinculados a este cliente aparecerão aqui."
            />
          )}
        </Card>
        <Card>
          <h2 className="section-title">Descontos e ajustes</h2>
          {!active.some((s) => s.discount_cents > 0) && !adjustments.length ? (
            <Empty title="Nenhum desconto ou ajuste" />
          ) : (
            <>
              {active
                .filter((s) => s.discount_cents > 0)
                .map((s) => (
                  <div className="list-row" key={s.id}>
                    <span>
                      Desconto na compra
                      <small className="muted" style={{ display: "block" }}>
                        {dateLabel(s.sale_date)}
                      </small>
                    </span>
                    <strong>− {money(s.discount_cents)}</strong>
                  </div>
                ))}
              {adjustments.map((a) => (
                <div className="list-row" key={a.id}>
                  <span>
                    {a.reason}
                    <small className="muted" style={{ display: "block" }}>
                      {dateLabel(a.adjustment_date)}
                    </small>
                  </span>
                  <strong>
                    {a.amount_cents > 0 ? "+" : ""}
                    {money(a.amount_cents)}
                  </strong>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>
      {sales.length === 0 && payments.length === 0 && (
        <div>
          <ConfirmButton
            title="Excluir cliente?"
            description="Este cadastro não possui histórico financeiro e será removido."
            onConfirm={async () => {
              await action.remove("customers", customer.id);
              navigate("/clientes");
            }}
          >
            Excluir cadastro sem histórico
          </ConfirmButton>
        </div>
      )}
      <CustomerForm open={edit} onOpenChange={setEdit} customer={customer} />
      <PaymentForm
        open={payment}
        onOpenChange={setPayment}
        preset={{ customer_id: customer.id }}
      />
      <SaleForm open={saleOpen} onOpenChange={setSaleOpen} repeatSaleId={repeat} />
      <SaleDetail
        sale={detail && data.sales.find((s) => s.id === detail.id)}
        data={data}
        onClose={() => setDetail(undefined)}
      />
    </div>
  );
}
