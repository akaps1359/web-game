// 코드로 그리는 괴물 일러스트 — SVG 조각 + 조명 필터 (브라우저에서 PNG로 굽는다: art/painter/index.html)

export const W = 768;
export const H = 768;

/** 결정적 난수 (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const n1 = (v) => Math.round(v * 10) / 10;
export const lerp = (a, b, t) => a + (b - a) * t;

/** 3차 베지어 위의 점과 접선 */
export function bez(p, t) {
  const [p0, p1, p2, p3] = p;
  const m = 1 - t;
  const x = m * m * m * p0[0] + 3 * m * m * t * p1[0] + 3 * m * t * t * p2[0] + t * t * t * p3[0];
  const y = m * m * m * p0[1] + 3 * m * m * t * p1[1] + 3 * m * t * t * p2[1] + t * t * t * p3[1];
  const dx = 3 * m * m * (p1[0] - p0[0]) + 6 * m * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
  const dy = 3 * m * m * (p1[1] - p0[1]) + 6 * m * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
  return { x, y, dx, dy };
}

/** 베지어를 따라 점점 가늘어지는 몸통(촉수·팔·꼬리) 윤곽 */
export function taper(p, w0, w1 = 1, n = 36, pow = 0.85) {
  const L = [];
  const Rt = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const { x, y, dx, dy } = bez(p, t);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const w = (w0 * Math.pow(1 - t, pow) + w1 * t) / 2;
    L.push([x + nx * w, y + ny * w]);
    Rt.push([x - nx * w, y - ny * w]);
  }
  const pts = L.concat(Rt.reverse());
  return 'M' + pts.map((q) => `${n1(q[0])} ${n1(q[1])}`).join('L') + 'Z';
}

/** 공용 정의: 그라디언트·필터 */
export function defs({ seed = 1, body = '#2a333d', spec = '#bffff0', spec2 = '#d68cff', rim = '#7fffe0', rimDx = -6, rimDy = 10, bump = 14, grain = 0.07, goo = 13 } = {}) {
  return `
  <defs>
    <radialGradient id="iris" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#f4ffd8"/>
      <stop offset="0.35" stop-color="#9dff7a"/>
      <stop offset="0.8" stop-color="#2f9a3c"/>
      <stop offset="1" stop-color="#0b2d12"/>
    </radialGradient>
    <radialGradient id="iris-amber" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff6c8"/>
      <stop offset="0.4" stop-color="#ffc24a"/>
      <stop offset="0.85" stop-color="#a24a08"/>
      <stop offset="1" stop-color="#2a0d02"/>
    </radialGradient>
    <radialGradient id="iris-pale" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.5" stop-color="#cfe6ee"/>
      <stop offset="1" stop-color="#3c5866"/>
    </radialGradient>
    <radialGradient id="maw" cx="0.5" cy="0.55" r="0.55">
      <stop offset="0" stop-color="#3a0606"/>
      <stop offset="0.55" stop-color="#140202"/>
      <stop offset="1" stop-color="#000"/>
    </radialGradient>
    <linearGradient id="tooth" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#efe6cc"/>
      <stop offset="1" stop-color="#7d715a"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>

    <!-- 덩어리들을 하나의 유기체로 녹여 붙인다 -->
    <filter id="goo" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${goo}" result="b"/>
      <feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 30 -13"/>
    </filter>

    <!-- 살갗: 굴곡(돔+잡음) → 확산광 + 두 갈래 반사광(무지갯빛) + 역광 테두리 + 입자감 -->
    <filter id="flesh" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="5" seed="${seed}" result="nA"/>
      <feTurbulence type="turbulence" baseFrequency="0.032" numOctaves="3" seed="${seed + 7}" result="nB"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="${seed + 3}" result="nG"/>
      <feGaussianBlur in="SourceAlpha" stdDeviation="18" result="dome"/>
      <feColorMatrix in="nA" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="nAa"/>
      <feColorMatrix in="nB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="nBa"/>
      <feComposite in="dome" in2="nAa" operator="arithmetic" k2="0.8" k3="0.55" result="h1"/>
      <feComposite in="h1" in2="nBa" operator="arithmetic" k2="1" k3="0.22" result="height"/>
      <feDiffuseLighting in="height" surfaceScale="${bump}" diffuseConstant="1.05" lighting-color="${body}" result="diff">
        <feDistantLight azimuth="235" elevation="42"/>
      </feDiffuseLighting>
      <feSpecularLighting in="height" surfaceScale="${bump}" specularConstant="1.25" specularExponent="32" lighting-color="${spec}" result="specA">
        <feDistantLight azimuth="230" elevation="52"/>
      </feSpecularLighting>
      <feSpecularLighting in="height" surfaceScale="${bump}" specularConstant="0.9" specularExponent="18" lighting-color="${spec2}" result="specB">
        <feDistantLight azimuth="-20" elevation="24"/>
      </feSpecularLighting>
      <feComposite in="diff" in2="specA" operator="arithmetic" k2="1" k3="0.8" result="lit1"/>
      <feComposite in="lit1" in2="specB" operator="arithmetic" k2="1" k3="0.45" result="lit2"/>
      <!-- 역광 테두리 -->
      <feOffset in="SourceAlpha" dx="${rimDx}" dy="${rimDy}" result="off"/>
      <feComposite in="SourceAlpha" in2="off" operator="out" result="edge"/>
      <feGaussianBlur in="edge" stdDeviation="2.2" result="edgeB"/>
      <feFlood flood-color="${rim}" result="rimC"/>
      <feComposite in="rimC" in2="edgeB" operator="in" result="rimL"/>
      <feComposite in="lit2" in2="rimL" operator="arithmetic" k2="1" k3="0.9" result="lit3"/>
      <!-- 입자감 -->
      <feColorMatrix in="nG" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${grain} 0" result="grainA"/>
      <feBlend in="grainA" in2="lit3" mode="overlay" result="lit4"/>
      <feComposite in="lit4" in2="SourceAlpha" operator="in"/>
    </filter>

    <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6"/>
    </filter>
    <filter id="bigglow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="haze" x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="4" seed="${seed + 11}" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -0.45" result="na"/>
      <feComposite in="SourceGraphic" in2="na" operator="in"/>
      <feGaussianBlur stdDeviation="3"/>
    </filter>
  </defs>`;
}

/** 눈 하나 — 움푹한 눈구멍, 빛나는 홍채, 동공, 반사광 */
export function eye(x, y, r, o = {}) {
  const rot = o.rot ?? 0;
  const iris = o.iris ?? 'iris';
  const pupil = o.pupil ?? 'slit';
  const lid = o.lid ?? 0; // 0 = 활짝, 0.6 = 반쯤 감김
  const rx = r * 1.3;
  const ry = r * 0.92;
  let p = '';
  if (pupil === 'slit') p = `<ellipse rx="${n1(r * 0.16)}" ry="${n1(r * 0.66)}" fill="#020202"/>`;
  else if (pupil === 'bar') p = `<ellipse rx="${n1(r * 0.62)}" ry="${n1(r * 0.14)}" fill="#020202"/>`;
  else if (pupil === 'round') p = `<circle r="${n1(r * 0.34)}" fill="#020202"/>`;
  else if (pupil === 'many') p = [[-0.3, -0.15], [0.28, -0.2], [0, 0.25]].map(([a, b]) => `<circle cx="${n1(a * r)}" cy="${n1(b * r)}" r="${n1(r * 0.16)}" fill="#020202"/>`).join('');
  const lidPath = lid > 0 ? `<path d="M${n1(-rx)} 0 Q0 ${n1(-ry * 2.1)} ${n1(rx)} 0 Q0 ${n1(-ry * 2.1 + ry * 2.6 * lid)} ${n1(-rx)} 0Z" fill="#07090b"/>` : '';
  return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)})">
    <ellipse rx="${n1(rx * 1.12)}" ry="${n1(ry * 1.15)}" fill="#010203"/>
    <ellipse rx="${n1(rx)}" ry="${n1(ry)}" fill="url(#${iris})"/>
    ${p}
    <ellipse cx="${n1(-r * 0.38)}" cy="${n1(-r * 0.34)}" rx="${n1(r * 0.17)}" ry="${n1(r * 0.12)}" fill="#fff" opacity="0.9"/>
    ${lidPath}
    <ellipse rx="${n1(rx * 1.12)}" ry="${n1(ry * 1.15)}" fill="none" stroke="#3b4a4e" stroke-opacity="0.55" stroke-width="${n1(Math.max(1, r * 0.1))}"/>
  </g>`;
}

/** 눈 빛 번짐 (화면 합성) */
export function eyeGlow(x, y, r, color = '#7dff8a', k = 2.6) {
  return `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r * k)}" fill="url(#glow)" style="fill:${color}" opacity="0.5"/>`;
}

/** 이빨이 늘어선 아가리 */
export function maw(x, y, rx, ry, R, o = {}) {
  const rot = o.rot ?? 0;
  const teeth = [];
  const n = Math.max(5, Math.round(rx / 7));
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const a = Math.PI * (side < 0 ? 1 + t : t);
      const bx = Math.cos(a) * rx * 0.96;
      const by = Math.sin(a) * ry * 0.96;
      const len = ry * (0.35 + R() * 0.45) * Math.sin(Math.PI * t);
      const w = (rx / n) * (0.6 + R() * 0.4);
      const tx = bx * 0.7;
      const ty = by - Math.sign(by || side) * len;
      teeth.push(`<path d="M${n1(bx - w / 2)} ${n1(by)}L${n1(tx)} ${n1(ty)}L${n1(bx + w / 2)} ${n1(by)}Z" fill="url(#tooth)"/>`);
    }
  }
  return `<g transform="translate(${n1(x)} ${n1(y)}) rotate(${n1(rot)})">
    <ellipse rx="${n1(rx * 1.12)}" ry="${n1(ry * 1.25)}" fill="#030405"/>
    <ellipse rx="${n1(rx)}" ry="${n1(ry)}" fill="url(#maw)"/>
    ${teeth.join('')}
    <path d="M${n1(-rx * 0.5)} ${n1(ry * 0.2)} q${n1(rx * 0.1)} ${n1(ry * 1.4)} ${n1(rx * 0.05)} ${n1(ry * 2.2)}" stroke="#9fd8c8" stroke-opacity="0.35" stroke-width="1.6" fill="none"/>
  </g>`;
}

/** 무대 배경 (견본용): 등 뒤 빛무리, 바닥 안개, 떠다니는 티끌, 비네트 */
export function scene(R, o = {}) {
  const tone = o.tone ?? '#0f3a36';
  const cy = o.cy ?? 330;
  const motes = [];
  for (let i = 0; i < 70; i++) {
    const x = R() * W;
    const y = R() * H * 0.9;
    const r = 0.6 + R() * 1.8;
    motes.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="#bfffe8" opacity="${n1(0.15 + R() * 0.5)}"/>`);
  }
  return {
    back: `
    <rect width="${W}" height="${H}" fill="#000"/>
    <radialGradient id="bgl" cx="0.5" cy="${cy / H}" r="0.6">
      <stop offset="0" stop-color="${tone}" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="${tone}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <rect width="${W}" height="${H}" fill="url(#bgl)"/>
    <g filter="url(#haze)" opacity="0.35"><rect x="-40" y="${H * 0.2}" width="${W + 80}" height="${H * 0.5}" fill="${tone}"/></g>`,
    front: `
    <g filter="url(#haze)" opacity="0.55"><rect x="-60" y="${H * 0.78}" width="${W + 120}" height="${H * 0.3}" fill="#9fc8c0"/></g>
    <g>${motes.join('')}</g>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
    </radialGradient>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>`,
  };
}

/** 원 목록 중 하나라도 품는 점인가 */
export function inside(blobs, x, y, k = 0.75) {
  return blobs.some((b) => Math.hypot(b.x - x, b.y - y) < b.r * k);
}
