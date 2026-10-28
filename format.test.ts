import { expect, test } from "bun:test";
import { describe, type Catalog } from "./format";

const codex: Catalog = {
  brandPrefix: "GPT-",
  models: [
    { id: "gpt-6-astra", model: "gpt-6-astra", displayName: "GPT-6-Astra" },
    { id: "gpt-6.1-sol", model: "gpt-6.1-sol", displayName: "GPT-6.1-Sol" },
  ],
  efforts: [
    { id: "high", label: "High" },
    { id: "xhigh", label: "Extra High" },
  ],
};

const claude: Catalog = {
  brandPrefix: "Claude ",
  models: [{ id: "claude-opus-5-5", model: "claude-opus-5-5", displayName: "Opus 5.5" }],
  efforts: [{ id: "ultracode", label: "Ultracode" }],
};

test("uses catalog names without the vendor brand", () => {
  expect(describe({ model: "gpt-6-astra", reasoningLevel: "high" }, codex)).toEqual({
    model: "A",
    effort: "h",
    tooltip: "GPT-6-Astra · High",
    description: "GPT-6-Astra, High reasoning effort",
  });
  expect(describe({ model: "gpt-6.1-sol", reasoningLevel: "xhigh" }, codex)).toMatchObject({ model: "S", effort: "xh" });
  expect(describe({ model: "claude-opus-5-5", reasoningLevel: "ultracode" }, claude)).toMatchObject({
    model: "O",
    effort: "uc",
    tooltip: "Opus 5.5 · Ultracode",
  });
});

test("shows raw ids for models and efforts the catalog does not list", () => {
  expect(describe({ model: "claude-sonnet-9", reasoningLevel: "turbo" }, claude)).toEqual({
    model: "S",
    effort: "tu",
    tooltip: "claude-sonnet-9 · turbo",
    description: "claude-sonnet-9, turbo reasoning effort",
  });
  expect(describe({ model: "grok-4", reasoningLevel: "max" }, undefined)).toMatchObject({ model: "G", effort: "max" });
});

test("keeps an unresolved thread honest", () => {
  expect(describe(null, codex)).toMatchObject({ model: "?", effort: "", tooltip: "Model and effort unknown" });
});
