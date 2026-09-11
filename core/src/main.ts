import { bootstrap } from "./bootstrap";
import { runCli } from "./cli";

async function main() {
  if (await runCli(process.argv.slice(2))) return;
  await bootstrap();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
