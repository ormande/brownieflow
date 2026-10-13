import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { today } from "../lib/format";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

export interface DatePickerProps {
  value?: string; // YYYY-MM-DD
  onChange?: (date: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "DD/MM/AAAA",
  disabled = false,
  className = "",
  id,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse inicial de mês e ano para exibição
  const initialDate = React.useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return { year: y, month: m - 1, day: d };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
  }, [value]);

  const [viewYear, setViewYear] = React.useState(initialDate.year);
  const [viewMonth, setViewMonth] = React.useState(initialDate.month);

  // Sincroniza se o valor mudar externamente e o popover abrir
  React.useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value, open]);

  // Navegar meses
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Cálculo da grade do mês
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Domingo

  // Dias do mês anterior para preencher a primeira semana
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const leadingDays = Array.from({ length: firstDayOfWeek }, (_, i) => ({
    day: prevMonthDays - firstDayOfWeek + i + 1,
    isCurrentMonth: false,
    iso: "",
  }));

  // Dias do mês atual
  const currentDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, isCurrentMonth: true, iso };
  });

  const allCells = [...leadingDays, ...currentDays];
  // Completa as semanas para fechar múltiplo de 7
  const remaining = 7 - (allCells.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      allCells.push({ day: i, isCurrentMonth: false, iso: "" });
    }
  }

  const todayIso = today();

  // Formata para exibição em pt-BR (ex: "13/10/2026")
  const displayValue = React.useMemo(() => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }, [value]);

  const handleSelect = (iso: string) => {
    if (!iso) return;
    if (min && iso < min) return;
    if (max && iso > max) return;
    onChange?.(iso);
    setOpen(false);
  };

  const handleToday = () => {
    handleSelect(todayIso);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          disabled={disabled}
          className={`select-trigger ${className}`}
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
        >
          <span style={{ color: displayValue ? "var(--text)" : "#99a1a8" }}>
            {displayValue || placeholder}
          </span>
          <CalendarIcon size={16} style={{ color: "var(--green)", opacity: 0.85 }} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="popover-panel datepicker-panel"
          align="start"
          sideOffset={6}
        >
          <div className="datepicker-header">
            <span className="datepicker-title">
              {MONTHS[viewMonth]} de {viewYear}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className="datepicker-nav-btn"
                onClick={prevMonth}
                aria-label="Mês anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className="datepicker-nav-btn"
                onClick={nextMonth}
                aria-label="Próximo mês"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="datepicker-weekdays">
            {WEEKDAYS.map((w, idx) => (
              <span key={idx}>{w}</span>
            ))}
          </div>

          <div className="datepicker-grid">
            {allCells.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return (
                  <span
                    key={idx}
                    className="datepicker-day other-month"
                    style={{ cursor: "default" }}
                  >
                    {cell.day}
                  </span>
                );
              }

              const isSelected = value === cell.iso;
              const isToday = todayIso === cell.iso;
              const isDisabled = Boolean(
                (min && cell.iso < min) || (max && cell.iso > max),
              );

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isDisabled}
                  className={`datepicker-day ${isSelected ? "selected" : ""} ${
                    isToday ? "today" : ""
                  }`}
                  onClick={() => handleSelect(cell.iso)}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          <div className="datepicker-footer">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={Boolean((min && todayIso < min) || (max && todayIso > max))}
              style={{ padding: "4px 8px", minHeight: 28, fontSize: 11 }}
              onClick={handleToday}
            >
              Hoje
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  padding: "4px 8px",
                  minHeight: 28,
                  fontSize: 11,
                  color: "var(--red)",
                }}
                onClick={() => {
                  onChange?.("");
                  setOpen(false);
                }}
              >
                Limpar
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
