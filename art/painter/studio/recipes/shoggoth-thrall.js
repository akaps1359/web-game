// 쇼고스 노예 (3층 하수인) — 원로가 피리 소리로 부리는 원형질의 노예. 아주 오래전에도 그랬다.
// 기름막이 무지갯빛으로 도는 검은 원형질 덩어리가 앞으로 무너지듯 밀려온다. 거품이 끓어오르고,
// 몸 곳곳에 초록 빛 고름 같은 눈들이 생겼다 사라진다. 위족 둘이 앞으로 뻗어 바닥을 짚었고,
// 가운데엔 입이 될 구멍이 벌어진다. 옆구리엔 고대인이 새긴 다섯 갈래 별 낙인이 희미하게 빛난다 — 주인의 표식.
import { rng } from '../../lib.js';

export default function shoggothThrall({ seed = 1 } = {}) {
  const R = rng(seed * 811 + 23);
  const A = [];
  // 몸: 아래가 넓게 퍼진 덩어리, 앞으로 쏠렸다
  const core = [
    [0, 0.55, 0, 0.62],
    [-0.5, 0.45, -0.1, 0.5],
    [0.52, 0.48, -0.05, 0.5],
    [0.05, 1.05, -0.05, 0.55],
    [-0.4, 1.0, 0.0, 0.4],
    [0.42, 1.08, 0.0, 0.4],
    [0.0, 1.5, 0.12, 0.42],
    [-0.3, 1.72, 0.25, 0.3],
    [0.3, 1.78, 0.3, 0.32],
    [0.0, 1.9, 0.45, 0.26],
    [-0.85, 0.25, 0.15, 0.32],
    [0.9, 0.25, 0.1, 0.33],
    [0.0, 0.3, 0.5, 0.36],
    [-0.4, 0.3, 0.45, 0.28],
    [0.45, 0.3, 0.45, 0.28],
  ];
  for (const c of core) A.push(c);
  // 표면의 거품
  for (let i = 0; i < 300 && A.length < 50; i++) {
    const a = R() * Math.PI * 2;
    const el = (R() - 0.25) * 1.3;
    const rr = 0.62 + R() * 0.18;
    const p = [Math.cos(a) * rr * Math.cos(el) * 1.15, 0.85 + Math.sin(el) * rr * 1.5, Math.sin(a) * rr * Math.cos(el) * 0.85 + 0.1];
    if (p[1] < 0.06) continue;
    A.push([...p, 0.05 + Math.pow(R(), 2) * 0.16]);
  }
  const nBlob = A.length;
  // 위족 (uB)
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const pods = [
    [
      [0.55, 0.7, 0.35],
      [0.95, 0.55, 0.7],
      [1.2, 0.25, 0.95],
      [1.3, 0.05, 1.05],
    ],
    [
      [-0.5, 0.75, 0.3],
      [-0.95, 0.65, 0.6],
      [-1.15, 0.35, 0.85],
      [-1.25, 0.06, 0.9],
    ],
    [
      [0.25, 1.3, 0.1],
      [0.5, 1.55, 0.35],
      [0.75, 1.5, 0.55],
      [0.85, 1.3, 0.7],
    ],
  ];
  for (const pd of pods) {
    const N = 8;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const m = 1 - t;
      const b = [0, 1, 2].map((k) => m * m * m * pd[0][k] + 3 * m * m * t * pd[1][k] + 3 * m * t * t * pd[2][k] + t * t * t * pd[3][k]);
      ch.push([...b, 0.17 * Math.pow(1 - t, 0.8) + 0.035]);
    }
    brk();
  }
  // 눈: 표면 위 (고름처럼 부푼 것, 반쯤 묻힌 것)
  const cam = [0.5, 0.6, 7.0];
  const eyes = [];
  const gaze = [];
  const smin = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  const field = (p) => {
    let d = 1e5;
    for (let i = 0; i < nBlob; i++) {
      const b = A[i];
      d = smin(d, Math.hypot(p[0] - b[0], p[1] - b[1], p[2] - b[2]) - b[3], b[3] < 0.25 ? 0.07 : 0.25);
    }
    return d;
  };
  for (let i = 0; i < 900 && eyes.length < 36; i++) {
    const o = [(R() - 0.5) * 0.4, 0.55 + R() * 1.1, 0.0];
    const a = (R() - 0.5) * Math.PI * 1.4 + Math.PI / 2;
    const el = (R() - 0.4) * 1.3;
    const dir = [Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)];
    if (dir[2] < 0.05) continue;
    let t0 = 0;
    let t1 = 2.5;
    for (let k = 0; k < 30; k++) {
      const tm = (t0 + t1) / 2;
      if (field(o.map((v, j) => v + dir[j] * tm)) < 0) t0 = tm;
      else t1 = tm;
    }
    const er0 = 0.016 + Math.pow(R(), 2.5) * 0.075;
    const p = o.map((v, j) => v + dir[j] * (t0 - er0 * 0.35));
    if (p[1] < 0.18) continue;
    if (eyes.some((e) => Math.hypot(e[0] - p[0], e[1] - p[1], e[2] - p[2]) < 0.13)) continue;
    if (Math.hypot(p[0] - 0.02, p[1] - 0.95) < 0.28 && p[2] > 0.3) continue;
    eyes.push([...p, er0]);
    const g = [cam[0] - p[0] + (R() - 0.5) * 3, cam[1] - p[1] + (R() - 0.5) * 2, cam[2] - p[2]];
    const l = Math.hypot(...g);
    gaze.push([g[0] / l, g[1] / l, g[2] / l, R() < 0.7 ? 0 : 10]);
  }
  return {
    preset: 'act3',
    cam: { pos: cam, target: [0.0, 1.0, 0.0], fov: 1.85 },
    light: {
      key: [-0.35, 0.65, -0.68],
      rim: 2.0,
      fillCol: [0.04, 0.07, 0.07],
      amb: [0.01, 0.014, 0.016],
      exposure: 1.25,
      eyeEmit: 1.5,
      glow: 0.045,
      pt: [0.0, 0.5, 1.3],
      ptCol: [0.06, 0.18, 0.1],
    },
    frame: { fill: 0.93 },
    arrays: { uA: A, uB: ch, uE: eyes, uG: gaze, uP: [[nBlob, 0, 0, 0]] },
    glsl: /* glsl */ `
float starBrand(vec2 p, float r) {
  // 다섯 갈래 별 (선)
  float a = atan(p.y, p.x);
  float rr = length(p);
  float k = 6.2831853 / 5.0;
  float a2 = mod(a + 1.5708, k) - k * 0.5;
  vec2 q = rr * vec2(cos(a2), abs(sin(a2)));
  // 별 윤곽: 꼭짓점 (r,0), 안쪽 꼭짓점
  vec2 v1 = vec2(r, 0.0);
  vec2 v2 = vec2(r * 0.4 * cos(k * 0.5), r * 0.4 * sin(k * 0.5));
  vec2 e = v2 - v1;
  vec2 w = q - v1;
  float h = clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
  return length(w - e * h);
}

vec2 sdf(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= int(uP[0].x)) break;
    vec4 b = uA[i];
    float k = b.w < 0.25 ? 0.07 : 0.25;
    d = smin(d, length(p - b.xyz) - b.w, k);
  }
  d = smin(d, chains(p, 0.03), 0.18);
  // 바닥에 퍼져 고인 원형질
  // 입이 될 구멍
  vec3 mq = p - vec3(0.02, 0.95, 0.62);
  float mouth = sdEllipsoid(mq, vec3(0.2, 0.13, 0.18));
  d = smax(d, -mouth, 0.08);
  // 끓는 표면
  d += 0.012 * (noise(p * 5.0 + vec3(0.0, uSeed, 0.0)) - 0.5) + 0.005 * (fbm3(p * 14.0) - 0.5);
  vec2 r = vec2(d, 1.0);
  r = umin(r, vec2(sdEllipsoid(mq + vec3(0.0, 0.0, 0.05), vec3(0.16, 0.1, 0.14)), 99.0));
  // 입 속의 이빨 같은 돌기
  float th = 1e5;
  for (int i = 0; i < 8; i++) {
    float a = float(i) / 8.0 * 6.2831853;
    vec3 c = vec3(0.02, 0.95, 0.55) + vec3(cos(a) * 0.16, sin(a) * 0.1, 0.0);
    th = min(th, sdRoundCone(p, c, c - vec3(cos(a) * 0.08, sin(a) * 0.05, 0.03), 0.018, 0.002));
  }
  r = umin(r, vec2(th, 2.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검은 원형질: 기름막 무지개, 젖은 반사. 초록 고름 같은 빛망울이 피었다 진다
    float cell = noise(p * 24.0 + vec3(3.0, 1.0, uSeed));
    float pus = smoothstep(0.9, 0.97, cell) * smoothstep(0.5, 0.75, noise(p * 2.5 + 5.0));
    vec3 emi = vec3(0.25, 0.9, 0.35) * pus * 0.18 + vec3(0.03, 0.1, 0.05) * smoothstep(0.5, 0.8, noise(p * 3.0 + 1.0)) * 0.2;
    // 다섯 갈래 별 낙인 (왼쪽 옆구리)
    vec3 bq = p - vec3(-0.62, 0.95, 0.4);
    vec2 sp = vec2(dot(bq, normalize(vec3(0.8, 0.0, 0.6))), bq.y);
    float st = starBrand(sp, 0.17);
    float brand = smoothstep(0.016, 0.004, st) * smoothstep(0.3, 0.1, length(bq));
    emi += vec3(0.35, 1.0, 0.55) * brand * 0.35;
    vec3 alb = vec3(0.008, 0.011, 0.01) * (0.7 + 0.6 * fbm3(p * 4.0));
    alb = mix(alb, vec3(0.04, 0.07, 0.04), brand);
    return Mat(alb, 0.08, 1.4, emi, 0.85, 0.15, 1.0);
  }
  return Mat(vec3(0.06, 0.07, 0.05), 0.3, 0.8, vec3(0.0), 0.3, 0.2, 0.8);
}
`,
  };
}
