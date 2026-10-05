// 별의 자손 (4층 일반) — 별에서 내려온 거대한 것. 구부정한 사람꼴 몸에 문어 같은 머리, 얼굴은 늘어진 촉수 덩어리.
// 고무 같은 비늘 살갗(검푸른 청록) 속에 희미한 별빛 반점, 등 뒤로 좁고 찢어진 날개, 한 팔을 높이 쳐들어 짓누르려 한다.
// (모양·색 수치는 uniform 매개변수(uA)로 넘긴다 — 셰이더 글자가 같으면 컴파일이 캐시되어 다시 그리기가 빠르다)
import { rng } from '../../lib.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(4)));
const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const lerp3 = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

/** 사슬 묶음: uB(점) + uP(묶음별 경계 구와 [시작, 끝, 부드러움, 재질]) — 최대 7묶음 */
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
    if (d < k + 0.2) {
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

export default function starSpawn({ seed = 1 } = {}) {
  const R = rng(seed * 4513 + 7);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };

  // ── 몸통·다리·팔 (재질 1, 검푸른 고무 비늘 살갗): 긴 역관절 다리, 솟은 등혹, 앞으로 늘어진 머리
  K.begin(1, 0.16);
  K.line([
    [0.0, 1.45, -0.18, 0.34],
    [0.0, 1.82, -0.02, 0.38],
    [0.0, 2.22, 0.24, 0.5],
    [0.0, 2.7, 0.0, 0.62],
    [0.0, 2.8, 0.38, 0.34],
  ]);
  // 등혹 양쪽 어깨 근육
  K.line([[-0.66, 2.66, 0.12, 0.31], [-0.34, 2.82, -0.06, 0.38], [0.34, 2.82, -0.06, 0.38], [0.66, 2.66, 0.12, 0.31]]);
  for (const s of [-1, 1]) {
    K.line([
      [s * 0.3, 1.42, -0.1, 0.27],
      [s * 0.5, 0.95, 0.3, 0.19],
      [s * 0.56, 0.4, -0.2, 0.12],
      [s * 0.58, 0.09, 0.12, 0.1],
    ]);
  }
  // 왼팔: 무릎 아래까지 늘어뜨림 / 오른팔: 머리 위로 쳐들어 발톱을 앞으로 내리꽂으려 한다
  const wristL = [-1.12, 0.98, 0.55];
  const wristR = [0.92, 3.72, 0.78];
  K.line([[-0.72, 2.56, 0.12, 0.25], [-1.06, 1.76, 0.34, 0.17], [...wristL, 0.12]]);
  K.line([[0.72, 2.62, 0.1, 0.25], [1.28, 3.22, 0.22, 0.18], [...wristR, 0.13]]);
  K.end();

  // ── 손가락·발톱 (재질 2, 검은 뿔)
  K.begin(2, 0.035);
  // 왼손: 아래로 늘어진 네 손가락, 끝이 안으로 굽는다
  for (let i = 0; i < 4; i++) {
    const o = (i - 1.5) * 0.08;
    const b = add(wristL, [o, -0.06, 0.04]);
    K.tube([b, add(b, [o * 1.3, -0.34, 0.1]), add(b, [o * 1.5, -0.62, 0.22]), add(b, [o * 1.2, -0.68, 0.4])], 3, 0.052, 0.008, 0.8);
  }
  // 오른손: 앞으로 내리꽂는 갈고리 넷
  for (let i = 0; i < 4; i++) {
    const a = -0.75 + i * 0.5;
    const b = add(wristR, [Math.sin(a) * 0.1, 0.02, 0.06]);
    const dir = [Math.sin(a) * 0.5, 0.15, 0.85];
    K.tube([b, add(b, mul(dir, 0.32)), add(b, add(mul(dir, 0.55), [0, -0.12, 0])), add(b, add(mul(dir, 0.55), [0, -0.38, -0.08]))], 3, 0.055, 0.008, 0.8);
  }
  // 발가락
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.45;
      const b = [s * 0.58, 0.08, 0.16];
      K.line([[...b, 0.065], [...add(b, [Math.sin(a) * 0.27, -0.06, Math.cos(a) * 0.36]), 0.01]]);
    }
  }
  K.end();

  // ── 머리: 앞으로 숙여 등혹보다 낮게 늘어졌다
  const HEAD = [0.0, 2.8, 0.74];
  const TILT = 0.45;
  const hw = (l) => [HEAD[0] + l[0], HEAD[1] + Math.cos(TILT) * l[1] - Math.sin(TILT) * l[2], HEAD[2] + Math.sin(TILT) * l[1] + Math.cos(TILT) * l[2]];
  // ── 얼굴 촉수 (재질 3): 주둥이에서 가슴으로 늘어져 끝이 말린다
  K.begin(3, 0.03);
  for (let i = 0; i < 8; i++) {
    const a = (i / 7 - 0.5) * 2.3;
    const s = hw([Math.sin(a) * 0.22, -0.26 - Math.abs(a) * 0.03, 0.2 + Math.cos(a) * 0.1]);
    const len = 0.7 + R() * 0.5 - Math.abs(a) * 0.12;
    const curl = (R() < 0.5 ? -1 : 1) * (0.08 + R() * 0.12);
    const e = add(s, [Math.sin(a) * 0.14 + curl, -len, 0.1 + R() * 0.12]);
    K.tube([s, add(s, [Math.sin(a) * 0.05, -len * 0.4, 0.12]), add(e, [-curl * 1.5, 0.14, 0.12]), e], 4, 0.06 - Math.abs(a) * 0.008, 0.01, 0.8);
  }
  K.end();

  // ── 날개: 날개 평면 (U 위·뒤, V 바깥) 위의 부채꼴. 뼈는 막과 같은 곡면을 따른다 (좌우 대칭)
  const wingRoot = [0.34, 3.0, -0.42];
  const dotp = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const nrm = (x) => mul(x, 1 / Math.hypot(...x));
  const WU = nrm([0.5, 0.8, -0.32]);
  const D = nrm([0.92, -0.1, -0.35]);
  const WV = nrm(sub(D, mul(WU, dotp(D, WU))));
  const WW = [WU[1] * WV[2] - WU[2] * WV[1], WU[2] * WV[0] - WU[0] * WV[2], WU[0] * WV[1] - WU[1] * WV[0]];
  const TH = [0.12, 0.72, 1.3, 1.85]; // 뼈 셋의 각 + 몸에 붙는 끝
  const LN = [1.65, 1.38, 1.02, 0.42];
  const CURVE = 0.16;
  const wingPt = (th, rho) => add(add(wingRoot, add(mul(WU, Math.cos(th) * rho), mul(WV, Math.sin(th) * rho))), mul(WW, CURVE * rho * rho));
  K.begin(2, 0.03);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const pts = [0, 0.5, 1].map((t, j) => {
        const q = wingPt(TH[i], LN[i] * t);
        return [sx * q[0], q[1], q[2], [0.075, 0.04, 0.012][j]];
      });
      K.line(pts);
    }
  }
  K.end();
  // ── 등뼈 가시 (재질 2)
  K.begin(2, 0.05);
  for (let i = 0; i < 4; i++) {
    const t = i / 3;
    const b = [0.0, 2.45 + t * 0.4, -0.5 - Math.sin(t * 3.0) * 0.08];
    K.line([[...b, 0.07], [...add(b, [0.0, 0.18 - t * 0.04, -0.3]), 0.008]]);
  }
  K.end();

  // ── 눈: 촉수 위, 깊은 눈두덩 아래 작은 눈 넷
  const uE = [];
  const uG = [];
  const eyeAt = (l, r) => {
    uE.push([...hw(l), r]);
    uG.push([l[0] * 0.8, -0.35, 1, 0]);
  };
  eyeAt([-0.16, 0.02, 0.36], 0.04);
  eyeAt([0.16, 0.02, 0.36], 0.04);
  eyeAt([-0.29, 0.1, 0.25], 0.025);
  eyeAt([0.29, 0.1, 0.25], 0.025);

  // ── 매개변수 블록 (uA)
  const P = {
    head: prm([...HEAD, TILT]), // 머리 중심, 앞으로 숙인 각
    cran: prm([0.46, 0.56, 0.62, 0.0]), // 두개 반지름
    mant: prm([0.0, 0.3, -0.3, 0.0]), // 두개(외투막) 중심 (머리 기준)
    brow: prm([0.0, 0.1, 0.3, 0.0]), // 눈두덩 위치 (머리 기준)
    wingR: prm([...wingRoot, 0.012]), // 날개 뿌리, 막 두께
    wu: prm([...WU, TH[0]]),
    wv: prm([...WV, TH[1]]),
    ww: prm([...WW, TH[2]]),
    wl: prm(LN),
    wt: prm([TH[3], CURVE, 0.3, 0]), // 마지막 각, 굽음, 가장자리 오목함
    skin: prm([0.028, 0.046, 0.05, 0.45]), // 살갗 색, 거칠기
    skin2: prm([0.06, 0.085, 0.08, 0.0]), // 비늘 마루 색
    horn: prm([0.03, 0.028, 0.025, 0.25]), // 뿔·발톱 색, 거칠기
    tent: prm([0.04, 0.06, 0.06, 0.3]), // 촉수 색
    memb: prm([0.032, 0.013, 0.012, 0.5]), // 날개막 색 (역광에 붉게 비친다)
    rimk: prm([0.4, 0.3, 0.1, 0.05]), // 막의 테두리광: 걷어낼 비율, 대신 남길 색
    star: prm([0.5, 1.0, 0.95, 0.7]), // 별빛 반점 색, 세기
  };

  return {
    preset: 'act4',
    cam: { pos: [-0.9, 0.55, 10.2], target: [0.1, 2.05, 0], fov: 1.8 },
    light: { key: [-0.4, 0.6, -0.75], fillCol: [0.1, 0.07, 0.15], amb: [0.02, 0.022, 0.03], rim: 2.0, eyeEmit: 1.5, exposure: 1.3 },
    frame: { fill: 0.92, bottom: 0.025 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uE, uG },
    glsl: /* glsl */ `
${CHAIN_GLSL}

float dot2(vec3 v) { return dot(v, v); }
float udTri(vec3 p, vec3 a, vec3 b, vec3 c) {
  vec3 ba = b - a; vec3 pa = p - a;
  vec3 cb = c - b; vec3 pb = p - b;
  vec3 ac = a - c; vec3 pc = p - c;
  vec3 nor = cross(ba, ac);
  if (sign(dot(cross(ba, nor), pa)) + sign(dot(cross(cb, nor), pb)) + sign(dot(cross(ac, nor), pc)) < 2.0)
    return sqrt(min(min(dot2(ba * clamp(dot(ba, pa) / dot2(ba), 0.0, 1.0) - pa), dot2(cb * clamp(dot(cb, pb) / dot2(cb), 0.0, 1.0) - pb)), dot2(ac * clamp(dot(ac, pc) / dot2(ac), 0.0, 1.0) - pc)));
  return sqrt(dot(nor, pa) * dot(nor, pa) / dot2(nor));
}

vec2 sdf(vec3 p) {
  vec2 r = chainSet(p);
  // ── 머리: 뒤로 부푼 두개, 앞으로 숙였다
  vec4 H = ${P.head};
  vec3 hq = p - H.xyz;
  hq.yz = rot(H.w) * hq.yz;
  vec3 cr = ${P.cran}.xyz;
  float head = sdEllipsoid(hq - ${P.mant}.xyz, cr);
  // 눈두덩 (무겁게 내려앉은 이마)
  vec3 bq = vec3(abs(hq.x), hq.y, hq.z) - vec3(0.16, ${P.brow}.y, ${P.brow}.z);
  head = smin(head, sdEllipsoid(bq, vec3(0.16, 0.07, 0.1)), 0.08);
  // 아래 얼굴 — 촉수가 나는 주둥이 덩어리
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.16, 0.2), vec3(0.27, 0.2, 0.2)), 0.12);
  r = usmin(r, vec2(head, 1.0), 0.12);
  // 촉수 뿌리 사이의 어둠
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.3, 0.3), vec3(0.14, 0.08, 0.06)), 99.0));

  // ── 날개막 (좌우 대칭): 날개 평면의 부채꼴, 뼈 사이 가장자리는 오목하게 파이고 막은 오목하게 휜다
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
  float holes = smoothstep(0.7, 0.76, noise(wq * 9.0 + 3.0)) * smoothstep(0.5, 1.0, rho / edge);
  memb = max(memb, holes * 0.05 - 0.01);
  r = usmin(r, vec2(memb, 4.0), 0.02);

  // 잔주름·비늘 굴곡 (한 번만)
  r.x += 0.01 * (0.5 - ridge(p * 9.0)) * step(r.y, 3.5);
  return r;
}

/** core의 테두리광 항 (그림자 무시) — 재질별로 빼거나 물들이기 위해 */
vec3 rimOf(vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  return pow(fres, 1.6) * max(dot(n, normalize(uKeyDir)) + 0.4, 0.0) * uRimCol * uRim;
}

// 재질은 반환을 하나로 — 분기 수만큼 음영 코드가 복제되지 않도록
Mat material(float id, vec3 p, vec3 n) {
  // 비늘: 엇갈린 육각 격자 비슷한 셀 무늬 (값싼 근사)
  float grime = 0.6 + 0.7 * fbm3(p * 3.0);
  vec3 sp = p * 15.0 + 2.5 * grime;
  vec2 cell = vec2(sp.x + 0.5 * floor(sp.y), sp.y);
  vec2 fc = fract(cell) - 0.5;
  float scale = smoothstep(0.5, 0.2, length(fc * vec2(1.0, 1.3))) * 0.6;
  float specks = smoothstep(0.93, 0.985, noise(p * 46.0)) * smoothstep(0.58, 0.8, noise(p * 1.9 + 7.0));
  vec4 sk = ${P.skin};
  vec3 alb = mix(sk.rgb, ${P.skin2}.rgb, scale * 0.8);
  float rough = sk.a;
  float spec = 0.7;
  float irid = 0.15;
  float sss = 0.25;
  float wet = 0.45;
  vec3 emi = ${P.star}.rgb * ${P.star}.a * specks * 0.6;
  if (id > 1.5 && id < 2.5) {
    alb = ${P.horn}.rgb; rough = ${P.horn}.a; spec = 1.2; irid = 0.1; sss = 0.0; wet = 0.5; emi = vec3(0.0);
  } else if (id > 2.5 && id < 3.5) {
    alb = ${P.tent}.rgb; rough = ${P.tent}.a; spec = 0.9; irid = 0.25; sss = 0.5; wet = 0.8;
    emi = ${P.star}.rgb * ${P.star}.a * specks;
  } else if (id > 3.5) {
    alb = ${P.memb}.rgb; rough = ${P.memb}.a; spec = 0.08; irid = 0.0; sss = 0.8; wet = 0.0;
    // 막은 비스듬히 보여 테두리광이 지나치게 금빛으로 탄다 → 그 빛을 대부분 걷어 내고 검붉게 남긴다
    emi = -rimOf(p, n) * ${P.rimk}.x + rimOf(p, n) * ${P.rimk}.yzw;
  }
  return Mat(alb * grime, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
