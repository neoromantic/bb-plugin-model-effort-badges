import { useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreads as useSidebarThreads,
  useSdk,
  useSettings,
} from "@get-bb/plugin-sdk/app";
import { describe, type Badge, type Catalog, type Execution } from "./format";

/** BB's sidebar thread-row provider logo; True Colors paints the mask inside it. */
const ICON = "[data-sidebar-thread-provider]";
const BADGE = "data-model-effort";
const TIP = "data-model-effort-tip";

/** Providers whose logo the tile replaces; the rest keep the caption under their logo. */
const TILE_PROVIDERS = new Set(["codex", "claude-code"]);

type Placement = "tile" | "under" | "beside";
type Entry = { key: string; execution: Execution | null };

const CSS = `
[${BADGE}] { pointer-events: none; white-space: nowrap; color: var(--muted-foreground); font-variant-numeric: tabular-nums; }
[${BADGE}] b { font-weight: 650; color: var(--sidebar-foreground); }
[${BADGE}] b + span { margin-left: .5px; font-weight: 550; }
[${BADGE}] [id] { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
[${BADGE}][data-placement="under"] { position: absolute; left: 50%; top: calc(100% - .75px); transform: translateX(-50%); font-size: 9px; line-height: 7px; letter-spacing: .02em; }
[${BADGE}][data-placement="beside"] { display: inline-flex; align-items: baseline; flex-shrink: 0; margin: 0 6px 0 -2px; padding: 0 4px; border-radius: 4px; font-size: 10.5px; line-height: 16px; background: color-mix(in oklab, var(--muted-foreground) 14%, transparent); }
[data-sidebar-thread-provider]:has(> [${BADGE}][data-placement="tile"]) { width: auto; min-width: 18px; margin-right: 4px; justify-content: flex-start; }
[data-sidebar-thread-provider]:has(> [${BADGE}][data-placement="tile"]) > :not([${BADGE}]) { display: none; }
[${BADGE}][data-placement="tile"] { display: inline-flex; align-items: baseline; justify-content: center; min-width: 18px; padding: 0 3px; border-radius: calc(var(--radius) - 4px); font-size: var(--text-2xs); line-height: 16px; font-weight: 600; letter-spacing: -.02em; --tile-color: light-dark(oklch(from var(--tile) .45 min(calc(c * var(--pbm-chroma-scale)), var(--pbm-chroma-cap)) h), oklch(from var(--tile) .82 min(calc(c * var(--pbm-chroma-scale)), var(--pbm-chroma-cap)) h)); }
[${BADGE}][data-placement="tile"] b { font-size: 1.1em; font-weight: 700; letter-spacing: 0; color: inherit; }
[data-sidebar-thread-provider="codex"] > [${BADGE}][data-placement="tile"] { --tile: var(--pbm-brand-codex); box-shadow: inset 0 0 0 1px var(--tile-color); background: color-mix(in oklch, var(--tile-color) 10%, transparent); }
[data-sidebar-thread-provider="claude-code"] > [${BADGE}][data-placement="tile"] { --tile: var(--pbm-brand-claude-code); background: color-mix(in oklch, var(--tile-color) 28%, transparent); }
[${TIP}] { margin-top: 1px; opacity: .8; }
`;

function badgeOf(icon: Element): HTMLElement | null {
  const inside = icon.querySelector<HTMLElement>(`:scope > [${BADGE}]`);
  if (inside) return inside;
  const next = icon.nextElementSibling;
  return next instanceof HTMLElement && next.hasAttribute(BADGE) ? next : null;
}

function rowLink(icon: Element): HTMLAnchorElement | null {
  return icon.closest("[data-sidebar-rename-row]")?.querySelector<HTMLAnchorElement>("a[data-sidebar-thread-id]") ?? null;
}

function setText(node: Element, text: string) {
  if (node.textContent !== text) node.textContent = text;
}

function describedBy(link: Element, id: string, add: boolean) {
  const ids = (link.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((token) => token && token !== id);
  if (add) ids.push(id);
  const next = ids.join(" ");
  if (next !== (link.getAttribute("aria-describedby") ?? "")) {
    if (next) link.setAttribute("aria-describedby", next);
    else link.removeAttribute("aria-describedby");
  }
}

function removeBadge(badge: HTMLElement) {
  const id = badge.querySelector("[id]")?.id;
  const link = rowLink(badge.closest(ICON) ?? badge);
  if (id && link) describedBy(link, id, false);
  badge.remove();
}

function ModelEffortBadges() {
  const sdk = useSdk();
  const { threads } = useSidebarThreads();
  const setting = useSettings().values?.placement;
  const placement: Placement = setting === "under" || setting === "beside" ? setting : "tile";
  const [executions, setExecutions] = useState(() => new Map<string, Entry>());
  const [catalogs, setCatalogs] = useState(() => new Map<string, Catalog>());
  const latest = useRef({ threads, executions, catalogs, placement });
  latest.current = { threads, executions, catalogs, placement };
  const schedule = useRef(() => {});

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let ids = 0;
    // Last key requested per thread, kept after failures so a broken thread
    // is retried when it changes rather than on every sidebar mutation.
    const requested = new Map<string, string>();
    const requestedCatalogs = new Set<string>();

    const loadExecution = (threadId: string, key: string) => {
      requested.set(threadId, key);
      sdk.threads.defaultExecutionOptions({ threadId }).then(
        (options) => {
          if (!alive || requested.get(threadId) !== key) return;
          const execution = options && { model: options.model, reasoningLevel: options.reasoningLevel };
          setExecutions((prev) => new Map(prev).set(threadId, { key, execution }));
        },
        () => {},
      );
    };

    const loadCatalog = (providerId: string) => {
      requestedCatalogs.add(providerId);
      sdk.providers.models({ providerId }).then(
        (options) => {
          if (!alive) return;
          const provider = options.providers.find((entry) => entry.id === providerId);
          setCatalogs((prev) =>
            new Map(prev).set(providerId, {
              brandPrefix: provider?.strings?.brandPrefix ?? null,
              models: [...options.models, ...options.selectedOnlyModels],
              efforts: provider?.reasoningLevels ?? [],
            }),
          );
        },
        () => {},
      );
    };

    const render = (icon: HTMLElement, link: HTMLAnchorElement, threadId: string, badge: Badge, placement: Placement) => {
      let el = badgeOf(icon);
      if (!el) {
        el = document.createElement("span");
        el.setAttribute(BADGE, "");
        // The row link reads the full description; the code itself is decoration.
        el.setAttribute("aria-hidden", "true");
        const description = document.createElement("span");
        description.id = `model-effort-${++ids}`;
        el.append(document.createElement("b"), document.createElement("span"), description);
      }
      if (placement === "beside" ? el.previousElementSibling !== icon : el.parentElement !== icon) {
        if (placement === "beside") icon.after(el);
        else icon.append(el);
      }
      el.dataset.placement = placement;
      el.dataset.thread = threadId;
      el.dataset.tooltip = badge.tooltip;
      const [model, effort, description] = el.children;
      setText(model!, badge.model);
      setText(effort!, badge.effort);
      setText(description!, badge.description);
      describedBy(link, description!.id, true);
    };

    const showTooltip = () => {
      const icon = document.querySelector<HTMLElement>(`${ICON}[data-state$="open"]`);
      const text = icon && badgeOf(icon)?.dataset.tooltip;
      const hidden = icon && document.getElementById(icon.getAttribute("aria-describedby") ?? "");
      if (!text || !hidden?.parentElement || hidden.parentElement.querySelector(`[${TIP}]`)) return;
      const line = document.createElement("div");
      line.setAttribute(TIP, "");
      line.setAttribute("aria-hidden", "true");
      line.textContent = text;
      hidden.before(line);
    };

    const sync = () => {
      frame = 0;
      const { threads, executions, catalogs, placement } = latest.current;
      const keys = new Map(threads.map((thread) => [thread.id, `${thread.updatedAt}:${thread.status}`]));
      for (const badge of document.querySelectorAll<HTMLElement>(`[${BADGE}]`)) {
        const icon = badge.parentElement?.matches(ICON) ? badge.parentElement : badge.previousElementSibling;
        if (!icon?.matches(ICON) || rowLink(icon)?.dataset.sidebarThreadId !== badge.dataset.thread) removeBadge(badge);
      }
      for (const icon of document.querySelectorAll<HTMLElement>(ICON)) {
        const link = rowLink(icon);
        const threadId = link?.dataset.sidebarThreadId;
        const providerId = icon.dataset.sidebarThreadProvider;
        if (!link || !threadId || !providerId) continue;
        // updatedAt moves when a turn starts or ends and when a sticky override changes.
        const key = keys.get(threadId) ?? "";
        if (requested.get(threadId) !== key) loadExecution(threadId, key);
        if (!requestedCatalogs.has(providerId)) loadCatalog(providerId);
        const entry = executions.get(threadId);
        const rendered = placement === "tile" && !TILE_PROVIDERS.has(providerId) ? "under" : placement;
        if (entry) render(icon, link, threadId, describe(entry.execution, catalogs.get(providerId)), rendered);
      }
      showTooltip();
    };

    schedule.current = () => {
      if (alive && !frame) frame = requestAnimationFrame(sync);
    };

    const touchesSidebar = (node: Node) =>
      node instanceof Element && (node.matches(ICON) || node.querySelector(ICON) !== null || node.closest("[data-sidebar-rename-row]") !== null);

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" ? (record.target as Element).matches(ICON) : touchesSidebar(record.target) || [...record.addedNodes].some(touchesSidebar)) {
          schedule.current();
          return;
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state"] });
    schedule.current();

    return () => {
      alive = false;
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.querySelectorAll<HTMLElement>(`[${BADGE}]`).forEach(removeBadge);
      document.querySelectorAll(`[${TIP}]`).forEach((line) => line.remove());
    };
  }, [sdk]);

  useEffect(() => schedule.current(), [threads, executions, catalogs, placement]);

  return <style>{CSS}</style>;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "model-effort-badges", component: ModelEffortBadges });
});
