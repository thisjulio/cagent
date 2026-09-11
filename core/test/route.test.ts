import { describe, expect, it } from "bun:test";
import { splitRoute } from "../src/route";

describe("splitRoute", () => {
  it("divide provider/modelo", () => expect(splitRoute("openai/gpt-5.1")).toEqual(["openai", "gpt-5.1"]));
  it("sem barra repete", () => expect(splitRoute("llama")).toEqual(["llama", "llama"]));
});
