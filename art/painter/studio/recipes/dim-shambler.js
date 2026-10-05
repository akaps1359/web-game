// 차원 방랑자 (4층 일반) — 차원 사이를 걸어 다니는 것. 헐렁하게 늘어진 주름투성이 가죽을 걸친 유인원 같은 형체가
// 구부정하게 서서, 바닥까지 닿는 긴 팔 끝의 갈고리 손톱을 늘어뜨린다. 눈 없는 작은 머리엔 세로로 찢어진 입.
// 몸 곳곳이 얇은 띠로 잘려 나가 그 틈으로 다른 차원의 푸른빛이 샌다 — 반쯤은 여기 없다.
import { rng } from '../../lib.js';

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

export default function dimShambler({ seed = 1 } = {}) {
  const R = rng(seed * 3907 + 13);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };
  const HEAD = [0.05, 2.28, 0.62];
  // ── 몸 (재질 1): 짧은 다리, 앞으로 쏠린 굽은 등, 처진 배 가죽
  K.begin(1, 0.14);
  K.line([
    [0.0, 1.05, -0.1, 0.3],
    [0.0, 1.4, 0.0, 0.36],
    [0.02, 1.8, 0.2, 0.42],
    [0.03, 2.12, 0.32, 0.36],
    [...add(HEAD, [0, -0.08, -0.12]), 0.17],
  ]);
  // 처진 가죽 주머니 (배·옆구리)
  K.line([[0.0, 1.5, 0.22, 0.3], [0.05, 1.12, 0.32, 0.22]]);
  for (const s of [-1, 1]) {
    K.line([[s * 0.24, 1.05, -0.08, 0.2], [s * 0.38, 0.62, 0.18, 0.15], [s * 0.36, 0.28, -0.05, 0.1], [s * 0.4, 0.07, 0.12, 0.09]]);
  }
  // 긴 팔: 어깨 → 팔꿈치 → 바닥 가까이 늘어진 손
  K.line([[-0.42, 2.02, 0.3, 0.2], [-0.78, 1.38, 0.45, 0.13], [-0.9, 0.55, 0.6, 0.1]]);
  K.line([[0.45, 2.0, 0.28, 0.2], [0.84, 1.45, 0.3, 0.13], [0.98, 0.7, 0.62, 0.1]]);
  K.end();
  // ── 갈고리 손톱 (재질 2)
  K.begin(2, 0.02);
  for (const [w, sx] of [[[-0.9, 0.55, 0.6], -1], [[0.98, 0.7, 0.62], 1]]) {
    for (let i = 0; i < 4; i++) {
      const a = (i - 1.5) * 0.35;
      K.line([[...w, 0.05], [...add(w, [Math.sin(a) * 0.14 + sx * 0.03, -0.22, Math.cos(a) * 0.1]), 0.03], [...add(w, [Math.sin(a) * 0.18, -0.45, Math.cos(a) * 0.2 + 0.08]), 0.005]]);
    }
  }
  K.end();
  // 잘려 나간 띠: [높이, 두께, 기울기x, 기울기z] — 틈의 면이 푸르게 빛난다
  const slabs = [];
  const ys = [0.62, 1.12, 1.6, 2.02];
  for (const y of ys) slabs.push([y + (R() - 0.5) * 0.06, 0.008 + R() * 0.01, (R() - 0.5) * 0.9, (R() - 0.5) * 0.4]);
  const P = {
    head: prm([...HEAD, 0]),
    skin: prm([0.055, 0.047, 0.052, 0.8]),
    skin2: prm([0.1, 0.085, 0.09, 0.0]),
    claw: prm([0.03, 0.028, 0.03, 0.25]),
    rift: prm([0.25, 0.4, 1.0, 0.5]), // 틈 빛
    n: prm([slabs.length, 0, 0, 0]),
  };
  const SB = PB.length;
  for (const s of slabs) PB.push(s);
  // 틈에서 새는 빛 몇 점
  const uL = [];
  const uLC = [];
  for (const s of slabs.slice(1, 5)) {
    uL.push([(R() - 0.5) * 0.5, s[0], 0.45, 0.06]);
    uLC.push([0.45, 0.6, 1.0, 0.25]);
  }

  return {
    preset: 'act4',
    cam: { pos: [-1.0, 0.8, 8.4], target: [0.0, 1.3, 0], fov: 1.8 },
    light: { key: [-0.45, 0.65, -0.6], fillCol: [0.1, 0.08, 0.15], amb: [0.02, 0.02, 0.028], rim: 1.9, exposure: 1.3 },
    frame: { fill: 0.9, bottom: 0.025 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
${CHAIN_GLSL}
float slabCut(vec3 p, out vec3 nrm) {
  float cut = 1e5;
  nrm = vec3(0.0, 1.0, 0.0);
  int n = int(${P.n}.x + 0.5);
  for (int i = 0; i < n; i++) {
    vec4 s = uA[${SB} + i];
    float y = p.y - s.x - s.z * p.x - s.w * p.z;
    float c = abs(y) - s.y;
    if (c < cut) { cut = c; nrm = normalize(vec3(-s.z, 1.0, -s.w)); }
  }
  return cut;
}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  // 머리: 작고 눈이 없다, 세로로 찢어진 입
  vec3 hq = p - ${P.head}.xyz;
  float head = sdEllipsoid(hq, vec3(0.16, 0.2, 0.17));
  float maw = sdEllipsoid(hq - vec3(0.0, -0.05, 0.15), vec3(0.03, 0.12, 0.06));
  head = smax(head, -maw, 0.02);
  r = usmin(r, vec2(head, 1.0), 0.08);
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.05, 0.11), vec3(0.025, 0.1, 0.04)), 99.0));
  // 헐렁하게 늘어진 가죽 주름 (세로로 처진다)
  if (r.y < 1.5) r.x += 0.03 * (0.5 - ridge(vec3(p.x * 7.0, p.y * 2.5, p.z * 7.0))) + 0.012 * (0.5 - ridge(p * 15.0));
  r.x *= 0.85;
  // 차원의 틈: 얇은 띠로 몸을 잘라 낸다
  vec3 sn;
  float cut = slabCut(p, sn);
  if (r.y < 2.5) r.x = max(r.x, -cut);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 4.0);
  float fold = ridge(vec3(p.x * 7.0, p.y * 2.5, p.z * 7.0));
  vec4 S = ${P.skin};
  vec3 alb = mix(S.rgb, ${P.skin2}.rgb, smoothstep(0.6, 0.1, fold) * 0.6) * (0.6 + 0.7 * g);
  float rough = S.a, spec = 0.35, irid = 0.0, sss = 0.2, wet = 0.15;
  vec3 sn;
  float cut = slabCut(p, sn);
  // 틈: 잘린 면은 검푸른 어둠, 살갗이 잘린 가장자리만 가늘게 푸른빛으로 탄다
  float face = smoothstep(0.75, 0.95, abs(dot(n, sn))) * smoothstep(0.01, 0.0, abs(cut));
  float lip = smoothstep(0.012, 0.0, abs(cut)) * (1.0 - smoothstep(0.5, 0.8, abs(dot(n, sn))));
  vec3 emi = ${P.rift}.rgb * ${P.rift}.a * lip * (0.7 + 0.6 * noise(p * 25.0)) + ${P.rift}.rgb * face * 0.08;
  alb *= 1.0 - face * 0.9;
  if (id > 1.5) {
    alb = ${P.claw}.rgb; rough = ${P.claw}.a; spec = 1.2; wet = 0.4;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
