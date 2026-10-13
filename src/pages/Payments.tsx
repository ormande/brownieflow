import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Pencil, Plus, RotateCcw, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Modal,
  PageHeader,
  Select,
  Stat,
  Textarea,
} from "../components/ui";
import { useAction, useAppData } from "../lib/data";
import { dateLabel, methodLabel, money, today } from "../lib/format";
import type { Payment } from "../types";
import PaymentForm, { type PaymentPreset } from "../components/finance/PaymentForm";
import {
  customerName,
  DateRange,
  inPeriod,
  LoadingData,
  monthStart,
} from "../components/finance/shared";

const schema = z.object({
  reason: z.string().trim().min(3, "Informe o motivo da correção ou estorno").max(500),
});
export default function Payments() {
  const { data } = useAppData();
  const action = useAction();
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [status, setStatus] = useState("active");
  const [method, setMethod] = useState("all");
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<PaymentPreset>();
  const [voiding, setVoiding] = useState<{ payment: Payment; correct: boolean }>();
  const [selectedPayment, setDetail] = useState<Payment>();
  const detail = data?.payments.find((p) => p.id === selectedPayment?.id);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { reason: "" } });
  const submit = handleSubmit(async (values) => {
    if (!voiding || !data) return;
    try {
      await action.run("void_payment", {
        payment_id: voiding.payment.id,
        reason: values.reason,
      });
      if (voiding.correct) {
        const old = voiding.payment;
        const ids = data.payment_allocations
          .filter((a) => a.payment_id === old.id)
          .map((a) => a.sale_id);
        setPreset({
          customer_id: old.customer_id,
          amount_cents: old.amount_cents,
          payment_date: old.payment_date,
          method: old.method,
          notes: old.notes,
          ...(ids.length ? { sale_ids: ids } : {}),
        });
        setOpen(true);
      }
      setVoiding(undefined);
      reset();
    } catch {
      /* Keep confirmation open for a retry. */
    }
  });
  if (!data) return <LoadingData />;
  const linked = (id: string) =>
    data.payment_allocations.filter((a) => a.payment_id === id);
  const period = data.payments.filter((p) => inPeriod(p.payment_date, start, end));
  const active = period.filter((p) => !p.voided_at);
  const unlinked = active.filter((p) => !linked(p.id).length);
  const payments = period
    .filter(
      (p) =>
        (method === "all" || p.method === method) &&
        (status === "all" ||
          (status === "active" && !p.voided_at) ||
          (status === "void" && p.voided_at) ||
          (status === "unlinked" && !p.voided_at && !linked(p.id).length)),
    )
    .sort(
      (a, b) =>
        b.payment_date.localeCompare(a.payment_date) ||
        b.created_at.localeCompare(a.created_at),
    );
  return (
    <div className="stack">
      <PageHeader
        title="Recebimentos"
        description="O dinheiro que entrou, com todos os vínculos claros."
        action={
          <Button
            onClick={() => {
              setPreset(undefined);
              setOpen(true);
            }}
          >
            <Plus size={18} /> Registrar recebimento
          </Button>
        }
      />
      <div className="grid-3">
        <Stat
          label="Recebido no período"
          value={money(active.reduce((n, p) => n + p.amount_cents, 0))}
          hint={`${active.length} pagamentos ativos`}
          icon={<Wallet size={19} />}
        />
        <Stat
          label="Sem vínculo com vendas"
          value={money(unlinked.reduce((n, p) => n + p.amount_cents, 0))}
          hint={`${unlinked.length} registros para conciliar`}
        />
        <Stat
          label="Estornos no período"
          value={money(
            period.filter((p) => p.voided_at).reduce((n, p) => n + p.amount_cents, 0),
          )}
          hint="Excluídos do total recebido"
        />
      </div>
      <Card>
        <div className="toolbar">
          <DateRange start={start} end={end} setStart={setStart} setEnd={setEnd} />
          <Field label="Situação">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Recebimentos ativos</option>
              <option value="unlinked">Sem vínculo</option>
              <option value="void">Estornados</option>
              <option value="all">Todos</option>
            </Select>
          </Field>
          <Field label="Método">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="all">Todos</option>
              {Object.entries(methodLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>
      <Card>
        {payments.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente / data</th>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th>Vínculo</th>
                  <th>Situação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{customerName(p.customer_id, data)}</strong>
                      <small className="muted" style={{ display: "block", marginTop: 4 }}>
                        {dateLabel(p.payment_date)}
                      </small>
                    </td>
                    <td>{methodLabel[p.method]}</td>
                    <td
                      className="amount"
                      style={{ textDecoration: p.voided_at ? "line-through" : undefined }}
                    >
                      {money(p.amount_cents)}
                    </td>
                    <td>
                      {linked(p.id).length ? (
                        `${linked(p.id).length} venda(s)`
                      ) : (
                        <Badge tone="amber">Sem vínculo</Badge>
                      )}
                    </td>
                    <td>
                      <Badge tone={p.voided_at ? "neutral" : "green"}>
                        {p.voided_at ? "Estornado" : "Confirmado"}
                      </Badge>
                    </td>
                    <td>
                      <div className="toolbar" style={{ gap: 4, flexWrap: "nowrap" }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Ver detalhes"
                          aria-label="Ver detalhes do recebimento"
                          onClick={() => setDetail(p)}
                        >
                          <Eye size={17} />
                        </Button>
                        {!p.voided_at && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Corrigir e relançar"
                              aria-label="Corrigir recebimento"
                              onClick={() => {
                                reset();
                                setVoiding({ payment: p, correct: true });
                              }}
                            >
                              <Pencil size={16} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Estornar"
                              aria-label="Estornar recebimento"
                              onClick={() => {
                                reset();
                                setVoiding({ payment: p, correct: false });
                              }}
                            >
                              <RotateCcw size={16} />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Nenhum recebimento neste período"
            description="Registre pagamentos integrais, parciais ou sem vínculo para organizar seu caixa."
            action={
              <Button
                onClick={() => {
                  setPreset(undefined);
                  setOpen(true);
                }}
              >
                Registrar recebimento
              </Button>
            }
          />
        )}
      </Card>
      <PaymentForm open={open} onOpenChange={setOpen} preset={preset} />
      <Modal
        open={Boolean(voiding)}
        onOpenChange={(v) => {
          if (!v) setVoiding(undefined);
        }}
        title={voiding?.correct ? "Corrigir recebimento?" : "Estornar recebimento?"}
        description={
          voiding?.correct
            ? "O registro original será estornado e preservado. Em seguida, confira os dados e confirme um novo recebimento. Se cancelar o novo registro, o estorno permanecerá."
            : "O recebimento sairá do caixa e os saldos das vendas serão reabertos. O histórico será preservado."
        }
      >
        <form className="stack" onSubmit={submit}>
          <strong style={{ fontSize: 28 }}>
            {money(voiding?.payment.amount_cents ?? 0)}
          </strong>
          <Field label="Motivo" error={errors.reason?.message}>
            <Textarea placeholder="Explique a alteração" {...register("reason")} />
          </Field>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setVoiding(undefined)}>
              Voltar
            </Button>
            <Button variant="danger" type="submit" disabled={action.pending}>
              {action.pending
                ? "Processando…"
                : voiding?.correct
                  ? "Estornar e corrigir"
                  : "Confirmar estorno"}
            </Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={Boolean(detail)}
        onOpenChange={(v) => {
          if (!v) setDetail(undefined);
        }}
        title="Detalhes do recebimento"
        description={
          detail
            ? `${dateLabel(detail.payment_date)} · ${methodLabel[detail.method]}`
            : undefined
        }
      >
        {detail && (
          <div className="stack">
            <div className="list-row">
              <span>{customerName(detail.customer_id, data)}</span>
              <strong style={{ fontSize: 28 }}>{money(detail.amount_cents)}</strong>
            </div>
            {detail.notes && <p>{detail.notes}</p>}
            {detail.voided_at && (
              <Card>
                <Badge>Estornado em {dateLabel(detail.voided_at)}</Badge>
                <p>{detail.void_reason}</p>
              </Card>
            )}
            <h3 className="section-title">Alocação entre vendas</h3>
            {linked(detail.id).length ? (
              linked(detail.id).map((a) => {
                const sale = data.sales.find((s) => s.id === a.sale_id);
                return (
                  <div className="list-row" key={a.id}>
                    <span>
                      Venda de {dateLabel(sale?.sale_date)}
                      <small className="muted" style={{ display: "block" }}>
                        Referência: {a.sale_id.slice(0, 8)}
                      </small>
                    </span>
                    <strong>{money(a.amount_cents)}</strong>
                  </div>
                );
              })
            ) : (
              <p className="muted">
                Este recebimento está sem vínculo. Para conciliá-lo, use “Corrigir e
                relançar” e selecione o cliente ou as vendas.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
