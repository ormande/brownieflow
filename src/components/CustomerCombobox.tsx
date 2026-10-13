import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, User, X } from "lucide-react";
import { phoneMask } from "../lib/format";
import { matchesCustomer } from "./finance/shared";

export interface CustomerItem {
  id: string;
  name: string;
  phone: string;
  archived?: boolean;
}

export interface CustomerComboboxProps {
  value: string;
  onChange: (id: string) => void;
  customers: CustomerItem[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  emptyLabel?: string;
  showArchived?: boolean;
}

export function CustomerCombobox({
  value,
  onChange,
  customers,
  placeholder = "Selecionar cliente",
  disabled = false,
  className = "",
  id,
  emptyLabel = "Sem cliente (venda avulsa)",
  showArchived = false,
}: CustomerComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Cliente atualmente selecionado
  const selectedCustomer = React.useMemo(() => {
    return customers.find((c) => c.id === value);
  }, [customers, value]);

  // Lista filtrada
  const filtered = React.useMemo(() => {
    return customers.filter(
      (c) => (showArchived || !c.archived) && matchesCustomer(c, search),
    );
  }, [customers, search, showArchived]);

  const handleSelect = (idToSelect: string) => {
    onChange(idToSelect);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setSearch("");
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={`select-trigger ${className}`}
          style={{ cursor: disabled ? "not-allowed" : "pointer" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <User size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
            <span
              style={{
                color: selectedCustomer ? "var(--text)" : "var(--muted)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontWeight: selectedCustomer ? 550 : 400,
              }}
            >
              {selectedCustomer ? (
                <>
                  {selectedCustomer.name}
                  {selectedCustomer.phone ? (
                    <span
                      style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6 }}
                    >
                      · {phoneMask(selectedCustomer.phone)}
                    </span>
                  ) : null}
                </>
              ) : (
                placeholder
              )}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {selectedCustomer && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Limpar cliente selecionado"
                onClick={handleClear}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                  borderRadius: "50%",
                  color: "var(--muted)",
                  cursor: "pointer",
                }}
              >
                <X size={14} />
              </span>
            )}
            <ChevronDown
              size={16}
              style={{
                color: "var(--muted)",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.18s ease",
              }}
            />
          </div>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="popover-panel"
          style={{
            width: "var(--radix-popover-trigger-width)",
            minWidth: 300,
            maxWidth: "calc(100vw - 32px)",
          }}
          align="start"
          sideOffset={5}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          {/* Campo de busca integrado */}
          <div
            style={{
              padding: "8px 10px",
              borderBottom: "1px solid var(--border)",
              position: "relative",
            }}
          >
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 20,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted)",
              }}
            />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              style={{
                width: "100%",
                background: "var(--hover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 10px 8px 32px",
                fontSize: 13,
                color: "var(--text)",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Lista de resultados */}
          <div className="select-list" style={{ maxHeight: 280 }}>
            {/* Opção sem cliente */}
            <button
              type="button"
              className={`select-item ${!value ? "selected" : ""}`}
              onClick={() => handleSelect("")}
            >
              <span style={{ color: "var(--muted)" }}>{emptyLabel}</span>
              {!value && <Check size={15} style={{ color: "var(--green)" }} />}
            </button>

            {filtered.length === 0 ? (
              <div
                style={{
                  padding: "16px 12px",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--muted)",
                }}
              >
                Nenhum cliente encontrado
              </div>
            ) : (
              filtered.map((c) => {
                const isSelected = c.id === value;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`select-item ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSelect(c.id)}
                    style={{ alignItems: "flex-start", padding: "8px 12px" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                        minWidth: 0,
                      }}
                    >
                      <span style={{ fontWeight: isSelected ? 600 : 500 }}>{c.name}</span>
                      {c.phone ? (
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          {phoneMask(c.phone)}
                        </span>
                      ) : null}
                    </div>
                    {isSelected && (
                      <Check
                        size={15}
                        style={{ color: "var(--green)", marginTop: 2, flexShrink: 0 }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
