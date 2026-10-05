// 미고 봉합사 (4층 일반) — 유고스에서 온 균류 갑각체 외과의. 마디진 분홍빛 도는 검붉은 몸통이 떠 있고,
// 등에서 박쥐 같은 막날개가 펼쳐진다. 머리는 뇌처럼 주름진 타원체(주름 사이로 분홍 빛이 번진다).
// 앞다리 끝은 수술 도구 — 전기가 튀는 메스와 빛나는 실을 꿴 바늘. 가운데 다리들은 뇌를 담은 금속 원통을 안고 있다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const nrm = (a) => mul(a, 1 / Math.hypot(...a));
const dotp = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

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

export default function migo({ seed = 1 } = {}) {
  const R = rng(seed * 811 + 3);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };

  // ── 몸통 (재질 1): 꼬리 쪽 배마디 → 가슴 → 목. 앞으로 숙여 떠 있다
  K.begin(1, 0.08);
  const body = [
    [0.05, 1.72, -0.95, 0.07],
    [0.03, 1.86, -0.72, 0.14],
    [0.0, 2.0, -0.45, 0.21],
    [0.0, 2.12, -0.15, 0.27],
    [0.0, 2.2, 0.15, 0.25],
    [0.0, 2.3, 0.38, 0.16],
  ];
  K.line(body);
  K.end();
  const HEAD = [0.0, 2.52, 0.64];

  // ── 다리 셋 쌍 + 앞팔 둘 (재질 2, 마디진 갑각)
  K.begin(2, 0.02);
  const CYL = [0.08, 1.42, 0.12];
  for (const s of [-1, 1]) {
    // 뒷다리: 늘어져 아래를 더듬는다
    K.line([[s * 0.2, 2.0, -0.35, 0.06], [s * 0.55, 2.05, -0.5, 0.045], [s * 0.62, 1.45, -0.55, 0.032], [s * 0.5, 1.05, -0.4, 0.012]]);
    // 가운뎃다리: 뇌 원통을 안는다
    K.line([[s * 0.24, 2.05, -0.05, 0.06], [s * 0.5, 1.9, 0.0, 0.045], [s * 0.3, 1.5, 0.12, 0.032], [CYL[0] + s * 0.14, CYL[1] + 0.02, CYL[2] + 0.03, 0.02]]);
  }
  // 앞팔: 오른쪽 = 메스, 왼쪽 = 바늘
  const scalpel = [0.92, 2.55, 1.0];
  const needle = [-0.9, 2.2, 1.05];
  K.line([[0.22, 2.25, 0.22, 0.06], [0.62, 2.62, 0.45, 0.045], [0.78, 2.5, 0.82, 0.032], [...scalpel, 0.02]]);
  K.line([[-0.22, 2.22, 0.22, 0.06], [-0.6, 2.42, 0.42, 0.045], [-0.82, 2.2, 0.8, 0.032], [...needle, 0.02]]);
  // 바늘: 가늘고 긴 침
  K.line([[...needle, 0.016], [...add(needle, [-0.08, -0.05, 0.42]), 0.003]]);
  K.end();
  // ── 빛나는 실: 바늘 끝에서 늘어져 아래로 고리 (재질 5)
  K.begin(5, 0.004);
  const nt = add(needle, [-0.08, -0.05, 0.42]);
  K.tube([nt, add(nt, [0.05, -0.35, 0.05]), add(nt, [0.35, -0.55, -0.1]), add(nt, [0.45, -0.25, -0.3])], 8, 0.004, 0.003);
  K.end();
  // ── 머리 위 짧은 더듬이 다발 (재질 3)
  K.begin(3, 0.01);
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const el = -0.2 + R() * 1.3;
    const d = nrm([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el) * 0.8 + 0.4]);
    const s0 = add(HEAD, [d[0] * 0.17, d[1] * 0.18, d[2] * 0.26]);
    K.line([[...s0, 0.012], [...add(s0, mul(d, 0.07 + R() * 0.07)), 0.004]]);
  }
  K.end();

  // ── 날개 (좌우 대칭 부채꼴 막, 핏줄은 막에 그린다)
  const wingRoot = [0.16, 2.28, -0.12];
  const WU = nrm([0.45, 0.85, -0.35]);
  const D = nrm([0.9, -0.05, -0.45]);
  const WV = nrm(sub(D, mul(WU, dotp(D, WU))));
  const WW = cross(WU, WV);
  const TH = [0.05, 0.6, 1.15, 1.7];
  const LN = [1.85, 1.65, 1.25, 0.55];

  const P = {
    shell: prm([0.11, 0.05, 0.065, 0.45]), // 갑각 색 (검붉은 분홍), 거칠기
    shell2: prm([0.22, 0.1, 0.12, 0.0]), // 마디 테두리 색
    head: prm([...HEAD, 0.0]),
    glow: prm([1.0, 0.45, 0.75, 1.0]), // 분홍빛
    wingR: prm([...wingRoot, 0.01]),
    wu: prm([...WU, TH[0]]),
    wv: prm([...WV, TH[1]]),
    ww: prm([...WW, TH[2]]),
    wl: prm(LN),
    wt: prm([TH[3], 0.12, 0.22, 0]),
    memb: prm([0.018, 0.009, 0.014, 0.6]),
    headr: prm([0.24, 0.25, 0.38, 0.03]), // 머리 반지름, 주름 깊이
    fx: prm([0.45, 0.0, 0.0, 0.0]), // 실 빛 세기, 주름 빛 세기
    rimk: prm([0.4, 0.5, 0.2, 0.35]),
    cyl: prm([...CYL, 0.12]), // 뇌 원통
    blade: prm([...scalpel, 0.0]),
    metal: prm([0.16, 0.15, 0.15, 0.25]),
  };

  const uL = [
    [...add(scalpel, [0.08, 0.06, 0.18]), 0.05],
    [...add(scalpel, [0.05, 0.12, 0.25]), 0.016],
    [...add(scalpel, [0.12, 0.02, 0.3]), 0.014],
    [...add(CYL, [0, 0, 0.13]), 0.1],
    [...add(HEAD, [0.0, 0.05, 0.2]), 0.12],
  ];
  const uLC = [
    [1.0, 0.6, 0.9, 1.3],
    [1.0, 0.8, 1.0, 1.0],
    [1.0, 0.8, 1.0, 0.9],
    [1.0, 0.45, 0.7, 0.35],
    [1.0, 0.4, 0.7, 0.18],
  ];

  return {
    preset: 'act4',
    cam: { pos: [-1.1, 1.5, 8.2], target: [0.0, 2.1, 0], fov: 1.85 },
    light: { key: [-0.4, 0.7, -0.6], fillCol: [0.13, 0.08, 0.18], amb: [0.025, 0.018, 0.03], rim: 1.6, exposure: 1.3, pt: add(CYL, [0, 0, 0.25]), ptCol: [0.9, 0.35, 0.6] },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  // 몸 마디 홈 (몸통 재질에만)
  if (r.y < 1.5) r.x += 0.018 * smoothstep(0.6, 1.0, abs(sin(p.z * 15.0 + p.y * 3.0)));
  // ── 머리: 뇌처럼 주름진 타원체
  vec3 hq = p - ${P.head}.xyz;
  hq.yz = rot(-0.35) * hq.yz;
  vec4 HR = ${P.headr};
  float head = sdEllipsoid(hq, HR.xyz);
  head += HR.w * (0.5 - ridge(hq * 8.0 + 1.0));
  r = usmin(r, vec2(head * 0.8, 4.0), 0.07);
  // ── 날개 (좌우 대칭)
  vec4 W0 = ${P.wingR};
  vec4 WU = ${P.wu};
  vec4 WV = ${P.wv};
  vec4 WW = ${P.ww};
  vec4 WL = ${P.wl};
  vec4 WT = ${P.wt};
  vec3 wq = vec3(abs(p.x), p.y, p.z) - W0.xyz;
  float wu = dot(wq, WU.xyz);
  float wv = dot(wq, WV.xyz);
  float rho = length(vec2(wu, wv));
  float wth = atan(wv, wu);
  float ww = dot(wq, WW.xyz) - WT.y * rho * rho;
  float s1 = clamp((wth - WU.w) / (WV.w - WU.w), 0.0, 1.0);
  float s2 = clamp((wth - WV.w) / (WW.w - WV.w), 0.0, 1.0);
  float s3 = clamp((wth - WW.w) / (WT.x - WW.w), 0.0, 1.0);
  float edge = wth < WV.w ? mix(WL.x, WL.y, s1) * (1.0 - WT.z * sin(3.14159 * s1)) : (wth < WW.w ? mix(WL.y, WL.z, s2) * (1.0 - WT.z * sin(3.14159 * s2)) : mix(WL.z, WL.w, s3) * (1.0 - 0.15 * sin(3.14159 * s3)));
  float m2 = max(rho - edge, max((WU.w - 0.04 - wth) * rho, (wth - WT.x) * rho));
  float memb = max(m2 * 0.8, abs(ww) - W0.w);
  r = usmin(r, vec2(memb, 6.0), 0.03);
  // ── 뇌 원통: 금속 테 + 유리 창
  vec4 C = ${P.cyl};
  vec3 cq = p - C.xyz;
  cq.xy = rot(0.25) * cq.xy;
  float glass = sdCylinder(cq, C.w * 1.1, C.w);
  float caps = min(sdCylinder(cq - vec3(0.0, C.w * 1.15, 0.0), C.w * 0.18, C.w * 1.08), sdCylinder(cq + vec3(0.0, C.w * 1.15, 0.0), C.w * 0.18, C.w * 1.08));
  r = umin(r, vec2(glass, 7.0));
  r = umin(r, vec2(caps, 8.0));
  // ── 메스 칼날 (얇은 판)
  vec3 bq = p - ${P.blade}.xyz - vec3(0.06, 0.04, 0.16);
  bq.yz = rot(-0.5) * bq.yz;
  bq.xz = rot(0.3) * bq.xz;
  float blade = sdBox(bq, vec3(0.008, 0.035 * smoothstep(0.24, -0.1, bq.z) + 0.004, 0.17));
  r = umin(r, vec2(blade, 8.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 6.0);
  vec4 S = ${P.shell};
  float seg = smoothstep(0.7, 1.0, abs(sin(p.z * 15.0 + p.y * 3.0)));
  vec3 alb = mix(S.rgb, ${P.shell2}.rgb, seg * 0.6) * (0.6 + 0.7 * g);
  float rough = S.a, spec = 0.9, irid = 0.3, sss = 0.35, wet = 0.5;
  vec3 emi = vec3(0.0);
  vec3 gl = ${P.glow}.rgb;
  if (id > 7.5) {
    alb = ${P.metal}.rgb; rough = ${P.metal}.a; spec = 1.5; irid = 0.0; sss = 0.0; wet = 0.6;
  } else if (id > 6.5) {
    // 유리 속 분홍 액체와 떠 있는 뇌
    vec3 cq = p - ${P.cyl}.xyz;
    float brain = smoothstep(0.55, 0.3, length(cq / vec3(0.09, 0.08, 0.09))) * (0.6 + 0.4 * smoothstep(0.1, 0.0, ridge(p * 30.0)));
    alb = vec3(0.02); rough = 0.05; spec = 1.6; irid = 0.15; sss = 0.0; wet = 1.0;
    emi = gl * (0.15 + 0.6 * brain);
  } else if (id > 5.5) {
    // 날개막: 검붉고 핏줄이 보인다, 테두리광은 걷어 낸다
    float vein = smoothstep(0.05, 0.0, ridge(p * 5.0));
    alb = ${P.memb}.rgb * (1.0 - 0.6 * vein); rough = ${P.memb}.a; spec = 0.1; irid = 0.0; sss = 0.5; wet = 0.0;
    vec3 rim = rimOf(p, n);
    vec4 rk = ${P.rimk};
    emi = -rim * rk.x + rim * rk.x * rk.yzw;
  } else if (id > 4.5) {
    alb = vec3(0.0); spec = 0.0; wet = 0.0; emi = gl * ${P.fx}.x;
  } else if (id > 3.5) {
    // 뇌 머리: 주름 골 사이로 분홍빛
    vec3 hq = p - ${P.head}.xyz;
    hq.yz = rot(-0.35) * hq.yz;
    float fold = smoothstep(0.12, 0.0, ridge(hq * 8.0 + 1.0));
    alb = mix(vec3(0.085, 0.035, 0.045), vec3(0.025, 0.01, 0.016), fold); rough = 0.35; spec = 0.8; sss = 0.5; wet = 0.7;
    emi = gl * fold * ${P.fx}.y;
  } else if (id > 2.5) {
    alb = vec3(0.14, 0.06, 0.08); rough = 0.4; sss = 0.6;
    emi = gl * 0.12;
  } else if (id > 1.5) {
    alb = S.rgb * 0.6 * (0.6 + 0.7 * g); rough = 0.3; spec = 1.2; irid = 0.25; sss = 0.1;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
