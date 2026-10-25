// npm run seed  — load personas into data/store.json (keeps nothing else).
// npm run reset — same, but deletes store.json first.
import fs from "node:fs";
import { hasFlag, loadEnv } from "./_env";

async function main() {
  loadEnv();
  const { resetStore, storePath } = await import("../src/lib/store");
  const file = storePath();
  if (hasFlag("reset") && fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`Deleted ${file}`);
  }
  const state = await resetStore();
  console.log(`Seeded ${state.students.length} personas into ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
