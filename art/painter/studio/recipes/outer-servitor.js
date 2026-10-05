// 외신의 시종 (4층 일반) — 외신의 옥좌 곁에서 피리를 부는 시종. 두꺼비처럼 낮게 웅크린 형체 없는 덩어리,
// 끈적하게 번들거리는 올리브빛 검은 살, 얼굴 전체를 가로지르는 입술 없는 아가리(속은 빛을 먹는 어둠, 산성 침이 늘어진다).
// 등에서는 뼈 오르간 관들이 솟아 그 구멍에서 산성 초록빛이 샌다. 아가리 위로 작은 눈들이 몰려 있다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);

function chainKit() {
  const uB = [];
  const groups = [];
  let cur = null;
  return {
    uB,
    begin(mat, k) {
      cur = { i0: uB.length, mat, k };
    },
    end() {
      cur.i1 = uB.length;
      const pts = uB.slice(cur.i0, cur.i1).filter((q) => q[3] > 0);
      const c = mul(pts.reduce((s, q) => add(s, q), [0, 0, 0]), 1 / pts.length);
      cur.c = c;
      cur.r = Math.max(...pts.map((q) => Math.hypot(...sub(q.slice(0, 3), c)) + q[3]));
      groups.push(cur);
    },
    line(pts) {
      for (const q of pts) uB.push(q);
      uB.push([0, 0, 0, 0]);
      return pts;
    },
    tube(P, n, r0, r1, pw = 1) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push([...bez(P, t), r0 + (r1 - r0) * Math.pow(t, pw)]);
      }
      return this.line(pts);
    },
    uP() {
      const n = groups.length;
      return [[n, 0, 0, 0], ...groups.map((g) => [...g.c, g.r]), ...groups.map((g) => [g.i0, g.i1, g.k, g.mat])];
    },
  };
}

const CHAIN_GLSL = /* glsl */ `
vec2 chainSet(vec3 p) {
  vec2 res = vec2(1e5, 1.0);
  int ng = int(uP[0].x + 0.5);
  for (int g = 0; g < ng; g++) {
    vec4 bs = uP[1 + g];
    vec4 gi = uP[1 + ng + g];
    float k = gi.z;
    float d = length(p - bs.xyz) - bs.w;
    if (d < k + 0.25) {
      d = 1e5;
      int i1 = int(gi.y + 0.5) - 1;
      for (int i = int(gi.x + 0.5); i < i1; i++) {
        vec4 a = uB[i];
        vec4 b = uB[i + 1];
        if (a.w <= 0.0 || b.w <= 0.0) continue;
        d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
      }
    }
    res = usmin(res, vec2(d, gi.w), max(k, 0.03));
  }
  return res;
}
`;

export default function servitor({ seed = 1 } = {}) {
  const R = rng(seed * 1597 + 23);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };

  // ── 몸 (재질 1): 낮고 넓게 퍼진 덩어리 + 불룩한 혹들
  K.begin(1, 0.3);
  K.line([[-0.55, 0.55, -0.2, 0.5], [0.0, 0.85, -0.1, 0.72], [0.55, 0.6, -0.15, 0.5]]);
  K.line([[0.0, 1.25, -0.25, 0.48], [0.05, 1.55, -0.35, 0.3]]);
  for (let i = 0; i < 7; i++) {
    const a = R() * Math.PI * 2;
    const y = 0.5 + R() * 0.9;
    const rr = 0.22 + R() * 0.12;
    K.line([[Math.cos(a) * 0.5, y, Math.sin(a) * 0.4 - 0.2, rr], [Math.cos(a) * 0.62, y - 0.08, Math.sin(a) * 0.5 - 0.2, rr * 0.8]]);
  }
  K.end();
  // ── 앞발 (재질 1): 양옆으로 벌려 땅을 짚은 두꺼비 팔, 물갈퀴 긴 손가락
  K.begin(1, 0.08);
  const handsAt = [];
  for (const s of [-1, 1]) {
    const sh = [s * 0.62, 0.75, 0.25];
    const el = [s * 1.08, 0.62, 0.45];
    const wr = [s * 1.12, 0.14, 0.62];
    K.line([[...sh, 0.24], [...el, 0.15], [...wr, 0.1]]);
    handsAt.push([s, wr]);
  }
  // 뒷다리 (접힌 개구리 다리)
  for (const s of [-1, 1]) {
    K.line([[s * 0.65, 0.45, -0.45, 0.3], [s * 1.0, 0.35, -0.2, 0.17], [s * 0.95, 0.1, 0.12, 0.1]]);
  }
  K.end();
  K.begin(1, 0.02);
  for (const [s, wr] of handsAt) {
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.4 + s * 0.2;
      const tip = add(wr, [Math.sin(a) * 0.32, -0.1, Math.cos(a) * 0.3]);
      K.line([[...wr, 0.06], [...add(wr, [Math.sin(a) * 0.17, -0.04, Math.cos(a) * 0.16]), 0.035], [...tip, 0.012]]);
    }
  }
  K.end();
  // ── 등의 뼈 오르간 관 (재질 2): 뒤로 기울어 솟는다
  const pipes = [];
  K.begin(2, 0.04);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.2 + (R() - 0.5) * 0.05;
    const base = [x, 1.25 - Math.abs(x) * 0.4, -0.45];
    const h = 0.75 + (2 - Math.abs(i - 2)) * 0.25 + R() * 0.15;
    const top = add(base, [x * 0.35, h, -0.25 - R() * 0.1]);
    const r = 0.065 + (2 - Math.abs(i - 2)) * 0.01;
    K.line([[...base, r * 1.4], [...add(base, mul(sub(top, base), 0.5)), r], [...add(base, mul(sub(top, base), 0.9)), r * 1.05], [...top, r * 1.55]]);
    pipes.push([top, r]);
  }
  K.end();
  // ── 아가리에서 늘어진 산성 침 (재질 3, 빛남)
  K.begin(3, 0.01);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.18 + (R() - 0.5) * 0.06;
    const s0 = [x, 0.72, 0.7 - Math.abs(x) * 0.3];
    const len = 0.12 + R() * 0.38;
    K.line([[...s0, 0.009], [...add(s0, [0.01, -len * 0.6, 0.01]), 0.005], [...add(s0, [0.0, -len, 0.02]), 0.01]]);
  }
  K.end();

  // 작은 눈들: 아가리 위에 몰려 있다 (초록, 몇은 작게)
  const uE = [];
  const uG = [];
  const eyeSpots = [
    [-0.18, 1.12, 0.6, 0.05],
    [0.16, 1.15, 0.6, 0.045],
    [-0.36, 1.04, 0.52, 0.03],
    [0.33, 1.06, 0.52, 0.035],
    [0.0, 1.24, 0.55, 0.028],
    [-0.05, 1.05, 0.66, 0.022],
  ];
  for (const e of eyeSpots) {
    uE.push(e);
    uG.push([e[0] * 0.5, -0.2, 1, 0]);
  }
  // 관 끝의 산성 빛
  const PIPEB = PB.length;
  for (const [t, r] of pipes) PB.push([...t, r]);
  const uL = [];
  const uLC = [];
  for (const [t, r] of pipes) {
    uL.push([...add(t, [0, 0.02, 0]), r * 0.9]);
    uLC.push([0.75, 1.0, 0.35, 0.8]);
  }

  const P = {
    skin: prm([0.035, 0.042, 0.022, 0.35]),
    skin2: prm([0.09, 0.1, 0.05, 0.0]),
    bone: prm([0.085, 0.08, 0.06, 0.45]),
    acid: prm([0.7, 1.0, 0.3, 1.4]),
    maw: prm([0.0, 0.82, 0.55, 0.0]), // 아가리 중심
    mawr: prm([0.62, 0.17, 0.4, 0.0]), // 아가리 반지름
    pc: prm([5, 0, 0, 0]),
  };

  return {
    preset: 'act4',
    cam: { pos: [2.9, 1.35, 6.9], target: [0.0, 0.9, 0], fov: 1.75 },
    light: { key: [-0.45, 0.6, -0.65], fillCol: [0.1, 0.08, 0.14], amb: [0.02, 0.022, 0.02], rim: 1.8, exposure: 1.3, eyeEmit: 1.6, pt: [0.0, 0.5, 1.0], ptCol: [0.25, 0.45, 0.08] },
    frame: { fill: 0.92, bottom: 0.025 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uE, uG, uL, uLC },
    glsl: /* glsl */ `
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  // ── 입술 없는 아가리: 얼굴을 가로질러 크게 파내고 속은 어둠
  vec3 mq = p - ${P.maw}.xyz;
  vec3 mr = ${P.mawr}.xyz;
  mq.y += 0.12 * mq.x * mq.x;
  float maw = sdEllipsoid(mq, mr);
  if (r.y < 1.5) r.x = smax(r.x, -maw, 0.05);
  r = umin(r, vec2(sdEllipsoid(mq + vec3(0.0, 0.0, 0.1), mr * vec3(0.95, 0.85, 0.8)), 99.0));
  // 혹투성이 끈적한 살 (몸에만)
  // 이빨: 아가리 가장자리를 따라 안쪽을 향한 가는 바늘
  {
    float th = atan(mq.y / mr.y, mq.x / mr.x);
    float seg = 6.2831853 / 17.0;
    float a0 = (floor(th / seg) + 0.5) * seg;
    float h = fract(sin(floor(th / seg) * 12.9898) * 43758.5453);
    vec3 tb = vec3(cos(a0) * mr.x * 0.97, sin(a0) * mr.y * 0.97, mr.z * 0.25);
    vec3 tt = vec3(cos(a0 + (h - 0.5) * 0.15) * mr.x * mix(0.88, 0.62, h), sin(a0) * mr.y * mix(0.7, 0.2, h), mr.z * 0.3);
    float tooth = sdRoundCone(mq, tb, tt, 0.022, 0.003);
    r = umin(r, vec2(tooth, 4.0));
  }
  // 오르간 관 끝: 속을 파낸다 (반복 횟수는 uniform)
  int np = int(${P.pc}.x + 0.5);
  for (int i = 0; i < np; i++) {
    vec4 t = uA[${PIPEB} + i];
    float cup = sdSphere(p - t.xyz - vec3(0.0, 0.05, 0.0), t.w * 1.3);
    r.x = smax(r.x, -cup, 0.02);
  }
  float amp = r.y < 1.5 ? 1.0 : 0.15;
  r.x += amp * (0.05 * (fbm3(p * 4.0) - 0.5) + 0.012 * (0.5 - ridge(p * 11.0)));
  r.x *= 0.85;
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 4.0);
  vec4 S = ${P.skin};
  vec3 alb = mix(S.rgb, ${P.skin2}.rgb, smoothstep(0.5, 0.75, g)) * (0.7 + 0.6 * g);
  float rough = S.a, spec = 1.0, irid = 0.25, sss = 0.4, wet = 0.9;
  vec3 emi = vec3(0.0);
  // 아가리 가장자리에서 번지는 산성 빛
  vec3 mq = p - ${P.maw}.xyz;
  mq.y += 0.12 * mq.x * mq.x;
  float lip = smoothstep(0.06, 0.0, abs(sdEllipsoid(mq, ${P.mawr}.xyz)));
  emi += ${P.acid}.rgb * 0.02 * lip * (0.5 + noise(p * 12.0));
  if (id > 3.5) {
    alb = vec3(0.12, 0.11, 0.08); rough = 0.3; spec = 1.0; irid = 0.0; sss = 0.3; wet = 0.8; emi = vec3(0.0);
  } else if (id > 2.5) {
    alb = vec3(0.1, 0.14, 0.04); rough = 0.05; spec = 1.4; irid = 0.0; sss = 0.5; wet = 1.0;
    emi = ${P.acid}.rgb * ${P.acid}.a * 0.3;
  } else if (id > 1.5) {
    float ring = smoothstep(0.85, 1.0, sin(p.y * 22.0));
    alb = ${P.bone}.rgb * (0.7 + 0.5 * g) * (1.0 - ring * 0.5); rough = ${P.bone}.a; spec = 0.6; irid = 0.0; sss = 0.15; wet = 0.3;
    emi = vec3(0.0);
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
