import { defineConfig } from 'vitest/config';
import type { Plugin, ViteDevServer } from 'vite';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
      // 개발 전용: 브라우저에서 만든 PNG 저장 — 앱 아이콘은 public/, 코드로 그린 그림은 art/incoming/ (to=art) 또는 sim/out/samples/ (to=sample)
      server.middlewares.use('/__save-asset', (req, res) => {
        const q = new URL(req.url ?? '', 'http://x').searchParams;
        const name = q.get('name') ?? '';
        const to = q.get('to');
        const dir = to === 'art' ? join('art', 'incoming') : to === 'sample' ? join('sim', 'out', 'samples') : 'public';
        const ok = to === 'art' || to === 'sample' ? /^[a-z0-9@-]+\.png$/.test(name) : /^icon-\d+\.png$/.test(name);
        if (req.method !== 'POST' || !ok) {
          res.statusCode = 400;
          res.end('bad');
          return;
        }
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const b64 = body.replace(/^data:image\/png;base64,/, '');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.from(b64, 'base64'));
          res.end('ok');
        });
      });
      server.watcher.on('change', (file) => {
        if (!/[\\/]src[\\/].*\.(ts|tsx)$/.test(file)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.reloadModule(mod);
      });
    },
  };
}

/** `virtual:art` — public/art 에 들어 있는 그림 목록 (없는 그림은 아이콘으로 대체) */
function artList(): Plugin {
  const VIRTUAL = 'virtual:art';
  const RESOLVED = '\0virtual:art';
  const list = (dir: string) => {
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.webp'))
        .map((f) => f.slice(0, -5))
        .sort();
    } catch {
      return [];
    }
  };
  return {
    name: 'art-list',
    resolveId(id) {
      if (id === VIRTUAL) return RESOLVED;
    },
    load(id) {
      if (id !== RESOLVED) return;
      return `export default ${JSON.stringify({ enemies: list('public/art/enemies'), bg: list('public/art/bg') })};`;
    },
    configureServer(server: ViteDevServer) {
      // 그림이 추가·삭제되면 목록을 다시 만들고 페이지를 새로 고친다 (여러 장을 한꺼번에 넣어도 한 번만)
      server.watcher.add('public/art');
      let timer: ReturnType<typeof setTimeout> | null = null;
      const refresh = (file: string) => {
        if (!/[\\/]public[\\/]art[\\/]/.test(file)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const mod = server.moduleGraph.getModuleById(RESOLVED);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }, 800);
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
      // 감시가 놓친 경우에도 페이지를 열 때마다 목록을 새로 만든다
      server.middlewares.use((req, _res, next) => {
        if (req.url?.includes('virtual:art')) {
          const mod = server.moduleGraph.getModuleById(RESOLVED);
          if (mod) server.moduleGraph.invalidateModule(mod);
        }
        next();
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/web-game/' : '/',
  plugins: [gameIcons(), artList()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 봇이 전투를 여러 번 치르는 테스트는 바쁜 기기(배포 서버 등)에서 기본 5초를 넘길 수 있다
    testTimeout: 30_000,
  },
}));
