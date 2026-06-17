import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Le dashboard est publie a https://guinpin022.github.io/writeflow-poc/dashboard/
// donc `base` doit pointer vers ce sous-chemin pour que les assets se chargent.
export default defineConfig({
  base: "/writeflow-poc/dashboard/",
  plugins: [react()],
});
