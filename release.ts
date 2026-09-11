import bash from "./plugins/bash/src/index";
import codeTools from "./plugins/code-tools/src/index";
import llamaCpp from "./plugins/llama.cpp/src/index";
import openai from "./plugins/openai/src/index";
import stub from "./plugins/stub/src/index";
import { bootstrap } from "./core/src/bootstrap";

bootstrap({
  defaultPlugins: [{ name: "bash" }, { name: "code-tools" }, { name: "openai" }, { name: "llama.cpp" }],
  pluginLoaders: { bash, "code-tools": codeTools, "llama.cpp": llamaCpp, openai, stub },
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
