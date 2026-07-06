import type { TuiPluginModule } from "@opencode-ai/plugin/tui";

const plugin: TuiPluginModule & { id: string } = {
  id: "magic-compact",
  tui: async () => {},
};

export default plugin;
