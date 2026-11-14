import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const SOURCE_LOCATION_PLUGIN_CANDIDATES = [
  process.env.MEOO_SOURCE_LOCATION_PLUGIN_PATH,
  "/app/sdk/lib/src/plugins/source-location-babel.js",
  resolve(process.cwd(), "node_modules/@ali/oneday-agent-sdk/lib/src/plugins/source-location-babel.js"),
].filter(Boolean) as string[];

const SOURCE_LOCATION_PLUGIN_PATH = SOURCE_LOCATION_PLUGIN_CANDIDATES.find((path) => existsSync(path));
const PROJECT_ROOT = fileURLToPath(new URL(".", import.meta.url));
const normalizeWatchPath = (filePath: string) => filePath.replace(/\\/g, "/");
const TMP_DIRECTORY = normalizeWatchPath(resolve(PROJECT_ROOT, "tmp"));

/**
 * React + Vite 构建配置
 *
 * 硬约束：
 * - dev server 必须监听 3015 + strictPort（沙箱只开放一个代理端口）
 * - outDir 'dist' / assetsDir 'assets' — 归一化产物目录
 */
export default defineConfig({
  plugins: [
    {
      name: "meoo-require-real-homepage",
      apply: "build",
      buildStart() {
        const homepage = resolve(PROJECT_ROOT, "src/routes/index.tsx");
        if (existsSync(homepage) && readFileSync(homepage, "utf8").includes("data-meoo-blank-placeholder")) {
          this.error("[MEOO_DEFAULT_HOMEPAGE_NOT_REPLACED] src/routes/index.tsx 仍为默认占位首页，业务页面尚未接入。主 Agent 必须替换首页并装配业务组件，然后重新构建；不能只删除占位标记。");
        }
      },
    },
    tailwindcss(),
    TanStackRouterVite(),
    viteReact({
      babel: {
        plugins: SOURCE_LOCATION_PLUGIN_PATH
          ? [[SOURCE_LOCATION_PLUGIN_PATH, { projectRoot: process.cwd() }]]
          : [],
      },
    }),
    tsConfigPaths(),
  ],
  optimizeDeps: {
    entries: ["index.html", "src/main.tsx"],
  },
  server: {
    host: "0.0.0.0",
    port: 3015,
    strictPort: true,
    allowedHosts: true,
    // 沙箱预览关闭 WebSocket 和 HMR，避免 iframe 下整页 reload 放大 transform error。
    ws: false,
    hmr: false,
    // tmp 是下载/解压等临时工作区，默认不参与递归监听；public 仍保持监听，
    // 以支持运行期间新增、修改和删除静态资源。
    watch: {
      ignored: (filePath) => {
        const normalizedPath = normalizeWatchPath(filePath);
        return normalizedPath === TMP_DIRECTORY
          || normalizedPath.startsWith(`${TMP_DIRECTORY}/`);
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
