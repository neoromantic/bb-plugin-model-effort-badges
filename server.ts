import type { BbPluginApi } from "@get-bb/plugin-sdk";

export default function plugin(bb: BbPluginApi) {
  bb.settings.define({
    placement: {
      type: "select",
      label: "Badge placement",
      description:
        "Tile replaces the Codex and Claude logos with a colored model and effort tile; other providers keep the caption under their logo. Under the logo keeps the full title width; beside the logo is larger and takes about three title characters.",
      options: ["tile", "under", "beside"],
      experimental_optionLabels: { tile: "Tile instead of the logo", under: "Under the logo", beside: "Beside the logo" },
      default: "tile",
    },
  });
}
