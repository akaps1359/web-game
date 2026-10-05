// 별의 유충 (4층 하수인) — 별의 자손 군주가 낳는 유충. 마디진 구더기 몸이 반쯤 몸을 일으키고,
// 반투명한 검푸른 살갗 속으로 별빛 같은 청록 점들이 비친다. 앞끝은 작은 촉수들이 둘러싼 둥근 입 — 군주를 닮았다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, s) => a.map((x) => x * s);

export default function starLarva({ seed = 1 } = {}) {
  const R = rng(seed * 733 + 9);
  const uB = [];
  // 몸: 꼬리는 바닥에 말리고, 앞은 일어선다. 마디마다 부풀었다 조여진다
  const P = [
    [0.75, 0.16, -0.55],
    [-0.45, 0.1, -0.35],
    [-0.35, 0.55, 0.35],
    [0.0, 1.0, 0.75],
  ];
  const N = 17;
  const body = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const seg = i % 2 === 0 ? 1.0 : 0.78;
    const r = (0.08 + 0.2 * Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.85 + 0.15)) * seg;
    body.push([...bez(P, t), r]);
  }
  for (const b of body) uB.push(b);
  uB.push([0, 0, 0, 0]);
  const head = body[N - 1].slice(0, 3);
  const dir = (() => {
    const d = sub(head, body[N - 3].slice(0, 3));
    const l = Math.hypot(...d);
    return mul(d, 1 / l);
  })();
  // 입 둘레의 작은 촉수 고리
  const up = [0, 1, 0];
  const side = [dir[2], 0, -dir[0]];
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2;
    const off = add(mul(side, Math.cos(a) * 0.1), mul(up, Math.sin(a) * 0.1));
    const s = add(head, add(off, mul(dir, 0.04)));
    const len = 0.12 + R() * 0.14;
    const e = add(s, add(mul(dir, len), mul(off, 1.6 + R() * 1.2)));
    uB.push([...s, 0.013], [...add(lerpMid(s, e), mul(off, 0.5)), 0.008], [...e, 0.003]);
    uB.push([0, 0, 0, 0]);
  }
  function lerpMid(a, b) {
    return a.map((x, i) => (x + b[i]) / 2);
  }
  const uA = [[...head, 0.075], [...dir, 0]];
  // 몸속에서 비치는 별빛
  const uL = [];
  const uLC = [];
  for (let i = 2; i < N - 1; i += 3) {
    const b = body[i];
    uL.push([b[0] + (R() - 0.5) * 0.1, b[1] + b[3] * 0.3, b[2] + b[3] * 0.5, 0.025 + R() * 0.02]);
    uLC.push([0.55, 1.0, 0.9, 0.5]);
  }

  return {
    preset: 'act4',
    cam: { pos: [1.4, 0.75, 5.2], target: [0.1, 0.5, 0], fov: 1.8 },
    light: { key: [-0.45, 0.7, -0.6], fillCol: [0.1, 0.08, 0.15], amb: [0.02, 0.022, 0.03], rim: 1.7, exposure: 1.3 },
    frame: { fill: 0.86, bottom: 0.04 },
    arrays: { uA, uB, uL, uLC },
    glsl: /* glsl */ `
vec2 sdf(vec3 p) {
  float d = chains(p, 0.05);
  // 마디 사이 조임 주름
  d += 0.008 * (0.5 - ridge(p * 14.0));
  vec2 r = vec2(d, 1.0);
  // 둥근 입: 앞끝을 파내고 속은 어둠
  vec3 hq = p - uA[0].xyz;
  float mouth = length(hq - uA[1].xyz * 0.06) - uA[0].w;
  r.x = smax(r.x, -mouth, 0.02);
  r = umin(r, vec2(length(hq - uA[1].xyz * 0.0) - uA[0].w * 0.85, 99.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 6.0);
  float specks = smoothstep(0.93, 0.98, noise(p * 26.0));
  vec3 alb = mix(vec3(0.012, 0.028, 0.032), vec3(0.03, 0.065, 0.065), g);
  vec3 emi = vec3(0.45, 1.0, 0.9) * specks * 0.5 + vec3(0.1, 0.35, 0.32) * smoothstep(0.5, 0.8, g) * 0.12;
  return Mat(alb, 0.25, 1.0, emi, 0.2, 0.8, 0.85);
}
`,
  };
}
