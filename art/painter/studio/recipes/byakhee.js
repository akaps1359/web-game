// 비야키 (4층 일반) — 별 사이를 나는 짐승. 까마귀도, 두더지도, 독수리도, 개미도, 썩은 사람도 아닌 것.
// 갈비뼈가 드러난 말라비틀어진 몸이 거대한 박쥐 날개를 펼치고 떠 있다. 길쭉한 해골 같은 머리에 아래로 굽은 부리,
// 작은 금빛 눈 넷. 늘어진 뒷다리 끝엔 갈고리 발톱.
import { rng } from '../../lib.js';

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

export default function byakhee({ seed = 1 } = {}) {
  const R = rng(seed * 6661 + 4);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };
  const HEAD = [0.0, 2.3, 0.62];

  // ── 말라붙은 몸 (재질 1): 골반 → 배 → 가슴 → 목
  K.begin(1, 0.08);
  K.line([
    [0.0, 1.3, -0.22, 0.12],
    [0.0, 1.58, -0.08, 0.16],
    [0.0, 1.92, 0.08, 0.2],
    [0.0, 2.16, 0.1, 0.19],
    [0.0, 2.3, 0.3, 0.08],
    [...add(HEAD, [0, 0, -0.06]), 0.09],
  ]);
  // 뒷다리: 늘어져 아래로
  for (const s of [-1, 1]) {
    K.line([[s * 0.12, 1.32, -0.2, 0.1], [s * 0.26, 1.08, 0.12, 0.065], [s * 0.24, 0.66, -0.25, 0.04], [s * 0.24, 0.32, 0.02, 0.03]]);
  }
  K.end();
  // ── 부리·발톱·날개뼈 (재질 2, 검은 뿔)
  K.begin(2, 0.015);
  K.line([[...add(HEAD, [0, -0.02, 0.15]), 0.07], [...add(HEAD, [0, -0.06, 0.38]), 0.035], [...add(HEAD, [0, -0.2, 0.55]), 0.006]]);
  for (const s of [-1, 1]) {
    const f = [s * 0.24, 0.32, 0.02];
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.5;
      K.line([[...f, 0.03], [...add(f, [Math.sin(a) * 0.1, -0.08, Math.cos(a) * 0.12]), 0.018], [...add(f, [Math.sin(a) * 0.12, -0.2, Math.cos(a) * 0.06]), 0.004]]);
    }
  }
  K.end();

  // ── 날개 (부채꼴 막, 좌우 대칭): 크게 펼쳐 위로 치켜든다
  const wingRoot = [0.16, 2.12, -0.05];
  const WU = nrm([0.6, 0.72, -0.25]);
  const D = nrm([0.85, -0.45, -0.1]);
  const WV = nrm(sub(D, mul(WU, dotp(D, WU))));
  const WW = cross(WU, WV);
  const TH = [0.08, 0.7, 1.25, 1.85];
  const LN = [2.15, 2.0, 1.55, 0.55];
  const CURVE = 0.1;
  const wingPt = (th, rho) => add(add(wingRoot, add(mul(WU, Math.cos(th) * rho), mul(WV, Math.sin(th) * rho))), mul(WW, CURVE * rho * rho));
  K.begin(2, 0.03);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const pts = [0, 0.35, 0.7, 1].map((t, j) => {
        const q = wingPt(TH[i] + Math.sin(t * 3) * 0.03, LN[i] * t);
        return [sx * q[0], q[1], q[2], [0.07, 0.045, 0.025, 0.008][j]];
      });
      K.line(pts);
    }
    // 날개 마디의 갈고리 엄지
    const w = wingPt(TH[0], LN[0] * 0.35);
    K.line([[sx * w[0], w[1], w[2], 0.03], [sx * (w[0] + 0.05), w[1] + 0.1, w[2] + 0.12, 0.004]]);
  }
  K.end();

  const uE = [];
  const uG = [];
  for (const [x, y, r] of [[0.07, 0.04, 0.026], [-0.07, 0.04, 0.026], [0.1, 0.0, 0.016], [-0.1, 0.0, 0.016]]) {
    uE.push([HEAD[0] + x, HEAD[1] + y, HEAD[2] + 0.1, r]);
    uG.push([x * 2.0, -0.2, 1, 5]);
  }
  const P = {
    head: prm([...HEAD, 0]),
    skin: prm([0.05, 0.04, 0.03, 0.75]),
    bone: prm([0.11, 0.095, 0.075, 0.5]),
    horn: prm([0.03, 0.026, 0.022, 0.3]),
    wingR: prm([...wingRoot, 0.01]),
    wu: prm([...WU, TH[0]]),
    wv: prm([...WV, TH[1]]),
    ww: prm([...WW, TH[2]]),
    wl: prm(LN),
    wt: prm([TH[3], CURVE, 0.3, 0]),
    memb: prm([0.02, 0.015, 0.013, 0.65]),
    rimk: prm([0.4, 0.55, 0.32, 0.12]),
  };

  return {
    preset: 'act4',
    cam: { pos: [3.2, 1.0, 8.4], target: [0.0, 1.8, 0], fov: 1.8 },
    light: { key: [-0.4, 0.7, -0.6], fillCol: [0.11, 0.08, 0.15], amb: [0.022, 0.018, 0.026], rim: 1.9, exposure: 1.3, eyeEmit: 1.6 },
    frame: { fill: 0.92, bottom: 0.04 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uE, uG },
    glsl: /* glsl */ `
#define NO_GROUND
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  // 갈비뼈: 가슴에 가로 골
  if (r.y < 1.5) r.x += 0.006 * smoothstep(0.4, 1.0, sin(p.y * 46.0 + p.z * 6.0)) * smoothstep(1.65, 1.8, p.y) * smoothstep(2.15, 2.02, p.y) * smoothstep(0.02, 0.12, abs(p.x));
  // 해골 같은 머리: 길쭉하고 눈두덩이 꺼졌다
  vec3 hq = p - ${P.head}.xyz;
  float head = sdEllipsoid(hq, vec3(0.13, 0.12, 0.2));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, 0.07, -0.1), vec3(0.11, 0.1, 0.16)), 0.05);
  vec3 eq = vec3(abs(hq.x), hq.y, hq.z);
  head = smax(head, -sdEllipsoid(eq - vec3(0.08, 0.04, 0.12), vec3(0.05, 0.035, 0.05)), 0.02);
  r = usmin(r, vec2(head, 3.0), 0.05);
  // 날개막
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
  float tear = 1.0 - 0.1 * smoothstep(0.45, 0.8, noise(vec3(wth * 9.0, rho * 2.0, 1.0)));
  float edge = tear * (wth < WV.w ? mix(WL.x, WL.y, s1) * (1.0 - WT.z * sin(3.14159 * s1)) : (wth < WW.w ? mix(WL.y, WL.z, s2) * (1.0 - WT.z * sin(3.14159 * s2)) : mix(WL.z, WL.w, s3) * (1.0 - 0.15 * sin(3.14159 * s3))));
  float m2 = max(rho - edge, max((WU.w - 0.04 - wth) * rho, (wth - WT.x) * rho));
  float memb = max(m2 * 0.8, abs(ww) - W0.w);
  r = usmin(r, vec2(memb, 4.0), 0.025);
  r.x += 0.008 * (0.5 - ridge(p * 12.0)) * step(r.y, 1.5);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 6.0);
  vec4 S = ${P.skin};
  // 썩어 말라붙은 가죽: 갈비뼈 마루는 뼈빛으로 드러난다
  float rib = smoothstep(0.7, 1.0, sin(p.y * 46.0 + p.z * 6.0)) * smoothstep(1.65, 1.8, p.y) * smoothstep(2.15, 2.02, p.y);
  vec3 alb = mix(S.rgb * (0.6 + 0.8 * g), ${P.bone}.rgb, rib * 0.7);
  float rough = S.a, spec = 0.4, irid = 0.0, sss = 0.2, wet = 0.15;
  vec3 emi = vec3(0.0);
  if (id > 3.5) {
    float vein = smoothstep(0.05, 0.0, ridge(p * 4.0));
    alb = ${P.memb}.rgb * (1.0 - 0.5 * vein); rough = ${P.memb}.a; spec = 0.08; sss = 0.5; wet = 0.0;
    vec3 rim = rimOf(p, n);
    vec4 rk = ${P.rimk};
    emi = -rim * rk.x + rim * rk.x * rk.yzw;
  } else if (id > 2.5) {
    alb = ${P.bone}.rgb * (0.6 + 0.6 * g); rough = ${P.bone}.a; spec = 0.6; wet = 0.2;
  } else if (id > 1.5) {
    alb = ${P.horn}.rgb; rough = ${P.horn}.a; spec = 1.2; wet = 0.4;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
