// 무형의 피리꾼 (4층 일반) — 마왕의 궁정에서 끝없이 피리를 부는 형체 없는 것.
// 두건 같은 검보랏빛 원형질이 흘러내리는 형체. 얼굴 자리는 빛을 먹는 구멍이고, 그 구멍에서 기다란 뼈 피리 셋이 뻗어 나와
// 끝에서 보랏빛 소리가 샌다. 가늘고 마디 많은 팔들이 피리를 쥐고, 아랫자락은 찢어져 보랏빛 안개로 풀린다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

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
/** core의 테두리광 항 (그림자 무시) — 재질별로 빼거나 물들이기 위해 */
vec3 rimOf(vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  return pow(fres, 1.6) * max(dot(n, normalize(uKeyDir)) + 0.4, 0.0) * uRimCol * uRim;
}
`;

export default function piper({ seed = 1 } = {}) {
  const R = rng(seed * 2741 + 5);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };

  // ── 몸 (재질 1): S자로 뒤틀린 높은 기둥 — 위가 부풀고 아래는 가늘게 풀린다
  K.begin(1, 0.22);
  const spine = [];
  const NS = 9;
  for (let i = 0; i < NS; i++) {
    const t = i / (NS - 1);
    const y = 0.75 + t * 2.45;
    const x = 0.16 * Math.sin(t * 4.2 + 0.3) + 0.05 * Math.sin(t * 11.0);
    const z = 0.08 * Math.sin(t * 3.0 + 1.0);
    const r = 0.06 + 0.3 * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.92), 1.2) + 0.08 * Math.sin(t * 9.0) * t;
    spine.push([x, y, z, r]);
  }
  K.line(spine);
  // 몸에서 비어져 나온 혹과 늘어진 방울
  for (let i = 0; i < 9; i++) {
    const t = 0.35 + R() * 0.55;
    const k = Math.min(NS - 1, Math.round(t * (NS - 1)));
    const c = spine[k];
    const ang = R() * Math.PI * 2;
    const rr = c[3] * (0.75 + R() * 0.3);
    const p0 = [c[0] + Math.cos(ang) * rr * 0.5, c[1], c[2] + Math.sin(ang) * rr * 0.5];
    const p1 = [c[0] + Math.cos(ang) * rr, c[1] - 0.12 - R() * 0.25, c[2] + Math.sin(ang) * rr];
    K.line([[...p0, c[3] * 0.45], [...p1, c[3] * (0.2 + R() * 0.15)]]);
  }
  K.end();
  // ── 꼭대기에서 위로 풀려 올라가는 가는 갈래 (불꽃처럼)
  K.begin(1, 0.06);
  const top = spine[NS - 1];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R() * 0.5;
    const s0 = add(spine[NS - 2].slice(0, 3), [Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.1 - 0.05]);
    const len = 0.35 + R() * 0.45;
    const sway = (R() - 0.5) * 0.35;
    const e = add(s0, [Math.cos(a) * 0.25 + sway, len, Math.sin(a) * 0.15 - 0.05]);
    K.tube([s0, add(s0, [Math.cos(a) * 0.05, len * 0.4, 0]), add(e, [-sway, -len * 0.25, 0]), e], 4, 0.07, 0.004, 0.8);
  }
  K.end();
  // ── 아래로 풀리는 가는 자락 (재질 1)
  K.begin(1, 0.05);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + R() * 0.5;
    const s0 = [spine[2][0] + Math.cos(a) * 0.12, 1.15 - R() * 0.2, spine[2][2] + Math.sin(a) * 0.1];
    const len = 0.55 + R() * 0.55;
    const sway = (R() - 0.5) * 0.5;
    const e = add(s0, [Math.cos(a) * 0.15 + sway, -len, Math.sin(a) * 0.12]);
    K.tube([s0, add(s0, [Math.cos(a) * 0.1, -len * 0.4, 0.05]), add(e, [-sway, len * 0.3, 0]), e], 4, 0.06, 0.005, 0.8);
  }
  K.end();

  // ── 꼭대기 앞의 오므린 구멍 (피리들이 모이는 곳)
  const FACE = add(spine[NS - 2].slice(0, 3), [0.02, -0.05, 0.27]);
  // ── 뼈 피리 셋 (재질 2): 구멍에서 바깥으로
  const flutes = [
    [add(FACE, [0.03, -0.03, 0.0]), [1.2, 1.7, 1.05], 0.034],
    [add(FACE, [-0.04, 0.0, 0.0]), [-1.15, 3.05, 0.75], 0.03],
    [add(FACE, [0.02, 0.04, 0.0]), [0.75, 3.7, 0.65], 0.028],
  ];
  K.begin(2, 0.008);
  for (const [a, b, r] of flutes) {
    const m = add(lerp(a, b, 0.5), [0, 0.04, 0]);
    K.line([[...a, r * 1.05], [...m, r], [...b, r * 0.9]]);
    const d = sub(b, a);
    const L = Math.hypot(...d);
    K.line([[...sub(b, mul(d, 0.05 / L)), r * 0.95], [...add(b, mul(d, 0.025 / L)), r * 1.6]]);
  }
  K.end();
  // ── 위족 (재질 3): 몸에서 뻗어 피리를 감아쥔 셋 + 허공을 더듬는 둘
  K.begin(3, 0.04);
  const roots = [5, 4, 6, 3, 6];
  for (let i = 0; i < 5; i++) {
    const c = spine[roots[i]];
    let grip;
    if (i < 3) grip = lerp(flutes[i][0], flutes[i][1], 0.55 + 0.1 * i);
    else grip = add(c.slice(0, 3), [(i === 3 ? -1 : 1) * (0.8 + R() * 0.3), -0.3 + R() * 0.7, 0.3 + R() * 0.3]);
    const base = add(c.slice(0, 3), [Math.sign(grip[0] - c[0]) * c[3] * 0.6, 0, 0.05]);
    const mid = add(lerp(base, grip, 0.5), [0, -0.25 + R() * 0.15, -0.1 + R() * 0.2]);
    K.tube([base, add(base, mul(sub(mid, base), 0.6)), add(mid, mul(sub(grip, mid), 0.5)), grip], 5, 0.075, i < 3 ? 0.024 : 0.008, 0.9);
  }
  K.end();

  // 피리 끝에서 새는 보랏빛 소리 + 떠도는 음 몇 점
  const uL = [];
  const uLC = [];
  for (const [a, b] of flutes) {
    const d = sub(b, a);
    const L = Math.hypot(...d);
    uL.push([...add(b, mul(d, 0.06 / L)), 0.07]);
    uLC.push([0.72, 0.4, 1.0, 1.1]);
    for (let k = 0; k < 2; k++) {
      uL.push([...add(add(b, mul(d, (0.25 + k * 0.25) / L)), [(R() - 0.5) * 0.25, (R() - 0.3) * 0.3, (R() - 0.5) * 0.2]), 0.018]);
      uLC.push([0.8, 0.55, 1.0, 0.8]);
    }
  }
  // 구멍 속에서 번지는 빛
  uL.push([...add(FACE, [0.0, 0.0, 0.02]), 0.08]);
  uLC.push([0.7, 0.4, 1.0, 0.4]);

  const P = {
    body: prm([0.02, 0.014, 0.03, 0.35]), // 원형질 색, 거칠기
    body2: prm([0.065, 0.03, 0.095, 0.0]), // 얇은 곳에 비치는 색
    bone: prm([0.08, 0.07, 0.055, 0.45]), // 뼈 피리 색
    glow: prm([0.75, 0.4, 1.0, 1.0]), // 빛 색, 세기
    face: prm([...FACE, 0.12]), // 피리가 모이는 구멍
    fog: prm([0.45, 0.22, 0.7, 0.6]), // 안개 색, 세기
    rimk: prm([0.4, 0.45, 0.25, 0.7]), // 테두리광: 걷어낼 비율, 남길 색(보랏빛)
    arm: prm([0.03, 0.022, 0.035, 0.4]), // 팔 색
  };

  return {
    preset: 'act4',
    cam: { pos: [0.3, 1.2, 9.6], target: [0.05, 1.9, 0], fov: 1.85 },
    light: { key: [-0.4, 0.65, -0.7], fillCol: [0.12, 0.07, 0.2], amb: [0.025, 0.018, 0.04], rim: 1.7, exposure: 1.3, glow: 0.12 },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 40
#define VOLUME_FAR 16.0
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  // 형체가 일렁인다: 아래로 갈수록 좌표를 크게 비튼다
  float melt = smoothstep(2.6, 0.8, p.y);
  vec3 q = p + vec3(noise(p * 1.4 + 2.0) - 0.5, 0.25 * (noise(p * 2.0 + 4.0) - 0.5), noise(p * 1.4 + 7.0) - 0.5) * (0.1 + 0.24 * melt);
  vec2 r = chainSet(q);
  // 두건 속 얼굴 구멍: 몸을 깊게 파내고 안은 빛을 먹는 어둠
  vec4 F = ${P.face};
  vec3 fq = p - F.xyz;
  // 피리가 모이는 오므린 구멍
  float hole = sdSphere(fq, F.w);
  if (r.y < 1.5) r.x = smax(r.x, -hole, 0.04);
  r = umin(r, vec2(sdSphere(fq + vec3(0.0, 0.0, 0.06), F.w * 0.9), 99.0));
  // 흘러내리는 결: 세로로 늘인 잡음 (원형질에만)
  float amp = r.y < 1.5 ? 1.0 : 0.04;
  r.x += amp * (0.06 * (fbm3(vec3(p.x * 4.0, p.y * 1.2, p.z * 4.0) + 1.0) - 0.5) + 0.1 * (noise(p * 2.2 + 5.0) - 0.5));
  r.x *= 0.7;
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(vec3(p.x * 4.0, p.y * 1.2, p.z * 4.0) + 1.0);
  vec4 B = ${P.body};
  vec3 alb = mix(B.rgb, ${P.body2}.rgb, smoothstep(0.45, 0.8, g));
  float rough = B.a, spec = 0.8, irid = 0.0, sss = 0.7, wet = 0.65;
  vec4 rk = ${P.rimk};
  vec3 rim = rimOf(p, n);
  vec4 F = ${P.face};
  vec3 fq = p - F.xyz;
  // 피리가 들어간 자리 둘레로 빛이 살 속에서 번진다 (핏줄 같은 결)
  float near = smoothstep(0.55, 0.0, length(fq));
  float vein = smoothstep(0.035, 0.0, abs(fbm3(p * 2.6 + 3.0) - 0.5)) * near;
  vec3 emi = ${P.glow}.rgb * (0.04 * smoothstep(0.6, 0.85, g) + 0.3 * vein + 0.1 * near * near) - rim * rk.x + rim * rk.x * rk.yzw;
  if (id > 2.5) {
    alb = ${P.arm}.rgb; rough = ${P.arm}.a; spec = 0.6; irid = 0.05; sss = 0.4; wet = 0.4;
  } else if (id > 1.5) {
    // 뼈 피리: 누렇게 바랜 뼈, 마디마다 어두운 띠
    float ring = smoothstep(0.8, 1.0, sin(dot(p, vec3(11.0, 15.0, 9.0))));
    alb = ${P.bone}.rgb * (0.75 + 0.5 * g) * (1.0 - ring * 0.7);
    rough = ${P.bone}.a; spec = 0.5; irid = 0.0; sss = 0.15; wet = 0.15; emi = vec3(0.0);
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}

vec4 volume(vec3 p) {
  // 아랫자락이 풀려 나온 보랏빛 안개
  vec3 c = p - vec3(0.0, 1.2, 0.0);
  float r = length(c * vec3(0.9, 0.8, 1.0));
  float base = smoothstep(1.6, 0.4, r) * smoothstep(-0.2, 0.8, 1.55 - p.y);
  float n = fbm3(p * 1.7 + vec3(0.0, uSeed, 0.0));
  float dens = base * smoothstep(0.42, 0.78, n);
  vec4 F = ${P.fog};
  return vec4(F.rgb * F.a * dens * 0.9, dens * 1.4);
}
`,
  };
}
