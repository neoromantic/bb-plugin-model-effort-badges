/** What BB would run on a thread's next turn (`threads.defaultExecutionOptions`). */
export type Execution = { model: string; reasoningLevel: string };

/** Display names from the provider's own model catalog. */
export type Catalog = {
  brandPrefix: string | null;
  models: readonly { id: string; model: string; displayName: string }[];
  efforts: readonly { id: string; label: string }[];
};

export type Badge = { model: string; effort: string; tooltip: string; description: string };

const EFFORT_CODES: Record<string, string> = {
  none: "0",
  minimal: "min",
  low: "l",
  medium: "m",
  high: "h",
  xhigh: "xh",
  max: "max",
  ultra: "u",
  ultracode: "uc",
};

const UNKNOWN: Badge = {
  model: "?",
  effort: "",
  tooltip: "Model and effort unknown",
  description: "model and effort unknown",
};

/** First word of the model name that is not the vendor brand: "GPT-6-Astra" → "Astra". */
function family(name: string, brandPrefix: string | null): string {
  const brand = brandPrefix?.replace(/[^a-z0-9]+$/i, "").toLowerCase();
  const words = name.split(/[^a-z0-9.]+/i);
  return words.find((word) => /[a-z]/i.test(word) && word.toLowerCase() !== brand) ?? name;
}

export function describe(execution: Execution | null, catalog: Catalog | undefined): Badge {
  if (!execution) return UNKNOWN;
  const { model, reasoningLevel } = execution;
  const modelName = catalog?.models.find((entry) => entry.id === model || entry.model === model)?.displayName ?? model;
  const effortName = catalog?.efforts.find((entry) => entry.id === reasoningLevel)?.label ?? reasoningLevel;
  return {
    model: family(modelName, catalog?.brandPrefix ?? null).charAt(0).toUpperCase(),
    effort: EFFORT_CODES[reasoningLevel] ?? reasoningLevel.slice(0, 2).toLowerCase(),
    tooltip: `${modelName} · ${effortName}`,
    description: `${modelName}, ${effortName} reasoning effort`,
  };
}
