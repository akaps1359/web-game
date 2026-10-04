import { defineConfig } from 'vitest/config';
import type { Plugin, ViteDevServer } from 'vite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * `virtual:icons` — game-icons.net(CC BY 3.0) 아이콘 중 src에서 'gi:이름'으로 참조한 것만 번들에 포함한다.
 */
function gameIcons(): Plugin {
  const VIRTUAL = 'virtual:icons';
  const RESOLVED = '\0virtual:icons';
  let pack: { icons: Record<string, { body: string; width?: number; height?: number }>; width?: number; height?: number } | undefined;

  const scan = (dir: string, found: Set<string>) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) scan(p, found);
      else if (/\.(ts|tsx)$/.test(name)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/['"`]gi:([a-z0-9-]+)['"`]/g)) found.add(m[1]);
      }
    }
  };

  return {
    name: 'game-icons',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      pack ??= JSON.parse(readFileSync(require.resolve('@iconify-json/game-icons/icons.json'), 'utf8'));
      const used = new Set<string>();
      scan('src', used);
      const out: Record<string, string> = {};
      for (const name of [...used].sort()) {
        const icon = pack!.icons[name];
        if (!icon) {
          this.warn(`game-icons: '${name}' 아이콘이 없습니다`);
          continue;
        }
        const w = icon.width ?? pack!.width ?? 512;
        const h = icon.height ?? pack!.height ?? 512;
        out[name] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${icon.body}</svg>`;
      }
      return `export default ${JSON.stringify(out)};`;
    },
    configureServer(server: ViteDevServer) {
      server.watcher.on('change', (file) => {
        if (!/[\\/]src[\\/].*\.(ts|tsx)$/.test(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.reloadModule(mod);
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/web-game/' : '/',
  plugins: [gameIcons()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
