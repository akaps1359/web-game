// 고대인 해부학자 (3층 정예) — 얼음 속에서 먼저 깨어난 고대인. 깨어나자마자 탐사대의 천막에서 사람과 개를 갈라 보았다.
// 다섯 갈래 촉수 팔을 펼쳐 들었고, 팔 끝마다 가는 덩굴손이 탐사대의 메스를 쥐었다. 날은 피에 젖어 번들거린다.
// 막날개는 반쯤 접어 등 뒤로 세웠고, 별 머리를 앞으로 숙여 다섯 눈으로 당신을 살핀다. 몸통엔 핏자국.
// 몸은 awakened-elder.js의 elderThing()을 쓴다.
const { elderThing } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/awakened-elder.js?t=${Date.now()}`);

const f4 = (x) => (+x).toFixed(4);
const v3 = (a) => `vec3(${a.map(f4).join(', ')})`;

export default function elderVivisector({ seed = 1 } = {}) {
  const arm = (a, y, tip, w) => (t) => {
    const d = [Math.cos(a), 0, Math.sin(a)];
    const p0 = [d[0] * 0.36, y, d[2] * 0.36];
    const p1 = [d[0] * 0.8, y + 0.25, d[2] * 0.8 + 0.15];
    const m = 1 - t;
    const b = [0, 1, 2].map((i) => m * m * p0[i] + 2 * m * t * p1[i] + t * t * tip[i]);
    return [b[0] + Math.sin(t * 6 + a) * w, b[1] + Math.cos(t * 5 + a) * w, b[2] + Math.sin(t * 4 + a) * w * 0.6];
  };
  const defs = [
    [Math.PI / 2 + 1.2, 1.3, [-1.25, 2.2, 0.55], 0.06],
    [Math.PI / 2 - 1.2, 1.32, [1.2, 2.35, 0.5], 0.06],
    [Math.PI / 2 + 0.45, 1.25, [-0.8, 0.95, 1.0], 0.05],
    [Math.PI / 2 - 0.5, 1.22, [0.9, 0.85, 0.95], 0.05],
    [Math.PI / 2 + 2.4, 1.18, [-1.1, 1.0, 0.45], 0.05],
  ];
  const arms = defs.map(([a, y, tip, w]) => ({ path: arm(a, y, tip, w), fingers: 'scalpel' }));
  // 메스: 팔 끝 방향으로
  const blades = arms.map((am) => {
    const t1 = am.path(1);
    const t0 = am.path(0.9);
    const d = t1.map((v, i) => v - t0[i]);
    const l = Math.hypot(...d);
    return [t1, d.map((v) => v / l)];
  });
  const bladeSdf = blades.map(([p, d], i) => `  bl = min(bl, scalpel(q, ${v3(p.map((v, k) => v + d[k] * 0.06))}, ${v3(d)}, ${i}.0, met));`).join('\n');
  return elderThing({
    seed: seed + 11,
    origin: [0, 0, 0],
    rot: [-0.35, 0.0, 0.0],
    scale: 1.0,
    arms,
    wings: [
      { a: Math.PI / 2 - (3 * Math.PI) / 5 + 0.15, y: 1.55, len: 1.25, phi0: 0.55, phi1: 1.75, back: 1.2, lift: 0.1 },
      { a: Math.PI / 2 + (3 * Math.PI) / 5 - 0.15, y: 1.55, len: 1.2, phi0: 0.6, phi1: 1.7, back: 1.2, lift: 0.1 },
    ],
    head: { tilt: 0.85, stalk: 0.3 },
    footReach: 0.85,
    footR: 0.095,
    ice: 0.25,
    frostTop: 0.9,
    wet: 0.55,
    wingGlow: 0.55,
    cam: { pos: [-0.6, 0.55, 8.8], target: [0, 1.4, 0], fov: 1.75 },
    light: { key: [0.3, 0.6, -0.75], rim: 2.1, pt: [0.0, 2.3, 1.6], ptCol: [0.35, 0.5, 0.45] },
    extraGlsl: `
/** 메스: 손잡이 + 끝이 휜 날 (몸 좌표). met: 0 손잡이 1 날 */
float scalpel(vec3 q, vec3 o, vec3 d, float i, inout float met) {
  vec3 side = normalize(cross(d, vec3(0.0, 1.0, 0.3)));
  vec3 up = cross(side, d);
  vec3 lq = q - o;
  vec3 l = vec3(dot(lq, side), dot(lq, up), dot(lq, d));
  float handle = sdRoundBox(l - vec3(0.0, 0.0, -0.01), vec3(0.011, 0.014, 0.065), 0.005);
  float t = clamp((l.z - 0.05) / 0.26, 0.0, 1.0);
  float w = mix(0.028, 0.004, t * t) + 0.012 * sin(t * 3.14159);
  float blade = max(sdBox(vec3(l.x, l.y - w * 0.5 + 0.006 - 0.035 * t * t, l.z - 0.18), vec3(0.0025, w, 0.13)), -l.z + 0.05);
  if (blade < handle) met = 1.0;
  return min(handle, blade);
}
`,
    extraSdf: `
  {
    float met = 0.0;
    float bl = 1e5;
${bladeSdf}
    r = umin(r, vec2(bl * SCALE, met > 0.5 ? 31.0 : 30.0));
  }
`,
    extraMat: `
  if (id > 29.5) {
    float tipB = smoothstep(0.35, 0.8, noise(q * 30.0));
    if (id > 30.5) {
      // 피 묻은 강철 날
      float blood = smoothstep(0.35, 0.65, noise(q * 45.0 + 2.0));
      vec3 alb = mix(vec3(0.16, 0.17, 0.18), vec3(0.09, 0.006, 0.004), blood * 0.85);
      vec3 V = normalize(uCamPos - pw);
      float edgeGlint = pow(1.0 - abs(dot(n, V)), 3.0);
      return Mat(alb, mix(0.1, 0.3, blood), mix(2.0, 1.2, blood), vec3(0.35, 0.45, 0.5) * edgeGlint * (1.0 - blood) * 0.6, 0.0, 0.0, mix(0.6, 1.0, blood));
    }
    return Mat(vec3(0.03, 0.028, 0.025), 0.4, 0.6, vec3(0.0), 0.0, 0.0, 0.2);
  }
  // 몸에 튄 핏자국 (팔과 몸통 앞쪽)
  float splat = smoothstep(0.62, 0.8, fbm3(q * 5.0 + 11.0)) * smoothstep(0.0, 0.3, q.z) * step(id, 2.5);
  if (splat > 0.01) {
    return Mat(vec3(0.06, 0.004, 0.004), 0.15, 1.2, vec3(0.0), 0.0, 0.2, 1.0);
  }
`,
  });
}
