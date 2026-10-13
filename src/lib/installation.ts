import { useQuery } from "@tanstack/react-query";
import { isConfigured, supabase } from "./supabase";

export function useInstallation(enabled: boolean) {
  return useQuery({
    queryKey: ["installation"],
    enabled: isConfigured && enabled,
    retry: 1,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase!
        .rpc("installation_status")
        .abortSignal(signal);
      if (error?.code === "PGRST202")
        return { installed: false, hasOwner: false, emailReady: false };
      if (error) throw new Error(error.message);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`,
        {
          headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
          signal,
        },
      );
      if (!response.ok)
        throw new Error("Não foi possível verificar a configuração de acesso.");
      const settings = await response.json();
      return {
        installed: data.installed === true,
        hasOwner: data.has_owner === true,
        emailReady: settings.mailer_autoconfirm === true,
      };
    },
  });
}
