import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreads as useSidebarThreads,
  useBbContext,
  useSdk,
  useSettings,
  type PluginComposerThreadRowStatus,
  type PluginContentScriptContext,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { rowAttention, type Attention } from "./attention";
import { CHILD_CSS, ChildComposer, childThreadAction } from "./child";
import { COLUMNS_PATH, SubthreadColumnsAutoOpen, SubthreadColumnsPage, columnsAnchor, subscribeColumnsAnchor } from "./columns-view";
import { describe, type Badge, type Catalog, type Execution } from "./format";
import { useAttention, useSeenWhileShown } from "./use-attention";

/** BB's sidebar thread-row provider logo; True Colors paints the mask inside it. */
const ICON = "[data-sidebar-thread-provider]";
const BADGE = "data-model-effort";
const TIP = "data-model-effort-tip";
const ROW = "[data-sidebar-rename-row]";
/** Registered managers carry this prefix in their stored title; the row hides it. */
const MANAGER = "○ ";

/** Providers whose logo the tile replaces; the rest keep the caption under their logo. */
const TILE_PROVIDERS = new Set(["codex", "claude-code"]);

type Placement = "tile" | "under" | "beside";
type Entry = { key: string; execution: Execution | null };

/** Set by the content script, which is the only holder of BB's row-status writer. */
let setRowStatus: PluginContentScriptContext["experimental_setThreadRowStatus"];
let onRowStatusWriter = () => {};

/** BB's CircleX glyph, for the failure BB will not draw over its spinner or question. */
const CIRCLE_X = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>')}`;

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
[data-mea-manager] .bb-thread-title { font-weight: 600; color: light-dark(oklch(from var(--sidebar-foreground) calc(l - .12) c h), oklch(from var(--sidebar-foreground) calc(l + .14) c h)); }
[data-sidebar-thread-trailing-indicator] > [data-icon="CircleQuestion"] { color: var(--warning); }
[data-sidebar-thread-trailing-indicator] > [data-icon="Circle"][aria-label="Unread reply"] { width: 6px; height: 6px; border-radius: 50%; background: var(--sidebar-foreground); }
[data-sidebar-thread-trailing-indicator] > [data-icon="Circle"][aria-label="Unread reply"] > * { display: none; }
[data-mea-quiet] [data-sidebar-thread-trailing-indicator] > span:not([data-icon-root]) { display: none; }
[data-sidebar-thread-trailing-indicator]:has(> [data-icon-root]) { position: relative; }
[data-mea-failed] [data-sidebar-thread-trailing-indicator]:has(> [data-icon="Loading"], > [data-icon="CircleQuestion"]) > * { visibility: hidden; }
[data-mea-failed] [data-sidebar-thread-trailing-indicator]:has(> [data-icon="Loading"], > [data-icon="CircleQuestion"])::before { content: ""; position: absolute; inset: 0; background: var(--destructive); mask: url("${CIRCLE_X}") center / contain no-repeat; }
[data-mea-unread] [data-sidebar-thread-trailing-indicator]:has(> [data-icon-root]:not([data-icon="Circle"]))::after { content: ""; position: absolute; top: -1px; right: -1.5px; width: 6px; height: 6px; border-radius: 50%; background: var(--sidebar-foreground); box-shadow: 0 0 0 1.5px var(--sidebar); }
`;

function toggle(row: HTMLElement, name: string, on: boolean) {
  if (on !== row.hasAttribute(name)) row.toggleAttribute(name, on);
}

/** The title's first text node, where the manager prefix sits. */
function titleText(row: HTMLElement): Text | null {
  const title = row.querySelector(".bb-thread-title");
  const text = title && document.createTreeWalker(title, NodeFilter.SHOW_TEXT).nextNode();
  return text instanceof Text ? text : null;
}

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
  const { attention } = useAttention();
  const { threadId: openThreadId } = useBbContext();
  const current = useSyncExternalStore(subscribeColumnsAnchor, columnsAnchor);
  const latest = useRef({ threads, executions, catalogs, placement, attention, current });
  latest.current = { threads, executions, catalogs, placement, attention, current };
  const schedule = useRef(() => {});

  useSeenWhileShown(openThreadId, attention);

  useEffect(() => {
    let alive = true;
    let frame = 0;
    let ids = 0;
    // Last key requested per thread, kept after failures so a broken thread
    // is retried when it changes rather than on every sidebar mutation.
    const requested = new Map<string, string>();
    const requestedCatalogs = new Set<string>();
    // Row statuses this generation of the writer currently holds.
    const shown = new Map<string, PluginComposerThreadRowStatus>();
    onRowStatusWriter = () => {
      shown.clear();
      schedule.current();
    };

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

    const syncRows = (threads: readonly PluginSidebarThread[], attention: ReadonlyMap<string, Attention>, current: string | null) => {
      const byId = new Map(threads.map((thread) => [thread.id, thread]));
      const children = Map.groupBy(threads.filter((thread) => !thread.isHidden), (thread) => thread.parentThreadId);
      const descendants = (id: string): PluginSidebarThread[] => (children.get(id) ?? []).flatMap((child) => [child, ...descendants(child.id)]);
      const statuses = new Map<string, PluginComposerThreadRowStatus | null>();
      // From the link up: a section's sticky group carries the row attribute too.
      for (const link of document.querySelectorAll<HTMLElement>("a[data-sidebar-thread-id]")) {
        const row = link.closest<HTMLElement>(ROW);
        const thread = byId.get(link.dataset.sidebarThreadId ?? "");
        if (!row || !thread) continue;
        const collapsed = row.querySelector('button[data-sidebar-rename-anchor][aria-expanded="false"]') !== null;
        const state = rowAttention(thread, collapsed ? [thread, ...descendants(thread.id)] : [thread], attention);
        statuses.set(thread.id, state.status);
        toggle(row, "data-mea-failed", state.failed);
        toggle(row, "data-mea-unread", state.unread);
        toggle(row, "data-mea-quiet", state.quiet);
        // The anchor of the columns page on screen looks like BB's own current row.
        toggle(row, "data-mea-current", thread.id === current);
        const manager = thread.title?.startsWith(MANAGER) ?? false;
        toggle(row, "data-mea-manager", manager);
        // Cut from the visible text only; the stored title, tooltip and link label keep it.
        const text = manager ? titleText(row) : null;
        if (text?.data.startsWith(MANAGER)) text.data = text.data.slice(MANAGER.length);
      }
      if (!setRowStatus) return;
      for (const [id, status] of statuses) {
        if ((shown.get(id) ?? null) === status) continue;
        setRowStatus(id, status);
        if (status) shown.set(id, status);
        else shown.delete(id);
      }
      for (const id of shown.keys()) {
        if (statuses.has(id)) continue;
        setRowStatus(id, null);
        shown.delete(id);
      }
    };

    const sync = () => {
      frame = 0;
      const { threads, executions, catalogs, placement, attention, current } = latest.current;
      syncRows(threads, attention, current);
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
      for (const row of document.querySelectorAll<HTMLElement>("[data-mea-failed], [data-mea-unread], [data-mea-quiet], [data-mea-manager], [data-mea-current]")) {
        const text = row.hasAttribute("data-mea-manager") ? titleText(row) : null;
        if (text && !text.data.startsWith(MANAGER)) text.data = MANAGER + text.data;
        row.removeAttribute("data-mea-failed");
        row.removeAttribute("data-mea-unread");
        row.removeAttribute("data-mea-quiet");
        row.removeAttribute("data-mea-manager");
        row.removeAttribute("data-mea-current");
      }
      // BB clears this generation's row statuses itself when the plugin deactivates.
      onRowStatusWriter = () => {};
    };
  }, [sdk]);

  useEffect(() => schedule.current(), [threads, executions, catalogs, placement, attention, current]);

  return <style>{CSS + CHILD_CSS}</style>;
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({ id: "model-effort-badges", component: ModelEffortBadges });
  app.slots.experimental_appOverlay({ id: "child-thread", component: ChildComposer });
  app.slots.experimental_appOverlay({ id: "subthread-columns", component: SubthreadColumnsAutoOpen });
  app.slots.navPanel({ id: "columns", title: "Subthreads", icon: "Columns2", path: COLUMNS_PATH, component: SubthreadColumnsPage });
  app.slots.experimental_threadAction(childThreadAction);
  app.contentScripts.register({
    id: "row-status",
    mount(context) {
      const writer = context.experimental_setThreadRowStatus;
      setRowStatus = writer;
      onRowStatusWriter();
      return () => {
        if (setRowStatus === writer) setRowStatus = undefined;
      };
    },
  });
});
