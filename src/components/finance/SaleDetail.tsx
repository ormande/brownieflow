import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Field, Modal, Textarea } from "../ui";
import type { AppData, Sale } from "../../types";
import { useAction } from "../../lib/data";
import { dateLabel, money, methodLabel } from "../../lib/format";
import { saleBalance, salePaid } from "../../lib/finance";
import { customerName, StatusBadge } from "./shared";

const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Descreva o motivo do cancelamento").max(500),
});
export default function SaleDetail({
  sale,
  data,
  onClose,
}: {
  sale?: Sale;
  data: AppData;
  onClose: () => void;
}) {
  const action = useAction();
  const [cancel, setCancel] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({ resolver: zodResolver(cancelSchema), defaultValues: { reason: "" } });
  useEffect(() => {
    setCancel(false);
    reset();
  }, [sale?.id, reset]);
  const submit = handleSubmit(async (values) => {
    if (!sale) return;
    try {
      await action.run("cancel_sale", { sale_id: sale.id, reason: values.reason });
      setCancel(false);
      onClose();
      reset();
    } catch {
      /* Action reports validation failures. */
    }
  });
  if (!sale) return null;
  const allocations = data.payment_allocations.filter((a) => a.sale_id === sale.id);
  const adjustments = data.receivable_adjustments.filter((a) => a.sale_id === sale.id);
  const paid = salePaid(sale.id, data);
  return (
    <>
      <Modal
        open={Boolean(sale)}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        title="Detalhes da venda"
        description={`${customerName(sale.customer_id, data)} · ${dateLabel(sale.sale_date)}`}
      >
        <div className="stack">
          <div className="list-row">
            <StatusBadge sale={sale} data={data} />
            <span className="muted">
              {sale.modality === "cash" ? "À vista" : "Fiado"}
            </span>
          </div>
          <Card style={{ padding: 18 }}>
            {data.sale_items
              .filter((i) => i.sale_id === sale.id)
              .map((i) => (
                <div key={i.id} className="list-row">
                  <span>
                    {i.quantity} ×{" "}
                    {data.products.find((p) => p.id === i.product_id)?.name ?? "Produto"}
                  </span>
                  <strong>{money(i.unit_price_cents)} / un.</strong>
                </div>
              ))}
            <div className="list-row">
              <span className="muted">Valor original</span>
              <span>{money(sale.gross_cents)}</span>
            </div>
            <div className="list-row">
              <span className="muted">Desconto na venda</span>
              <span>− {money(sale.discount_cents)}</span>
            </div>
            <div className="list-row">
              <strong>Total da venda</strong>
              <strong>{money(sale.total_cents)}</strong>
            </div>
            <div className="list-row">
              <span className="muted">Pagamentos ativos</span>
              <span>{money(paid)}</span>
            </div>
            <div className="list-row">
              <strong>Saldo atual</strong>
              <strong className="amount">{money(saleBalance(sale, data))}</strong>
            </div>
          </Card>
          <p className="muted" style={{ margin: 0 }}>
            Vencimento: {dateLabel(sale.due_date)}
            {sale.cancelled_at ? ` · Cancelada em ${dateLabel(sale.cancelled_at)}` : ""}
          </p>
          {sale.notes && <p>{sale.notes}</p>}
          {allocations.length > 0 && (
            <div>
              <h3 className="section-title">Pagamentos vinculados</h3>
              {allocations.map((a) => {
                const payment = data.payments.find((p) => p.id === a.payment_id);
                return (
                  <div className="list-row" key={a.id}>
                    <span>
                      {dateLabel(payment?.payment_date)} ·{" "}
                      {methodLabel[payment?.method ?? "other"]}
                      {payment?.voided_at ? " · Estornado" : ""}
                    </span>
                    <strong>{money(a.amount_cents)}</strong>
                  </div>
                );
              })}
            </div>
          )}
          {adjustments.length > 0 && (
            <div>
              <h3 className="section-title">Ajustes de saldo</h3>
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
            </div>
          )}
          {!sale.cancelled_at && (
            <div>
              <Button
                variant="danger"
                disabled={paid > 0}
                onClick={() => setCancel(true)}
              >
                Cancelar venda
              </Button>
              {paid > 0 && (
                <p className="muted">
                  Estorne os pagamentos vinculados antes de cancelar esta venda.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        open={cancel}
        onOpenChange={setCancel}
        title="Cancelar venda?"
        description="O estoque será devolvido e a venda ficará no histórico como cancelada."
      >
        <form onSubmit={submit} className="stack">
          <Field label="Motivo" error={errors.reason?.message}>
            <Textarea {...register("reason")} />
          </Field>
          <div className="form-actions">
            <Button variant="secondary" onClick={() => setCancel(false)}>
              Voltar
            </Button>
            <Button variant="danger" type="submit" disabled={action.pending}>
              Confirmar cancelamento
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
