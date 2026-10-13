// Local-only viewer for reviewing/copying installation and verification SQL.
// It never connects to Supabase or reads credentials.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
createServer(async (req, res) => {
  if (req.url !== "/" && req.url !== "/verify") {
    res.writeHead(404).end();
    return;
  }
  const verify = req.url === "/verify";
  const filename = verify ? "verify-rollback.sql" : "setup.sql";
  const sql = await readFile(new URL(`../supabase/${filename}`, import.meta.url), "utf8");
  const escaped = sql
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const title = verify ? "Verificação com rollback" : "Instalação do banco";
  const description = verify
    ? "Execute o arquivo inteiro. A transação de verificação termina com ROLLBACK, descartando todos os registros usados no teste."
    : "SQL gerado a partir das migrações versionadas para um projeto novo. Não contém senhas nem chaves.";
  const page = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>BrownieFlow — ${title}</title><style>body{font:16px system-ui;margin:32px;background:#f6f8fa;color:#253a30}textarea{display:block;box-sizing:border-box;width:100%;height:80vh;margin-top:20px;padding:20px;border:1px solid #ccdcd1;border-radius:15px;font:12px monospace}p{line-height:1.6}</style><h1>BrownieFlow — ${title}</h1><p>${description}</p><textarea aria-label="SQL do BrownieFlow" readonly>${escaped}</textarea></html>`;
  res.writeHead(200, {
    "Content-Type": "text/html;charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(page);
}).listen(4180, "127.0.0.1", () => console.log("SQL viewer: http://127.0.0.1:4180"));
