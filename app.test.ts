import { expect, mock, test } from "bun:test";

// The host supplies React; registration itself renders nothing.
mock.module("react", () => ({ memo: (component: unknown) => component, useCallback() {}, useEffect() {}, useLayoutEffect() {}, useRef() {}, useState() {}, useSyncExternalStore() {} }));
mock.module("react/jsx-runtime", () => ({ jsx() {}, jsxs() {}, Fragment: "Fragment" }));
const { default: app } = (await import("./app")) as { default: { setup(builder: unknown): void } };

test("the badges, New child thread and the columns page register side by side", () => {
  const calls: unknown[][] = [];
  const record = (kind: string) => (registration: { id: string; path?: string; title?: string }) => calls.push([kind, registration.id, registration.path ?? registration.title]);
  app.setup({
    slots: { experimental_appOverlay: record("overlay"), experimental_threadAction: record("threadAction"), navPanel: record("navPanel") },
    contentScripts: { register: record("contentScript") },
  });
  expect(calls).toEqual([
    ["overlay", "model-effort-badges", undefined],
    ["overlay", "child-thread", undefined],
    ["overlay", "subthread-columns", undefined],
    ["navPanel", "columns", "columns"],
    ["threadAction", "newChildThread", "New child thread"],
    ["contentScript", "row-status", undefined],
  ]);
});
