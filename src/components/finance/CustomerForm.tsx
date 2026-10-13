import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, Modal, Textarea } from "../ui";
import { useAction } from "../../lib/data";
import type { Customer } from "../../types";
import { formatPhone } from "./shared";
import { useRequestIdentity } from "./requestIdentity";

const schema = z.object({
  name: z.string().trim().min(2, "Informe pelo menos 2 letras").max(100),
  phone: z
    .string()
    .refine(
      (v) => !v || [10, 11].includes(v.replace(/\D/g, "").length),
      "Informe telefone com DDD",
    ),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;
export default function CustomerForm({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customer?: Customer;
  onSaved?: (id: string) => void;
}) {
  const action = useAction();
  const requestIdentity = useRequestIdentity();
  const initialized = useRef(false);
  const submitting = useRef(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", notes: "" },
  });
  useEffect(() => {
    if (!open) {
      initialized.current = false;
      return;
    }
    if (initialized.current) return;
    reset({
      name: customer?.name ?? "",
      phone: formatPhone(customer?.phone ?? ""),
      notes: customer?.notes ?? "",
    });
    initialized.current = true;
  }, [open, customer, reset]);
  const submit = handleSubmit(async (values) => {
    if (submitting.current) return;
    const row = { ...values, phone: values.phone.replace(/\D/g, "") };
    const id = customer?.id ?? requestIdentity.forPayload(row);
    submitting.current = true;
    try {
      await action.save(
        "customers",
        { ...row, ...(customer ? {} : { id, archived: false }) },
        customer?.id,
      );
      requestIdentity.clear();
      onSaved?.(id);
      onOpenChange(false);
    } catch {
      /* Action shows server errors. */
    } finally {
      submitting.current = false;
    }
  });
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!submitting.current) onOpenChange(next);
      }}
      title={customer ? "Editar cliente" : "Novo cliente"}
      description="Um cadastro simples para acompanhar compras e pagamentos."
    >
      <form className="stack" onSubmit={submit}>
        <Field label="Nome" error={errors.name?.message}>
          <Input autoFocus placeholder="Como o cliente se chama?" {...register("name")} />
        </Field>
        <Field
          label="Telefone com DDD"
          error={errors.phone?.message}
          hint="Opcional. Usado para abrir cobranças no WhatsApp."
        >
          <Input
            type="tel"
            placeholder="(65) 99999-9999"
            {...register("phone")}
            onChange={(e) =>
              setValue("phone", formatPhone(e.target.value), { shouldValidate: true })
            }
          />
        </Field>
        <Field label="Observações">
          <Textarea
            placeholder="Preferências ou informações úteis"
            {...register("notes")}
          />
        </Field>
        <div className="form-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={action.pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button disabled={action.pending} type="submit">
            {action.pending ? "Salvando…" : "Salvar cliente"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
