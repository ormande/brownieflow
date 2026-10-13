import { readdir, readFile, writeFile } from "node:fs/promises";
const directory = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
const contents = await Promise.all(
  files.map(
    async (name) =>
      `-- MIGRATION: ${name}\n${await readFile(new URL(name, directory), "utf8")}`,
  ),
);
await writeFile(
  new URL("../supabase/setup.sql", import.meta.url),
  `-- BrownieFlow: instalação em projeto NOVO.\n-- Em bancos existentes, aplique somente migrações ainda não executadas.\n-- Fonte de verdade: supabase/migrations. Gerado por npm run db:prepare.\n\n${contents.join("\n\n")}\n`,
);
console.log(`supabase/setup.sql preparado com ${files.length} migrações.`);
