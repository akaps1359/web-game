// 어린 새끼 (4층 하수인) — 천 마리 새끼의 어머니가 낳은 것. 찢어진 검은 꼬투리(껍질) 속에서
// 꼬인 검은 촉수 밧줄들이 봉오리처럼 웅크리고, 위로 갓 돋은 촉수들이 더듬는다. 꼭대기의 오므린 입에서 초록 진액이 샌다.
// 가늘고 떨리는 염소 다리 둘, 작게 말린 뿔 한 쌍.
// 자란 새끼(goat-spawn@2)는 같은 셰이더로: 껍질을 찢고 나와 키가 크고, 가지 같은 촉수와 굵은 세 다리, 큰 뿔.
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
`;

export function goatSpawn(grown, { seed = 1 } = {}) {
  const R = rng(seed * 2003 + (grown ? 41 : 17));
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };
  const S = grown ? 1.0 : 0.62; // 크기
  const legTop = grown ? 0.95 : 0.62;
  const top = grown ? 2.05 : 1.12;

  // ── 몸: 꼬인 밧줄 다발 (재질 1)
  K.begin(1, 0.05);
  K.line([[0.0, legTop - 0.05, 0.0, 0.16 * S], [0.0, (legTop + top) / 2, 0.0, 0.2 * S], [0.0, top - 0.05, 0.0, 0.12 * S]]);
  const ropes = grown ? 6 : 5;
  const ropeTops = [];
  for (let i = 0; i < ropes; i++) {
    const a0 = (i / ropes) * Math.PI * 2;
    const pts = [];
    const N = 6;
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const y = legTop - 0.05 + t * (top - legTop);
      const a = a0 + t * 2.4;
      const bulge = grown ? 0.26 - 0.08 * Math.sin(t * Math.PI) + 0.06 * t : 0.13 + 0.14 * Math.sin(t * Math.PI * 0.95);
      pts.push([Math.cos(a) * bulge, y, Math.sin(a) * bulge * 0.9, (grown ? 0.13 : 0.09) - 0.03 * t]);
    }
    ropeTops.push(pts[N - 1]);
    K.line(pts);
  }
  K.end();
  // ── 다리 (재질 1) + 굽 (재질 2)
  K.begin(1, 0.06);
  const legs = grown ? [[-0.5, 0.15], [0.52, 0.22], [0.05, -0.55]] : [[-0.3, 0.12], [0.3, 0.12]];
  const hooves = [];
  for (const [lx, lz] of legs) {
    const out = nrm([lx, 0, lz]);
    const L = grown ? 0.9 : 0.62;
    const hip = [out[0] * 0.12, legTop, out[2] * 0.12];
    const knee = [out[0] * L * 0.55, legTop * 0.68, out[2] * L * 0.55 + 0.12 * S];
    const hock = [out[0] * L * 0.72, legTop * 0.38, out[2] * L * 0.72 - 0.1 * S];
    const hoof = [out[0] * L * 0.8, 0.06, out[2] * L * 0.8 + 0.04];
    K.line([[...hip, 0.17 * S], [...knee, 0.09 * S], [...hock, 0.05 * S + 0.01], [...hoof, 0.045 * S + 0.01]]);
    hooves.push(hoof);
  }
  K.end();
  K.begin(2, 0.015);
  for (const h of hooves) K.line([[...add(h, [0, 0.015, -0.015]), 0.05 * S + 0.012], [...add(h, [0, -0.03, 0.07 * S]), 0.035 * S + 0.008]]);
  // 뿔: 꼭대기 양옆에서 뒤로 말린다
  for (const s of [-1, 1]) {
    const b = [s * 0.13 * S, top - 0.08, -0.02];
    const hs = grown ? 1.0 : 0.6;
    K.tube([b, add(b, [s * 0.14 * hs, 0.2 * hs, -0.1 * hs]), add(b, [s * 0.3 * hs, 0.12 * hs, -0.28 * hs]), add(b, [s * 0.26 * hs, -0.06 * hs, -0.3 * hs])], 5, 0.055 * hs + 0.01, 0.006);
  }
  K.end();
  // ── 위로 더듬는 촉수 (재질 1)
  K.begin(1, 0.04);
  const nT = grown ? 9 : 6;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2 + R() * 0.5;
    const base = add(ropeTops[i % ropes].slice(0, 3), [0, -0.05, 0]);
    const up = (grown ? 0.9 : 0.4) + R() * (grown ? 0.8 : 0.35);
    const out = (grown ? 0.6 : 0.25) + R() * (grown ? 0.8 : 0.3);
    const droop = grown && i % 3 === 1;
    const curl = (R() - 0.5) * (grown ? 0.6 : 0.3);
    const p3 = add(base, [Math.cos(a) * out + curl, droop ? -0.3 : up, Math.sin(a) * out * 0.7]);
    K.tube([base, add(base, [Math.cos(a) * out * 0.25, up * 0.5, Math.sin(a) * out * 0.2]), add(base, [Math.cos(a) * out * 0.85, up * (droop ? 0.7 : 1.0), Math.sin(a) * out * 0.6]), p3], 5, grown ? 0.1 : 0.055, 0.008, 0.8);
  }
  K.end();
  // ── 초록 진액 방울 (재질 3)
  const mouths = grown
    ? [[0.06, 1.62, 0.33, 0.075], [-0.2, 1.22, 0.3, 0.06]]
    : [[0.0, top - 0.06, 0.12, 0.075]];
  const mouthN = mouths.map((m, i) => (grown ? nrm([m[0] * 1.2, 0.1, m[2] * 1.4 + 0.3]) : nrm([0.0, 0.55, 1.0])));
  K.begin(3, 0.01);
  for (let i = 0; i < mouths.length; i++) {
    const m = mouths[i];
    const n = mouthN[i];
    const s0 = add(m.slice(0, 3), add(mul(n, 0.05), [0, -m[3] * 0.85, 0]));
    const len = 0.25 + R() * 0.3;
    K.line([[...s0, 0.012], [...add(s0, [0.01, -len * 0.55, 0.03]), 0.007], [...add(s0, [-0.005, -len, 0.04]), 0.012]]);
  }
  K.end();

  // ── 꼬투리 껍질 조각 (속이 빈 타원 껍질을 반쯤 자른 것): [중심, 반지름], [기울기, 방향각, 두께]
  const husks = [];
  const nH = grown ? 4 : 5;
  for (let i = 0; i < nH; i++) {
    const a = (i / nH) * Math.PI * 2 + 0.3 + R() * 0.3;
    if (grown) {
      // 자란 새끼: 다리 사이 바닥에 찢겨 떨어진 껍질
      husks.push([[Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.45], [0.22, 0.12, 0.3], [1.3 + R() * 0.4, a, 0.025]]);
    } else {
      husks.push([[Math.cos(a) * 0.2, legTop + 0.2, Math.sin(a) * 0.17], [0.05, 0.36, 0.17], [0.55 + R() * 0.3, a, 0.016]]);
    }
  }
  const P = {
    nm: prm([mouths.length, husks.length, 0, 0]),
    bark: prm([0.016, 0.02, 0.014, 0.5]),
    bark2: prm([0.045, 0.055, 0.03, 0.0]),
    husk: prm([0.05, 0.045, 0.032, 0.7]),
    ichor: prm([0.45, 0.88, 0.2, 0.75]),
    lip: prm([0.07, 0.03, 0.035, 0.4]),
  };
  const MB = PB.length;
  for (let i = 0; i < mouths.length; i++) {
    PB.push(mouths[i]);
    PB.push([...mouthN[i], 0.03 * (grown ? 1 : 0.8)]);
  }
  while (PB.length < MB + 4) PB.push([0, -10, 0, 0.01]); // 입 자리 둘 고정 (두 형태가 같은 셰이더를 쓰도록)
  const HB = PB.length;
  for (const [c, r, o] of husks) {
    PB.push([...c, 0]);
    PB.push([...r, 0]);
    PB.push([...o, 0]);
  }
  const uL = mouths.map((m, i) => [...add(m.slice(0, 3), mul(mouthN[i], -0.02)), 0.05]);
  const uLC = mouths.map(() => [0.5, 0.95, 0.25, grown ? 0.35 : 0.7]);

  return {
    preset: 'act4',
    cam: grown ? { pos: [0.7, 0.7, 7.6], target: [0.0, 1.2, 0], fov: 1.8 } : { pos: [0.6, 1.75, 4.6], target: [0.0, 0.7, 0], fov: 1.8 },
    light: { key: [-0.45, 0.65, -0.65], fillCol: [0.1, 0.08, 0.14], amb: [0.02, 0.022, 0.025], rim: 1.9, exposure: 1.3 },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  vec4 NM = ${P.nm};
  // 입: 오므린 입술 고리 + 파낸 구멍
  int nm = int(NM.x + 0.5);
  float lips = 1e5;
  float holes = 1e5;
  for (int i = 0; i < nm; i++) {
    vec4 c = uA[${MB} + 2 * i];
    vec4 nn = uA[${MB} + 2 * i + 1];
    vec3 q = p - c.xyz;
    float h = dot(q, nn.xyz);
    float rr = length(q - nn.xyz * h);
    lips = min(lips, length(vec2(rr - c.w, h - 0.015)) - nn.w);
    holes = min(holes, length(q + nn.xyz * 0.025) - c.w * 0.8);
  }
  r.x = smin(smax(r.x, -holes, 0.03), lips, 0.035);
  if (lips < r.x + 0.004) r.y = 4.0;
  r = umin(r, vec2(holes + 0.03, 99.0));
  // 꼬투리 껍질: 비스듬히 누운 타원 껍질의 반쪽
  int nh = int(NM.y + 0.5);
  for (int i = 0; i < nh; i++) {
    vec3 c = uA[${HB} + 3 * i].xyz;
    vec3 rr = uA[${HB} + 3 * i + 1].xyz;
    vec3 o = uA[${HB} + 3 * i + 2].xyz;
    vec3 q = p - c;
    q.xz = rot(o.y) * q.xz;
    q.xy = rot(o.x) * q.xy;
    float sh = abs(sdEllipsoid(q, rr)) - o.z;
    sh = max(sh, -q.x);
    sh = max(sh, q.y - rr.y * (0.3 + 0.4 * noise(q * 9.0)));
    r = umin(r, vec2(sh * 0.8, 5.0));
  }
  r.x += 0.012 * (0.5 - ridge(p * vec3(8.0, 4.0, 8.0))) * step(r.y, 1.5);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 5.0);
  float rid = ridge(p * vec3(8.0, 4.0, 8.0));
  vec4 B = ${P.bark};
  vec3 alb = mix(B.rgb, ${P.bark2}.rgb, smoothstep(0.55, 0.1, rid) * 0.7) * (0.6 + 0.8 * g);
  float rough = B.a, spec = 0.75, irid = 0.15, sss = 0.15, wet = 0.6;
  vec3 emi = vec3(0.0);
  if (id > 4.5) {
    alb = ${P.husk}.rgb * (0.6 + 0.7 * g); rough = ${P.husk}.a; spec = 0.4; irid = 0.0; sss = 0.3; wet = 0.2;
  } else if (id > 3.5) {
    alb = ${P.lip}.rgb; rough = ${P.lip}.a; spec = 0.9; irid = 0.0; sss = 0.6; wet = 0.9;
  } else if (id > 2.5) {
    alb = vec3(0.05, 0.09, 0.03); rough = 0.1; spec = 1.2; irid = 0.0; sss = 0.5; wet = 1.0;
    emi = ${P.ichor}.rgb * ${P.ichor}.a;
  } else if (id > 1.5) {
    alb = vec3(0.03, 0.026, 0.02); rough = 0.3; spec = 1.0; irid = 0.0; sss = 0.0; wet = 0.4;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}

export default function goatSpawnYoung(opts = {}) {
  return goatSpawn(false, opts);
}
