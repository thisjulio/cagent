import { describe, expect, it } from "bun:test";
import { splitRoute } from "../src/route";

describe("splitRoute", () => {
  it("splits provider/model", () => expect(splitRoute("openai/gpt-5.1")).toEqual(["openai", "gpt-5.1"]));
  it("repeats a route without a slash", () => expect(splitRoute("llama")).toEqual(["llama", "llama"]));
});
