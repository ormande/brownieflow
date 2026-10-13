import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import type { AppData, TableName } from "../types";
export function useAppData() {
  const { user } = useAuth();
  return useQuery<AppData>({
    queryKey: ["app-data", user?.id],
    enabled: !!user && !!supabase,
    queryFn: async ({ signal }) => {
      if (!supabase) throw new Error("Conecte seu projeto Supabase.");
      // A single SQL statement reads sales, allocations and stock from the
      // same MVCC snapshot. RLS still governs every row in the invoker RPC.
      const { data, error } = await supabase.rpc("get_app_data").abortSignal(signal);
      if (error) throw new Error(error.message);
      if (!data?.profiles?.length)
        throw new Error(
          "Seu perfil não foi encontrado. Confira as migrações do banco e entre novamente.",
        );
      return data as AppData;
    },
    staleTime: 15000,
    refetchInterval: 30000,
    retry: 1,
  });
}
export function useRealtime() {
  const client = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!supabase || !user) return;
    const channel = supabase
      .channel(`owner-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", filter: `user_id=eq.${user.id}` },
        () => {
          void client.invalidateQueries({ queryKey: ["app-data", user.id] });
        },
      )
      .subscribe();
    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [user, client]);
}
export function readableError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Não foi possível concluir a operação.";
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message))
    return "Falha de conexão. A operação pode não ter sido concluída. Verifique o histórico antes de tentar novamente.";
  if (/duplicate key/i.test(message))
    return "Este registro já existe. Atualize a página para conferir.";
  if (/foreign key/i.test(message))
    return "Este registro está em uso. Preserve o histórico ou arquive o cadastro.";
  if (/row-level security|permission denied/i.test(message))
    return "Operação não permitida. Confira sua sessão e as permissões do banco.";
  return message;
}
export function useAction() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [count, setCount] = useState(0);
  async function perform<T>(fn: () => Promise<T>): Promise<T> {
    if (!supabase || !user) throw new Error("Entre na sua conta para continuar.");
    if (!navigator.onLine) {
      toast.error("Sem conexão. Conecte-se à internet para registrar a operação.");
      throw new Error("Sem conexão");
    }
    setCount((c) => c + 1);
    try {
      const result = await fn();
      await client.invalidateQueries({ queryKey: ["app-data", user.id] });
      toast.success("Registro salvo com sucesso.");
      return result;
    } catch (error) {
      toast.error(readableError(error));
      throw error;
    } finally {
      setCount((c) => c - 1);
    }
  }
  return {
    pending: count > 0,
    run: (name: string, payload: Record<string, unknown>) =>
      perform(async () => {
        const { data, error } = await supabase!.rpc(name, {
          p_data: { request_id: crypto.randomUUID(), ...payload },
        });
        if (error) throw error;
        return data;
      }),
    save: (table: TableName, row: Record<string, unknown>, id?: string) =>
      perform(async () => {
        const request = id
          ? supabase!.from(table).update(row).eq("id", id).eq("user_id", user!.id)
          : supabase!.from(table).insert({ ...row, user_id: user!.id });
        const { data, error } = await request.select().single();
        if (error) throw error;
        return data;
      }),
    remove: (table: TableName, id: string) =>
      perform(async () => {
        const { data, error } = await supabase!
          .from(table)
          .delete()
          .eq("id", id)
          .eq("user_id", user!.id)
          .select("id");
        if (error) throw error;
        if (!data?.length)
          throw new Error(
            "O registro não foi excluído. Atualize a página e confira as permissões.",
          );
      }),
  };
}
