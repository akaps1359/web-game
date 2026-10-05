// 그림을 게임용으로 변환한다.
//   1) art/incoming/ 에 <id>.png (또는 jpg/webp) 를 넣는다  (id = 적 id, 변신 형태는 id@2, 배경은 bg-act1 등)
//      코드 그림 작업실(art/painter/studio)에서 window.save(id, 'art') 하면 여기로 저장된다
//   2) npm run art
// 몬스터: 투명 배경 PNG(코드 그림)는 그대로, 검은 배경 그림(AI)은 키잉 + 가장자리 원형 페이드 → public/art/enemies/<id>.webp (768px)
// 배경: 세로 1080px → public/art/bg/<id>.webp
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { basename, extname, join } from 'node:path';

const IN = 'art/incoming';
const DONE = 'art/processed';
const OUT_E = 'public/art/enemies';
const OUT_B = 'public/art/bg';
for (const d of [IN, DONE, OUT_E, OUT_B]) mkdirSync(d, { recursive: true });

// 코드 그림 레시피가 있는 id만 알려진 그림으로 본다 (art/painter/studio/recipes/<id>.js)
const known = new Set(readdirSync('art/painter/studio/recipes').filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)));

function hasAlpha(file) {
  try {
    const fmt = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', file]).toString().trim();
    return /a/.test(fmt.replace('yuvj', '').replace('gray', 'g'));
  } catch {
    return false;
  }
}

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
}

const files = readdirSync(IN).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) {
  console.log(`${IN}/ 에 그림이 없습니다.`);
  process.exit(0);
}

let ok = 0;
const unknown = [];
for (const f of files) {
  const id = basename(f, extname(f)).trim().toLowerCase();
  const src = join(IN, f);
  if (!known.has(id)) unknown.push(f);
  if (id.startsWith('bg-')) {
    ffmpeg(['-i', src, '-vf', 'scale=1080:-2:flags=lanczos', '-c:v', 'libwebp', '-quality', '80', join(OUT_B, `${id}.webp`)]);
  } else {
    // 투명 배경(코드 그림)이면 그대로, 아니면 검은 배경을 키잉하고 가장자리를 원형으로 부드럽게 페이드
    const alpha = hasAlpha(src);
    const key = alpha ? '' : 'colorkey=0x000000:0.09:0.14,';
    const edge = alpha ? 'null' : "geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)*clip((1-2*hypot(X/W-0.5,Y/H-0.52))*5,0,1)'";
    ffmpeg([
      '-i', src,
      '-vf', `format=rgba,${key}scale=768:768:flags=lanczos,format=yuva444p,${edge},format=yuva420p`,
      '-c:v', 'libwebp', '-quality', '85', '-pix_fmt', 'yuva420p',
      join(OUT_E, `${id}.webp`),
    ]);
  }
  const dest = join(DONE, f);
  if (existsSync(dest)) renameSync(dest, join(DONE, `${Date.now()}-${f}`));
  renameSync(src, dest);
  ok++;
  console.log(`✓ ${f} → ${id}`);
}
console.log(`\n${ok}장 변환 완료.`);
if (unknown.length) console.log(`레시피가 없는 그림 (변환은 했음 — 적 id가 맞는지 확인): ${unknown.join(', ')}`);
