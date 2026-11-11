# Model & Effort Badges

See the model family and reasoning effort for each BB thread without opening its composer. A model letter with small effort strokes sits at the provider logo; hover for the full name and effort. The badge describes the settings for the next turn. Provider colors require the separate True Colors plugin.

![Model and effort badges in BB](assets/badges.png)

*Synthetic example data in BB 0.47.1 with separate [True Colors](https://github.com/ChrBoebel/bb-plugin-provider-brand-marks) 0.1.3 by ChrBoebel. Without it, badges are gray. The tooltip preserves the full model name and exact effort.*

## Install

Requires BB 0.46.1 and SDK 0.6.49 or later. The published version was tested on BB 0.47.1; no fresh BB 0.46.1 runtime test is claimed.

Open BB’s **Community Plugins → Model & Effort Badges → Install**, or run `bb plugin install model-effort-badges`. For a specific Git release:

```sh
bb plugin install git:https://github.com/neoromantic/bb-plugin-model-effort-badges.git@v0.7.2 --yes
```

For a tracking source, use `bb plugin update model-effort-badges --yes`. To change a pinned version or installation source, save the plugin settings, remove its registration, install the desired version, then restore those settings individually. Removal resets settings.

To disable or uninstall, use `bb plugin disable model-effort-badges` or `bb plugin remove model-effort-badges`.

Existing users: [migration reference](MIGRATION.md).

## Try it

Compare the badges when several threads use different models or effort levels. Hover a provider logo to check the full name before sending the next turn. For long thread titles, choose **Under the logo** in the plugin settings to keep their width.

## Read the badges

```
 A    BB                A + one stroke = GPT-6-Astra, High
 ━
 O    BB: model and …    O + four strokes = Opus 5.5, Ultracode
 ━ ━ ━ ━
```

- **Letter:** the model family taken from the provider catalog name, without the vendor prefix. For example, Astra, Sol and Luna for Codex; Opus, Sonnet, Haiku and Fable for Claude.
- **Effort:** no strokes for none/minimal/low/medium, one for high, two for extra high, three for max, four for ultra/ultracode. Hover and screen readers retain the exact level. The `under` and `beside` placements keep the text codes: `0`, `min`, `l`, `m`, `h`, `xh`, `max`, `u`, `uc`; other levels use their first two letters.
- **Color:** the model letter and effort strokes take their hue from True Colors (`--pbm-brand-codex`, `--pbm-brand-claude-code` and its chroma settings). Without it, badges remain gray. Two providers can show the same model letter; use the full-name tooltip to distinguish them.
- **Hover:** hover the logo for the full model name and effort. BB's own provider tooltip gets a second line, for example `GPT-6-Astra · High`.
- **Screen readers:** the thread link reads `GPT-6-Astra, High reasoning effort` as its description.
- **Unknown:** `?` means BB has no model for the thread. The plugin never guesses one from the provider.

## Data

Each visible row reads `threads.defaultExecutionOptions`, which calls `GET /api/v1/threads/:id/default-execution-options`. This is the value the composer uses for the thread's next turn: the sticky override if set, else the last turn request, else the project default. On the server it is one indexed lookup, not a history scan.

Names come from `providers.models` once per provider. The plugin fetches a row again only when `updatedAt` or `status` changes in BB's live sidebar data. There are no timers or polling. The last answer for each thread and the provider names are kept in this browser's local storage, so badges show at once after a restart.

A message sent to a thread that is already running does not change `updatedAt`, so a model switch made that way shows once the thread goes idle.

## Setting

`Badge placement` (Settings → Installed plugins → Model & Effort Badges):

- `tile` (default): Codex and Claude Code rows show an 18px-wide model letter and effort strokes instead of the logo. Its 17px height fits compact 26px rows. Every effort takes the same width; the title starts 4px after it. The badge stays inside the provider slot, clear of tree guides and chevrons. Other providers keep the logo with the caption under it.
- `under`: a 9px caption under every provider logo. Title width does not change.
- `beside`: a 10.5px chip next to every provider logo. It is easier to read but takes about three title characters.

```sh
bb plugin config model-effort-badges set placement under
bb plugin config model-effort-badges unset placement   # back to tile
```

## Compatibility

This full-trust plugin uses experimental BB APIs and internal attributes of the standard sidebar. A BB upgrade or replacement sidebar can make the badges disappear. It does not patch BB or its database.

- Internal markup it reads or decorates: `[data-sidebar-rename-row]`, `a[data-sidebar-thread-id]`, and the provider logo.
- The plugin runs as an app overlay (`experimental_appOverlay`), because it needs `useSidebarThreads`, `useSdk` and `useSettings`.
- It only adds its own element to `[data-sidebar-thread-provider]`, a line to that logo's tooltip, and an id to the row link's `aria-describedby`.
- With `tile`, its CSS hides the Codex and Claude logo inside that element and widens the element to the tile. The element keeps BB's `role="img"` label and tooltip.
- It does not touch other providers' logos, which True Colors colors, BB's spinners and activity glyphs, or BB's row actions, hover controls and keyboard behavior.
- Those `data-sidebar-*` attributes are internal BB DOM, not a public API. If BB renames them, the badges disappear and nothing else changes.

## Data and access

The plugin reads thread execution settings and provider model names through your BB server. It stores no data on the server and adds no telemetry; the browser's local storage keeps the last model, effort and provider model names it read. BB and your configured providers have their own data handling and telemetry settings.

## Develop

Use Bun and an installed BB CLI:

```sh
bun install --frozen-lockfile
bun run check
bun test
bun run build
```
