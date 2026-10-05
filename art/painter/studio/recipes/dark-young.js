// 검은 새끼 (4층 일반) — 슈브니구라스의 새끼. 꼬인 검은 밧줄 같은 촉수들이 엉켜 나무 둥치를 이루고,
// 그 위로 마른 나뭇가지처럼 촉수 관이 뻗어 꿈틀댄다. 둥치에는 오므린 입들이 열려 초록빛 진액을 흘리고,
// 아래는 염소 같은 세 다리와 갈라진 굽. 검은 숲 그 자체가 걸어 다니는 듯 거대하다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const nrm = (a) => mul(a, 1 / Math.hypot(...a));

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
vec3 rimOf(vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  return pow(fres, 1.6) * max(dot(n, normalize(uKeyDir)) + 0.4, 0.0) * uRimCol * uRim;
}
`;

export default function darkYoung({ seed = 1 } = {}) {
  const R = rng(seed * 6007 + 11);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };

  // ── 둥치: 꼬여 오르는 굵은 촉수 밧줄 여섯 (재질 1)
  K.begin(1, 0.06);
  const ropeTops = [];
  // 속심 (밧줄 사이로 속이 비쳐 보이지 않게)
  K.line([[0.0, 0.95, 0.0, 0.22], [0.0, 1.9, 0.0, 0.2], [0.0, 2.75, 0.0, 0.16]]);
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const pts = [];
    const N = 7;
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const y = 0.95 + t * 2.0;
      const a = a0 + t * 2.6;
      const rr = 0.34 - 0.1 * Math.sin(t * Math.PI) + 0.1 * t;
      pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr * 0.9, 0.15 - 0.03 * t + 0.025 * Math.sin(t * 9 + i * 2)]);
    }
    ropeTops.push(pts[N - 1]);
    K.line(pts);
  }
  K.end();

  // ── 염소 다리 셋 (재질 1) + 갈라진 굽 (재질 2)
  K.begin(1, 0.1);
  const legs = [
    [-0.55, 0.15],
    [0.6, 0.25],
    [0.05, -0.65],
  ];
  const hooves = [];
  for (const [lx, lz] of legs) {
    const out = nrm([lx, 0, lz]);
    const hip = [out[0] * 0.25, 1.1, out[2] * 0.25];
    const knee = [out[0] * 0.62, 0.78, out[2] * 0.62 + 0.18];
    const hock = [out[0] * 0.8, 0.45, out[2] * 0.8 - 0.12];
    const hoof = [out[0] * 0.92, 0.08, out[2] * 0.92 + 0.05];
    K.line([
      [...hip, 0.3],
      [...knee, 0.16],
      [...hock, 0.09],
      [...hoof, 0.075],
    ]);
    hooves.push(hoof);
  }
  K.end();
  K.begin(2, 0.02);
  for (const h of hooves) K.line([[...add(h, [0, 0.02, -0.02]), 0.08], [...add(h, [0, -0.035, 0.09]), 0.055]]);
  K.end();

  // ── 왕관 같은 촉수 가지 (재질 1): 둥치 위에서 갈라져 마른 가지처럼 뻗고 끝이 말린다
  K.begin(1, 0.07);
  const crown = 11;
  for (let i = 0; i < crown; i++) {
    const a = (i / crown) * Math.PI * 2 + R() * 0.4;
    const base = add(ropeTops[i % 6].slice(0, 3), [0, -0.1 - R() * 0.25, 0]);
    const up = 1.1 + R() * 1.1;
    const out = 0.9 + R() * 1.1;
    const droop = i % 3 === 1;
    const p1 = add(base, [Math.cos(a) * out * 0.25, up * 0.55, Math.sin(a) * out * 0.2]);
    const p2 = add(base, [Math.cos(a) * out * 0.85, up * (droop ? 0.8 : 1.0), Math.sin(a) * out * 0.55]);
    const curl = (R() - 0.5) * 0.8;
    const p3 = add(base, [Math.cos(a) * out * 1.05 + curl, droop ? -0.2 - R() * 0.5 : up * 0.9 + (R() - 0.5) * 0.5, Math.sin(a) * out * 0.7 + curl * 0.4]);
    K.tube([base, p1, p2, p3], 5, 0.14, 0.01, 0.75);
  }
  K.end();

  // ── 입 넷 (둥치 앞면): 오므린 입술 고리 + 빛을 먹는 구멍, 아래로 흐르는 초록 진액
  const mouths = [
    [0.1, 2.1, 0.4, 0.1],
    [-0.27, 1.55, 0.33, 0.085],
    [0.33, 1.35, 0.26, 0.07],
    [-0.12, 2.6, 0.36, 0.07],
  ];
  const mouthN = mouths.map((m) => nrm([m[0] * 1.2, 0.1, m[2] * 1.4 + 0.3]));
  K.begin(3, 0.012);
  for (let i = 0; i < mouths.length; i++) {
    const m = mouths[i];
    const n = mouthN[i];
    const s = add(m.slice(0, 3), add(mul(n, 0.06), [0, -m[3] * 0.85, 0]));
    const len = 0.3 + R() * 0.4;
    K.line([[...s, 0.011], [...add(s, [0.015, -len * 0.55, 0.025]), 0.007], [...add(s, [-0.005, -len, 0.03]), 0.011]]);
  }
  K.end();

  const P = {
    mcount: prm([mouths.length, 0, 0, 0]),
  };
  const MB = PB.length;
  for (let i = 0; i < mouths.length; i++) {
    PB.push(mouths[i]);
    PB.push([...mouthN[i], 0.04]);
  }
  Object.assign(P, {
    bark: prm([0.018, 0.022, 0.016, 0.55]), // 검은 껍질 색, 거칠기
    bark2: prm([0.05, 0.06, 0.035, 0.0]), // 밧줄 마루 색
    hoof: prm([0.03, 0.025, 0.02, 0.3]),
    ichor: prm([0.42, 0.85, 0.16, 0.7]), // 진액 빛 색, 세기
    lip: prm([0.09, 0.035, 0.04, 0.4]), // 입술 색
  });

  // 진액 방울 빛 + 입 속 희미한 빛
  const uL = [];
  const uLC = [];
  for (let i = 0; i < mouths.length; i++) {
    const m = mouths[i];
    uL.push([...add(m.slice(0, 3), mul(mouthN[i], -0.02)), 0.05]);
    uLC.push([0.55, 0.95, 0.3, 0.35]);
  }

  return {
    preset: 'act4',
    cam: { pos: [0.6, 0.55, 10.8], target: [0.0, 2.05, 0], fov: 1.8 },
    light: { key: [-0.45, 0.65, -0.65], fillCol: [0.1, 0.08, 0.14], amb: [0.02, 0.022, 0.025], rim: 1.9, exposure: 1.3 },
    frame: { fill: 0.92, bottom: 0.025 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  // 입: 오므린 입술 고리를 덧붙이고 안을 파낸다 (반복 횟수는 uniform)
  int nm = int(${P.mcount}.x + 0.5);
  float lips = 1e5;
  float holes = 1e5;
  for (int i = 0; i < nm; i++) {
    vec4 c = uA[${MB} + 2 * i];
    vec4 nn = uA[${MB} + 2 * i + 1];
    vec3 q = p - c.xyz;
    float h = dot(q, nn.xyz);
    float rr = length(q - nn.xyz * h);
    // 입술: 주름진 고리
    float pucker = 1.0 + 0.18 * sin(atan(dot(q, cross(nn.xyz, vec3(0.0, 1.0, 0.0))), q.y) * 9.0);
    lips = min(lips, length(vec2(rr - c.w * pucker, h - 0.02)) - nn.w);
    holes = min(holes, length(q + nn.xyz * 0.03) - c.w * 0.8);
  }
  r.x = smin(smax(r.x, -holes, 0.03), lips, 0.04);
  if (lips < r.x + 0.004) r.y = 4.0;
  r = umin(r, vec2(holes + 0.035, 99.0));
  // 밧줄 껍질 결 (한 번만)
  r.x += 0.016 * (0.5 - ridge(p * vec3(6.0, 3.0, 6.0))) * step(r.y, 1.5);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 3.5);
  float rid = ridge(p * vec3(6.0, 3.0, 6.0));
  vec4 B = ${P.bark};
  vec3 alb = mix(B.rgb, ${P.bark2}.rgb, smoothstep(0.55, 0.1, rid) * 0.7) * (0.6 + 0.8 * g);
  float rough = B.a, spec = 0.75, irid = 0.15, sss = 0.15, wet = 0.55;
  vec3 emi = vec3(0.0);
  // 진액이 흘러내린 자국: 입 아래 세로로 번들거린다
  if (id > 3.5) {
    alb = ${P.lip}.rgb; rough = ${P.lip}.a; spec = 0.9; irid = 0.0; sss = 0.6; wet = 0.9;
    emi = vec3(0.0);
  } else if (id > 2.5) {
    alb = vec3(0.05, 0.09, 0.03); rough = 0.1; spec = 1.2; irid = 0.0; sss = 0.5; wet = 1.0;
    emi = ${P.ichor}.rgb * ${P.ichor}.a;
  } else if (id > 1.5) {
    alb = ${P.hoof}.rgb; rough = ${P.hoof}.a; spec = 1.0; irid = 0.0; sss = 0.0; wet = 0.4;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
