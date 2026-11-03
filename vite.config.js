import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/mori-space-v2/",
  build: {
    rolldownOptions: {
      input: {
        home: fileURLToPath(new URL("./index.html", import.meta.url)),
        services: fileURLToPath(new URL("./services/index.html", import.meta.url)),
        project: fileURLToPath(new URL("./projects/warm-minimal-living-study/index.html", import.meta.url)),
      },
    },
  },
});
