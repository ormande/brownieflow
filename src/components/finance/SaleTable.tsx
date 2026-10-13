import { Link } from "react-router-dom";
import { Copy, Eye, Wallet } from "lucide-react";
import { Button } from "../ui";
import type { AppData, Sale } from "../../types";
import { dateLabel, money } from "../../lib/format";
import { saleBalance } from "../../lib/finance";
import { customerName, saleQuantity, StatusBadge } from "./shared";

export default function SaleTable({
  sales,
  data,
  onView,
  onRepeat,
  onPay,
}: {
  sales: Sale[];
  data: AppData;
  onView?: (s: Sale) => void;
  onRepeat?: (s: Sale) => void;
  onPay?: (s: Sale) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Cliente / data</th>
            <th>Quantidade</th>
            <th>Modalidade</th>
            <th>Total</th>
            <th>Saldo</th>
            <th>Situação</th>
            <th>
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sales.map((s) => (
            <tr key={s.id}>
              <td>
                <strong>
                  {s.customer_id ? (
                    <Link to={`/clientes/${s.customer_id}`}>
                      {customerName(s.customer_id, data)}
                    </Link>
                  ) : (
                    "Sem cliente"
                  )}
                </strong>
                <small className="muted" style={{ display: "block", marginTop: 4 }}>
                  {dateLabel(s.sale_date)}
                </small>
              </td>
              <td>{saleQuantity(s.id, data)} un.</td>
              <td>{s.modality === "cash" ? "À vista" : "Fiado"}</td>
              <td className="amount">
                {money(s.total_cents)}
                {s.discount_cents > 0 && (
                  <small className="muted" style={{ display: "block" }}>
                    − {money(s.discount_cents)} de desconto
                  </small>
                )}
              </td>
              <td className="amount">{money(saleBalance(s, data))}</td>
              <td>
                <StatusBadge sale={s} data={data} />
              </td>
              <td>
                <div className="toolbar" style={{ flexWrap: "nowrap", gap: 4 }}>
                  {onView && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Ver detalhes"
                      aria-label="Ver detalhes da venda"
                      onClick={() => onView(s)}
                    >
                      <Eye size={17} />
                    </Button>
                  )}
                  {onRepeat && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Repetir venda"
                      aria-label="Repetir venda"
                      onClick={() => onRepeat(s)}
                    >
                      <Copy size={17} />
                    </Button>
                  )}
                  {onPay && !s.cancelled_at && saleBalance(s, data) > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Receber pagamento"
                      aria-label="Receber pagamento"
                      onClick={() => onPay(s)}
                    >
                      <Wallet size={17} />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
