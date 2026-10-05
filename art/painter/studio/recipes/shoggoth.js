// 쇼고스 (3층 수호자) — 무지갯빛 검은 원형질의 산. 거품이 빽빽하게 맞붙어 끓어오르는 거대한 덩어리,
// 앞쪽 처마에서 원형질이 늘어져 떨어지고, 표면 곳곳에서 녹색 고름 같은 눈이 생겨났다가 반쯤 가라앉는다.
// 아래쪽엔 가로로 찢긴 아가리(끈적한 실이 가로지르고, 어둠 속에서 눈이 내다본다), 옆구리와 꼭대기에선 마디진 위족.
// 몸은 덩어리(uA)를 녹여 붙이고, 거품은 보로노이 구 높이로 부풀린다. 눈은 JS에서 몸 표면에 투영해 눈꺼풀째 묻는다.
// protoplasm()은 쇼고스 유충·원형질 조각 레시피도 같이 쓴다 (자료만 다르고 셰이더는 같다).
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const len = (a) => Math.hypot(...a);
const nrm = (a) => {
  const l = len(a) || 1;
  return a.map((x) => x / l);
};
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
function bez(P, t) {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
}

/**
 * 원형질 생물 만들기.
 * o.body [x,y,z,r][], o.K 녹임, o.pods [p0,p1,p2,p3,w0,w1,n][], o.drips {x0,x1,n,y,z,l} | null,
 * o.maws [x,y,s,wide][], o.bigEyes [x,y,r,kind,sink][], o.eyeN, o.eyeBox [x0,x1,y0,y1], o.eyeR [min,max],
 * o.tipEyes 위족 번호[], o.tipR, o.sc 세부 크기(1 = 쇼고스), o.glow 속빛 배율, o.cam/target/fov/light/frame
 */
export function protoplasm(o) {
  const R = o.R;
  const K = o.K;
  const sc = o.sc ?? 1;
  const body = o.body;
  const NB = body.length;
  const sdBody = (p) => {
    let d = 1e5;
    for (const b of body) d = smin(d, len(sub(p, b)) - b[3], K);
    return d;
  };
  const grad = (p) => {
    const e = 0.002;
    return nrm(
      [0, 1, 2].map((j) => {
        const a = [...p];
        const b = [...p];
        a[j] += e;
        b[j] -= e;
        return sdBody(a) - sdBody(b);
      }),
    );
  };
  const project = (p) => {
    let q = [...p];
    for (let i = 0; i < 14; i++) q = add(q, grad(q), -sdBody(q));
    return q;
  };
  // 카메라에서 (x, y, 몸 가운데 평면)을 향해 쏜 광선이 처음 닿는 몸 표면 — 눈과 입이 보이는 쪽에 놓인다
  const cam = o.cam;
  const hit = (x, y) => {
    const dir = nrm(sub([x, y, o.midZ ?? 0.3], cam));
    let t = 0;
    for (let i = 0; i < 200; i++) {
      const q = add(cam, dir, t);
      const d = sdBody(q);
      if (d < 0.0005) return project(q);
      t += d * 0.9;
      if (t > 100) break;
    }
    return project([x, y, 3]);
  };

  // ── 위족: 마디마다 부풀었다 잘록해진다
  const chains = [];
  const tips = [];
  for (const [p0, p1, p2, p3, w0, w1, n = 12] of o.pods) {
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const pt = bez([p0, p1, p2, p3], t);
      const wob = 0.04 * sc * Math.sin(t * 13 + p0[0] * 3);
      const bead = 1 + 0.28 * Math.sin(t * 19 + p0[1] * 5) * (1 - t * 0.6) + (R() - 0.5) * 0.2;
      chains.push([pt[0] + wob, pt[1], pt[2] + wob, (w0 * Math.pow(1 - t, 0.85) + w1 * t) * bead]);
    }
    chains.push([0, 0, 0, 0]);
    tips.push(bez([p0, p1, p2, p3], 1));
  }
  // ── 처마에서 늘어져 떨어지는 원형질
  if (o.drips) {
    const { x0, x1, n: dn, y, z, l } = o.drips;
    for (let i = 0; i < dn; i++) {
      const x = x0 + ((x1 - x0) * i) / Math.max(1, dn - 1) + (R() - 0.5) * 0.15 * sc;
      const top = project([x, y + (R() - 0.5) * 0.4 * sc, z]);
      const ll = l * (0.45 + R());
      for (let j = 0; j < 4; j++) {
        const t = j / 3;
        chains.push([top[0] + (R() - 0.5) * 0.02 * sc, top[1] - 0.05 * sc - t * ll, top[2] - 0.05 * sc + t * 0.06 * sc, (j === 3 ? 0.03 + R() * 0.018 : 0.065 * (1 - t) + 0.014) * sc]);
      }
      chains.push([0, 0, 0, 0]);
    }
  }

  // ── 입: 몸 앞쪽에 벌어진 구멍 (중심, 크기 / 법선, 가로 찢김)
  const maws = [];
  for (const [x, y, s, wide] of o.maws) {
    const q = hit(x, y);
    const n = grad(q);
    maws.push([...q, s], [...n, wide]);
  }

  // ── 눈: 몸 표면에 투영해 반쯤 묻는다 (생겨나는 중인 눈, 가라앉는 눈)
  const eyes = [];
  const gaze = [];
  const tryEye = (pos0, r, kind, sink) => {
    const s = hit(pos0[0], pos0[1]);
    const n = grad(s);
    const c = add(s, n, r * sink);
    if (eyes.some((e) => len(sub(c, e)) < (e[3] + r) * 1.15)) return false;
    const inMaw = (m, w) => {
      const el = 1 + w * 0.75;
      const ax = w > 0 ? m[3] * 1.05 * el * 1.15 : m[3] * 0.95;
      const ay = w > 0 ? m[3] * 0.95 : m[3] * 1.05 * 1.15;
      return Math.abs(c[0] - m[0]) < ax + r && Math.abs(c[1] - m[1]) < ay + r && Math.abs(c[2] - m[2]) < m[3] * 2;
    };
    if (maws.some((m, i) => i % 2 === 0 && inMaw(m, maws[i + 1][3]))) return false;
    eyes.push([...c, r]);
    let g = add(nrm(sub(cam, c)), [(R() - 0.5) * 0.5, (R() - 0.5) * 0.4, 0]);
    if (R() < 0.18) g = add(n, [R() - 0.5, 0, 0]);
    gaze.push([...nrm(g), kind]);
    return true;
  };
  for (const [x, y, r, kind, sink] of o.bigEyes) tryEye([x, y, 3], r, kind, sink);
  const [bx0, bx1, by0, by1] = o.eyeBox;
  const [er0, er1] = o.eyeR;
  let tries = 0;
  while (eyes.length < o.eyeN && tries++ < 6000) {
    const x = bx0 + R() * (bx1 - bx0);
    const y = by0 + Math.pow(R(), 0.8) * (by1 - by0);
    const r = er0 + Math.pow(R(), 3.2) * (er1 - er0);
    const kr = R();
    const kind = (kr < 0.72 ? 0 : kr < 0.88 ? 2 : 1) + (R() < 0.4 ? 10 : 0);
    tryEye([x, y, 3.5], r, kind, -0.35 + R() * 0.55);
  }
  // 위족 끝의 눈 (눈꺼풀 없이)
  const NLID = eyes.length;
  for (const i of o.tipEyes ?? []) {
    const t = tips[i];
    eyes.push([t[0], t[1], t[2], o.tipR ?? 0.07]);
    gaze.push([...nrm(sub(cam, t)), 10]);
  }

  return {
    preset: 'act3',
    cam: { pos: cam, target: o.target, fov: o.fov ?? 1.75 },
    light: {
      key: [-0.45, 0.6, -0.75],
      keyCol: [0.95, 1.25, 1.6],
      fill: [0.7, 0.15, 0.7],
      fillCol: [0.1, 0.32, 0.22],
      amb: [0.015, 0.025, 0.035],
      rimCol: [0.6, 1.0, 1.25],
      rim: 2.3,
      glow: 0.06,
      eyeEmit: 1.9,
      exposure: 1.2,
      ...(o.light ?? {}),
    },
    frame: o.frame ?? { fill: 0.95, bottom: 0.02 },
    arrays: {
      uA: body,
      uB: chains,
      uE: eyes,
      uG: gaze,
      uP: [[NB, 0, K, maws.length / 2], ...maws, [NLID, sc, o.glow ?? 1, o.podK ?? 0.22 * sc]],
    },
    glsl: PROTO_GLSL,
  };
}

const PROTO_GLSL = /* glsl */ `
// 보로노이: (F1, F2-F1)
vec2 vor(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int k = 0; k < 27; k++) {
    vec3 o = vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) - 1.0;
    vec3 h = vec3(hash31(i + o), hash31(i + o + 17.3), hash31(i + o + 41.7));
    vec3 r = o + 0.15 + 0.7 * h - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}

// 거품 표면: 빽빽하게 맞붙은 구의 높이 (1 = 거품 꼭대기, 낮을수록 거품 사이 골)
float bub(vec3 x, float rad) {
  float f = min(vor(x).x / rad, 1.0);
  return sqrt(1.0 - f * f);
}

// 사슬을 몸에 하나씩 녹여 붙인다 (굵은 위족은 크게, 가는 실은 작게 녹인다)
float chainD(vec3 p, float d, float k) {
  for (int i = 0; i < 159; i++) {
    if (i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    float ki = clamp(max(a.w, b.w) * 1.1, 0.02, k);
    vec3 m = (a.xyz + b.xyz) * 0.5;
    float bound = length(p - m) - (length(a.xyz - b.xyz) * 0.5 + max(a.w, b.w));
    if (bound > d + ki) continue;
    d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), ki);
  }
  return d;
}

vec4 protoP() { return uP[1 + int(uP[0].w + 0.5) * 2]; }

vec2 sdf(vec3 p) {
  int nb = int(uP[0].x + 0.5);
  float k = uP[0].z;
  vec4 pp = protoP();
  float sc = pp.y;
  vec3 ps = p / sc;
  float d = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= nb) break;
    d = smin(d, length(p - uA[i].xyz) - uA[i].w, k);
  }
  // 눈 둘레가 눈꺼풀처럼 부풀어 오르고, 시선 쪽으로 구멍이 열린다 (일부는 반쯤 감겼다)
  int nlid = int(pp.x + 0.5);
  for (int i = 0; i < 48; i++) {
    if (i >= nlid) break;
    float r = uE[i].w;
    vec3 c = uE[i].xyz;
    if (length(p - c) > r * 3.0 + 0.1 * sc) continue;
    vec3 g = normalize(uG[i].xyz);
    float lid = min(0.9, hash31(c * 7.1 / sc) * 0.55 + smoothstep(0.1, 0.2, r / sc) * 0.5);
    d = smin(d, length(p - c) - r * 1.3, r * 0.9);
    float hole = length(p - (c + g * r * 0.95 - vec3(0.0, r * lid * 0.6, 0.0))) - r * (0.92 - lid * 0.3);
    d = smax(d, -min(length(p - c) - r * 1.03, hole), r * 0.18);
  }
  // 위족과 늘어진 원형질
  d = chainD(p, d, pp.w);
  // 끓어오르는 거품 덩어리: 크고 작은 거품이 빽빽하게 맞붙어 부풀었다 (눈 둘레는 매끈하게)
  if (d < 0.5 * sc) {
    float em = 1.0;
    for (int i = 0; i < 48; i++) {
      if (i >= uEN) break;
      em = min(em, smoothstep(uE[i].w * 1.1, uE[i].w * 2.6, length(p - uE[i].xyz)));
    }
    float bb = 0.2 * bub(ps * 1.25 + vec3(0.0, uSeed, 0.0), 0.95) + 0.075 * bub(ps * 3.3 + 7.3, 0.95) + 0.025 * bub(ps * 8.0 + 1.1, 0.95);
    d -= (bb - 0.22) * em * sc;
    d += 0.005 * sc * (fbm3(ps * 14.0) - 0.5);
  }
  // 입: 몸에 파인 구멍, 속은 빛을 먹는 어둠
  int nm = int(uP[0].w + 0.5);
  float inner = 1e5;
  for (int i = 0; i < 8; i++) {
    if (i >= nm) break;
    vec3 c = uP[1 + i * 2].xyz;
    float s = uP[1 + i * 2].w;
    vec3 n = uP[2 + i * 2].xyz;
    vec3 q = p - c;
    if (length(q) > s * 3.0) continue;
    // 입의 좌표: 세로로 찢긴 구멍 (wide > 0 이면 가로로 길게 찢긴 큰 아가리)
    float wide = uP[2 + i * 2].w;
    vec3 side = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
    vec3 up = cross(side, n);
    vec3 lq = vec3(dot(q, side), dot(q, up), dot(q, n));
    if (wide > 0.0) lq.xy = vec2(lq.y + 0.1 * s * sin(lq.x * 3.0 / s), lq.x);
    float el = 1.0 + wide * 0.75;
    float hole = sdEllipsoid(lq + vec3(0.0, 0.0, s * 0.2), vec3(s * 0.75, s * 1.05 * el, s * 0.85));
    d = smax(d, -hole, s * 0.35);
    inner = min(inner, sdEllipsoid(lq + vec3(0.0, 0.0, s * 0.75), vec3(s * 0.7, s * 0.95 * el, s * 0.6)));
    // 입을 가로지르는 끈적한 실: 제각각 기울고 처지며, 가운데가 가늘다
    int ns2 = wide > 0.0 ? 5 : 3;
    for (int j = 0; j < 5; j++) {
      if (j >= ns2) break;
      float fj = float(j);
      float h1 = hash31(vec3(fj, float(i), 2.0));
      float h2 = hash31(vec3(fj, float(i), 5.0));
      float h3 = hash31(vec3(fj, float(i), 9.0));
      float span = s * 1.05 * el * 0.85;
      float ya = (h1 * 2.0 - 1.0) * span;
      float yb = ya + (h2 - 0.5) * span * 0.9;
      vec3 a = vec3(-s * 0.72, ya, -s * 0.1 - h3 * s * 0.3);
      vec3 b = vec3(s * 0.68, yb, -s * 0.15 - h2 * s * 0.3);
      vec3 sag = wide > 0.0 ? vec3(s * (0.1 + 0.25 * h3), 0.0, s * 0.1) : vec3(0.0, s * 0.2, 0.0);
      vec3 m1 = mix(a, b, 0.33) - sag * 0.8;
      vec3 m2 = mix(a, b, 0.66) - sag * 0.8;
      float th = s * (0.018 + 0.02 * h1);
      float st = min(min(sdRoundCone(lq, a, m1, th * 2.2, th), sdRoundCone(lq, m1, m2, th, th * 0.8)), sdRoundCone(lq, m2, b, th * 0.8, th * 2.0));
      d = smin(d, st, s * 0.08);
    }
  }
  d = smax(d, -p.y, 0.05 * sc);
  vec2 r = vec2(d, 1.0);
  r = umin(r, vec2(inner, 99.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec4 pp = protoP();
  vec3 ps = p / pp.y;
  float gl = pp.z;
  // 검은 원형질: 기름막 무지개, 젖은 반사. 속에서 희미한 녹색 빛이 얼룩처럼 비친다
  float b1 = bub(ps * 1.25 + vec3(0.0, uSeed, 0.0), 0.95);
  vec3 alb = vec3(0.006, 0.009, 0.009) * (0.6 + 0.9 * fbm3(ps * 3.0));
  float patchy = smoothstep(0.55, 0.85, fbm3(ps * 0.9 + 3.0));
  vec3 emi = vec3(0.08, 0.6, 0.3) * patchy * (1.0 - b1 * 0.7) * 0.05 * gl;
  // 수없이 생겨났다 사라지는 작은 눈: 녹색 고름 같은 점, 일부는 가운데 세로 동공
  vec3 x2 = ps * 4.6 + 7.3;
  vec3 ci = floor(x2);
  vec3 cf = fract(x2) - 0.5;
  float hh = hash31(ci + 3.7);
  float pick = step(0.78, hh) * smoothstep(0.42, 0.6, noise(ps * 1.3 + 5.0));
  float rr = length(cf.xy * vec2(1.0, 0.8)) + abs(cf.z) * 0.5;
  float er = 0.1 + 0.12 * fract(hh * 7.3);
  float iris = smoothstep(er, er - 0.07, rr);
  float slit = smoothstep(0.035, 0.0, abs(cf.x)) * step(0.5, fract(hh * 13.0));
  emi += vec3(0.35, 1.0, 0.45) * iris * (1.0 - slit * 0.9) * pick * 0.55 * (0.4 + 0.6 * hash31(ci + 9.1)) * min(gl, 1.4);
  return Mat(alb, 0.08, 1.6, emi, 0.9, 0.0, 1.0);
}
`;

export default function shoggoth({ seed = 1 } = {}) {
  const R = rng(seed * 7919 + 13);
  // ── 몸: 넓게 퍼진 밑동 → 앞으로 기운 봉우리 → 앞쪽으로 넘어오는 처마
  const body = [
    [0.0, 0.7, -0.3, 1.75],
    [-1.5, 0.55, 0.1, 1.15],
    [1.6, 0.5, -0.1, 1.2],
    [-2.5, 0.3, 0.45, 0.62],
    [2.6, 0.3, 0.3, 0.6],
    [0.4, 0.4, 1.2, 0.95],
    [-0.9, 0.35, 1.35, 0.7],
    [-0.25, 1.9, -0.25, 1.45],
    [0.85, 1.75, 0.05, 1.05],
    [-1.1, 1.55, 0.1, 1.0],
    [-0.4, 2.9, 0.05, 1.05],
    [0.45, 2.75, 0.35, 0.85],
    [-0.75, 3.55, 0.3, 0.72],
    [-0.15, 3.85, 0.65, 0.6],
    [0.35, 3.45, 0.95, 0.62],
    [-0.95, 3.0, 0.85, 0.6],
    [0.95, 2.4, 0.8, 0.6],
    [-1.6, 2.35, 0.3, 0.62],
    [1.55, 1.2, 0.75, 0.55],
    [-0.4, 4.35, 0.2, 0.4],
    [-0.3, 3.75, 1.25, 0.5],
    [0.5, 3.3, 1.45, 0.45],
    [-1.0, 3.4, 1.2, 0.42],
    [0.25, 4.15, 0.45, 0.35],
  ];
  // 바닥에 퍼진 웅덩이
  for (let i = 0; i < 7; i++) {
    const a = -0.4 + (i / 6) * (Math.PI + 0.8) + (R() - 0.5) * 0.3;
    body.push([Math.cos(a) * (1.9 + R() * 0.5), 0.06, 0.5 + Math.sin(a) * 1.2, 0.32 + R() * 0.12]);
  }
  return protoplasm({
    R,
    K: 0.55,
    body,
    pods: [
      // 왼쪽 위로 크게 솟는 것
      [[-1.2, 3.0, 0.2], [-2.4, 3.6, 0.3], [-3.0, 5.0, 0.6], [-2.35, 5.7, 1.0], 0.36, 0.035, 14],
      // 오른쪽으로 뻗어 내려오는 것
      [[1.3, 2.3, 0.2], [2.6, 2.8, 0.4], [3.4, 2.0, 1.0], [3.1, 0.9, 1.6], 0.34, 0.04, 13],
      // 오른쪽 위 높이 휘는 것
      [[0.5, 3.6, 0.3], [1.4, 4.6, 0.1], [2.4, 5.0, 0.6], [2.5, 4.2, 1.2], 0.26, 0.03, 13],
      // 왼쪽 아래 땅을 짚는 것
      [[-1.9, 1.2, 0.6], [-3.0, 1.5, 1.1], [-3.5, 0.6, 1.6], [-3.3, 0.08, 2.0], 0.3, 0.06, 12],
      // 꼭대기에서 뒤로 휘는 가는 것
      [[-0.3, 4.3, 0.1], [-0.6, 5.2, -0.3], [-1.3, 5.6, -0.1], [-1.5, 5.1, 0.4], 0.17, 0.02, 11],
      // 오른쪽 아래 앞으로 기어 나오는 것
      [[1.8, 0.7, 0.9], [2.4, 0.5, 1.9], [1.9, 0.35, 2.6], [1.2, 0.12, 3.0], 0.26, 0.05, 11],
      // 왼쪽 꼭대기에서 앞으로 굽어 내려다보는 것
      [[-1.0, 3.8, 0.5], [-1.5, 4.9, 1.2], [-0.9, 5.1, 2.1], [-0.6, 4.4, 2.5], 0.2, 0.03, 12],
    ],
    drips: { x0: -1.25, x1: 1.2, n: 6, y: 3.25, z: 2.6, l: 0.8 },
    maws: [
      [0.25, 1.32, 0.5, 1.4],
      [-1.25, 1.95, 0.3, 0],
      [1.45, 2.35, 0.22, 0],
      [1.75, 0.95, 0.2, 0],
      [-1.55, 2.95, 0.18, 0],
    ],
    bigEyes: [
      [0.55, 3.0, 0.22, 0, -0.05],
      [-0.55, 2.35, 0.17, 0, -0.2],
      [-0.2, 3.85, 0.12, 0, -0.05],
      [1.15, 1.55, 0.15, 0, -0.15],
    ],
    eyeN: 44,
    eyeBox: [-2.3, 2.3, 0.25, 4.45],
    eyeR: [0.05, 0.17],
    tipEyes: [0, 6],
    cam: [1.0, 0.3, 15.5],
    target: [0.0, 2.6, 0.4],
  });
}
