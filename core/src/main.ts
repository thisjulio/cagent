import { bootstrap } from "./app";

bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
