// Read-only check. Never log keys, sessions or private application data.
process.loadEnvFile(".env");
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Configure .env primeiro.");
for (const [name, path, method] of [
  ["Authentication settings", "/auth/v1/settings", "GET"],
  ["BrownieFlow installation", "/rest/v1/rpc/installation_status", "POST"],
  [
    "BrownieFlow schema (anonymous access must be denied)",
    "/rest/v1/rpc/get_app_data",
    "POST",
  ],
]) {
  const response = await fetch(url + path, {
    method,
    headers: { apikey: key, "Content-Type": "application/json" },
    ...(method === "POST" ? { body: "{}" } : {}),
  });
  const data = await response.json();
  console.log(name, {
    status: response.status,
    ...(path.includes("settings")
      ? {
          signupDisabled: data.disable_signup,
          emailConfirmationDisabled: data.mailer_autoconfirm,
          emailProvider: data.external?.email,
        }
      : path.includes("installation_status")
        ? {
            installed: data.installed,
            hasOwner: data.has_owner,
            schemaVersion: data.schema_version,
          }
        : { code: data.code, message: data.message }),
  });
}
