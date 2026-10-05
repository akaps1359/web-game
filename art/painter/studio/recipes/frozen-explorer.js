// 동사한 탐사대원 (3층 일반) — 미스캐토닉 탐사대의 털 두른 방한복을 입은 채 얼어 죽은 시신.
// 뻣뻣하게 굳어 고개가 한쪽으로 꺾였고, 서리 앉은 눈썹 아래 눈동자는 하얗게 얼었다. 수염엔 고드름.
// 얼어붙은 손은 아직 얼음도끼를 어깨 위로 쳐들고 있고, 다른 손은 갈고리처럼 굳은 채 앞으로 뻗었다.
// 방한복 밑단·소매·도끼날에 고드름이 매달리고, 어깨와 두건 위엔 눈이 쌓였다.
// expedition(opts)는 얼어붙은 대원(frozen-crewman)과 시간에 얼어붙은 탐사대장(frozen-leader)도 쓴다.
import { rng } from '../../lib.js';

const v3 = (a) => `vec3(${a.map((x) => (+x).toFixed(4)).join(', ')})`;

export function expedition(o = {}) {
  const O = {
    seed: 1,
    yaw: -0.3,
    hunch: 0.55,
    lean: 0.0, // 옆으로 기운 상체
    tilt: 0.5, // 고개 옆으로 꺾임
    bow: 0.3, // 고개 숙임
    tool: 'axe', // axe | pick | flare
    ice: 1.0, // 고드름·서리 양
    leader: false,
    goggles: false,
    scarf: false,
    cam: { pos: [1.0, 0.85, 6.2], target: [0.05, 1.05, 0.0], fov: 1.85 },
    light: {},
    extraGlsl: '',
    extraSdf: '',
    extraMat: '',
    extraArrays: {},
    ...o,
  };
  const R = rng(O.seed * 613 + 11);
  const bend = (y) => {
    const h = Math.max(y - 0.9, 0);
    return O.hunch * h * h;
  };
  const bendX = (y) => {
    const h = Math.max(y - 0.9, 0);
    return O.lean * h * h;
  };
  // 관절 (몸 지역 좌표: yaw로 돌리기 전, 굽힘 포함)
  const shR = [0.215 + bendX(1.39), 1.39 - O.lean * 0.1, bend(1.39) - 0.01];
  const shL = [-0.215 + bendX(1.39), 1.39 + O.lean * 0.1, bend(1.39) - 0.01];
  const head = [bendX(1.635), 1.635 - Math.abs(O.lean) * 0.06, bend(1.635) + 0.03];
  const sx = bendX(1.2);
  let elR;
  let wrR;
  let elL;
  let wrL;
  let toolDir;
  if (O.tool === 'flare') {
    // 조명탄 권총을 하늘로 쳐들었다
    elR = [0.36, 1.62, 0.12];
    wrR = [0.37, 1.9, 0.2];
    toolDir = [0.05, 0.25, 1.0];
    elL = [-0.34, 1.12, 0.1];
    wrL = [-0.36, 0.86, 0.22];
  } else if (O.tool === 'pick') {
    // 곡괭이를 늘어뜨려 끌고 다닌다
    elR = [0.33, 1.1, 0.06];
    wrR = [0.36, 0.84, 0.16];
    toolDir = [0.12, -1.0, 0.3];
    elL = [-0.33, 1.12, 0.12];
    wrL = [-0.31, 0.95, 0.33];
  } else {
    // 얼음도끼를 어깨 위로 쳐들었다
    elR = [0.42, 1.16, 0.1];
    wrR = [0.43, 1.42, 0.22];
    toolDir = [0.2, 1.0, -0.42];
    elL = [-0.33, 1.13, 0.16];
    wrL = [-0.3, 1.06, 0.45];
  }
  for (const j of [elR, wrR, elL, wrL]) j[0] += sx;
  if (O.onJoints) O.onJoints({ head, shR, shL, elR, wrR, elL, wrL, toolDir: toolDir.map((v) => v / Math.hypot(...toolDir)) });
  const tl = Math.hypot(...toolDir);
  toolDir = toolDir.map((v) => v / tl);

  // ── 고드름 (uB: 두 점씩 끊어서) — 지역 좌표
  const ic = [];
  const icicle = (top, r, len) => {
    ic.push([top[0], top[1], top[2], r], [top[0] + (R() - 0.5) * 0.01, top[1] - len, top[2] + (R() - 0.5) * 0.01, 0.0015], [0, 0, 0, 0]);
  };
  const hemY = O.leader ? 0.3 : 0.6;
  const nHem = Math.round(22 * O.ice);
  for (let i = 0; i < nHem; i++) {
    const a = -0.2 + R() * (Math.PI + 0.4); // 앞쪽 반원 위주
    const rr = (O.leader ? 0.33 : 0.285) - 0.02;
    icicle([Math.cos(a) * rr, hemY + 0.02, Math.sin(a) * rr / 1.3], 0.005 + R() * 0.007, 0.03 + Math.pow(R(), 2.0) * 0.18 * O.ice);
  }
  for (const w of [wrR, wrL]) {
    const n = Math.round(4 * O.ice);
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      icicle([w[0] + Math.cos(a) * 0.065, w[1] + 0.06 - 0.03, w[2] + Math.sin(a) * 0.065], 0.004 + R() * 0.005, 0.03 + R() * 0.07 * O.ice);
    }
  }
  // 팔꿈치 아래
  for (const e of [elR, elL]) {
    for (let i = 0; i < Math.round(2 * O.ice); i++) icicle([e[0] + (R() - 0.5) * 0.06, e[1] - 0.06, e[2] + (R() - 0.5) * 0.05], 0.007, 0.04 + R() * 0.06);
  }

  const light = {
    key: [-0.4, 0.78, -0.5],
    fillCol: [0.05, 0.1, 0.12],
    amb: [0.016, 0.022, 0.034],
    exposure: 1.3,
    pt: [0.05, 1.5, 0.85],
    ptCol: [0.45, 0.6, 0.8],
    rim: 2.3,
    ...O.light,
  };

  return {
    preset: 'act3',
    cam: O.cam,
    light,
    frame: { fill: 0.92, ...(O.frame ?? {}) },
    arrays: { uB: ic, ...O.extraArrays },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 64
#define VOLUME_FAR 14.0
const float YAW = ${O.yaw.toFixed(4)};
const float HUNCH = ${O.hunch.toFixed(4)};
const float LEAN = ${O.lean.toFixed(4)};
const vec3 HEAD = ${v3(head)};
const vec3 SH_R = ${v3(shR)};
const vec3 SH_L = ${v3(shL)};
const vec3 EL_R = ${v3(elR)};
const vec3 WR_R = ${v3(wrR)};
const vec3 EL_L = ${v3(elL)};
const vec3 WR_L = ${v3(wrL)};
const vec3 TOOL_DIR = ${v3(toolDir)};
const float TILT = ${O.tilt.toFixed(4)};
const float BOW = ${O.bow.toFixed(4)};
const float ICE = ${O.ice.toFixed(3)};
const float LEADER = ${O.leader ? '1.0' : '0.0'};
const float GOGGLES = ${O.goggles ? '1.0' : '0.0'};
const float SCARF = ${O.scarf ? '1.0' : '0.0'};
const int TOOL = ${O.tool === 'axe' ? 0 : O.tool === 'pick' ? 1 : 2};

float bendZ(float y) { float h = max(y - 0.9, 0.0); return HUNCH * h * h; }
float bendX(float y) { float h = max(y - 0.9, 0.0); return LEAN * h * h; }

vec3 headLocal(vec3 p) {
  vec3 hq = p - HEAD;
  hq.xy = rot(TILT) * hq.xy;
  hq.yz = rot(BOW) * hq.yz;
  return hq;
}

/** 두툼한 가죽 장갑: 손목 w, 손가락 방향 f, 손등 u, 손가락별 굽힘 c (얼어서 갈고리처럼) */
float glove(vec3 p, vec3 w, vec3 f, vec3 u, vec4 c, float sp) {
  float bd = length(p - w);
  if (bd > 0.3) return bd - 0.2;
  f = normalize(f);
  u = normalize(u - f * dot(u, f));
  vec3 sd = cross(f, u);
  vec3 pc = w + f * 0.06;
  vec3 q = p - pc;
  vec3 lq = vec3(dot(q, sd), dot(q, u), dot(q, f));
  float d = sdEllipsoid(lq, vec3(0.05, 0.025, 0.055));
  d = smin(d, sdRoundCone(p, w - f * 0.05, pc, 0.045, 0.035), 0.03);
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    float cu = i == 0 ? c.x : i == 1 ? c.y : i == 2 ? c.z : c.w;
    vec3 a = pc + f * 0.045 - sd * fi * 0.024;
    vec3 dd = normalize(f - sd * fi * sp);
    float len = 0.04 - abs(fi + 0.3) * 0.004;
    float r = 0.0118;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.9), 0.006);
      a = b;
      r *= 0.9;
      len *= 0.85;
      dd = normalize(dd - u * cu * 0.75);
    }
  }
  vec3 ta = pc - f * 0.02 + sd * 0.045;
  vec3 tb = ta + normalize(f * 0.7 + sd * 0.6 - u * 0.4) * 0.045;
  d = smin(d, sdRoundCone(p, ta, tb, 0.016, 0.013), 0.012);
  return d;
}

/** 두꺼운 소매: 어깨 → 팔꿈치 → 손목, 소매 끝엔 털 */
float sleeve(vec3 p, vec3 s, vec3 e, vec3 w) {
  float d = sdRoundCone(p, s, e, 0.088, 0.078);
  d = smin(d, sdRoundCone(p, e, w, 0.078, 0.07), 0.05);
  // 주름: 팔꿈치 안쪽
  d += 0.008 * sin(dot(p - e, normalize(w - s)) * 60.0) * smoothstep(0.12, 0.0, length(p - e));
  return d;
}

/** 공구: 손 h에서 방향 dir로 */
float tool(vec3 p, vec3 h, vec3 dir, int kind, out float isMetal) {
  isMetal = 0.0;
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
  vec3 fwd = cross(side, dir);
  if (kind == 0) {
    // 얼음도끼: 나무 자루 + 강철 머리 (곡괭이 날 + 손도끼 날)
    vec3 a = h - dir * 0.16;
    vec3 b = h + dir * 0.66;
    float shaft = sdCapsule(p, a, b, 0.017);
    vec3 q = p - b;
    vec3 lq = vec3(dot(q, side), dot(q, dir), dot(q, fwd));
    // 곡괭이 날: 바깥(side +)으로 휘어 내려간다
    float pk = 1e5;
    for (int i = 0; i < 6; i++) {
      float t0 = float(i) / 6.0;
      float t1 = float(i + 1) / 6.0;
      vec3 c0 = vec3(t0 * 0.2, -0.06 * t0 * t0 * 1.6, 0.0);
      vec3 c1 = vec3(t1 * 0.2, -0.06 * t1 * t1 * 1.6, 0.0);
      pk = min(pk, sdRoundCone(lq, c0, c1, mix(0.018, 0.003, t0), mix(0.018, 0.003, t1)));
    }
    pk = max(pk, abs(lq.z) - 0.012);
    // 손도끼 날: 반대쪽, 넓고 납작
    float adze = sdBox(lq - vec3(-0.08, -0.008, 0.0), vec3(0.075, 0.016 + 0.012 * smoothstep(-0.02, -0.15, lq.x), 0.006));
    float collar = sdRoundBox(lq, vec3(0.03, 0.035, 0.022), 0.006);
    float head = min(min(pk, adze), collar);
    float spike = sdRoundCone(p, a, a - dir * 0.06, 0.016, 0.002);
    isMetal = head < shaft ? 1.0 : 0.0;
    float d = min(shaft, head);
    if (spike < d) { d = spike; isMetal = 1.0; }
    return d;
  } else if (kind == 1) {
    // 곡괭이: 손에서 아래로, 끝에 양날 곡괭이 머리
    vec3 a = h - dir * 0.12;
    vec3 b = h + dir * 0.58;
    float shaft = sdCapsule(p, a, b, 0.019);
    vec3 q = p - b;
    vec3 lq = vec3(dot(q, side), dot(q, dir), dot(q, fwd));
    float pk = 1e5;
    for (int s = 0; s < 2; s++) {
      float sg = s == 0 ? 1.0 : -1.0;
      for (int i = 0; i < 5; i++) {
        float t0 = float(i) / 5.0;
        float t1 = float(i + 1) / 5.0;
        vec3 c0 = vec3(sg * t0 * 0.23, -0.07 * t0 * t0, 0.0);
        vec3 c1 = vec3(sg * t1 * 0.23, -0.07 * t1 * t1, 0.0);
        pk = min(pk, sdRoundCone(lq, c0, c1, mix(0.022, 0.004, t0), mix(0.022, 0.004, t1)));
      }
    }
    pk = min(pk, sdRoundBox(lq, vec3(0.035, 0.03, 0.026), 0.006));
    isMetal = pk < shaft ? 1.0 : 0.0;
    return min(shaft, pk);
  }
  // 조명탄 권총: 굵은 총열, 손잡이
  vec3 q = p - h;
  vec3 lq = vec3(dot(q, side), dot(q, dir), dot(q, fwd));
  float grip = sdRoundBox(lq - vec3(0.0, -0.02, -0.03), vec3(0.016, 0.05, 0.022), 0.008);
  vec3 bq = p - (h + dir * 0.03 + fwd * 0.0);
  vec3 blq = vec3(dot(bq, side), dot(bq, fwd), dot(bq, dir));
  float barrel = sdCylinder(vec3(blq.x, blq.z - 0.1, blq.y - 0.03), 0.12, 0.024);
  barrel = max(barrel, -sdCylinder(vec3(blq.x, blq.z - 0.12, blq.y - 0.03), 0.12, 0.016));
  float frame = sdRoundBox(lq - vec3(0.0, 0.02, 0.0), vec3(0.018, 0.035, 0.03), 0.006);
  isMetal = 1.0;
  return min(min(grip, barrel), frame);
}

/** 바람 맞는 쪽(-x, 위) 정도: 가장 가까운 뼈대(몸통·팔·두건·다리)에서 바깥 방향 */
vec3 segOut(vec3 p, vec3 a, vec3 b, inout float best) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  vec3 v = pa - ba * h;
  float l = length(v);
  if (l < best) { best = l; return v / max(l, 1e-4); }
  return vec3(0.0);
}
float windward(vec3 p, vec3 b) {
  float best = 1e5;
  vec3 dir = vec3(0.0);
  vec3 o;
  o = segOut(b, vec3(0.0, 0.7, 0.0), vec3(0.0, 1.32, -0.01), best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, SH_L, EL_L, best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, EL_L, WR_L, best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, SH_R, EL_R, best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, EL_R, WR_R, best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, HEAD, HEAD + vec3(0.0, 0.02, -0.02), best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, vec3(-0.11, 0.82, 0.0), vec3(-0.135, 0.1, 0.09), best); if (dot(o, o) > 0.0) dir = o;
  o = segOut(p, vec3(0.11, 0.82, 0.0), vec3(0.135, 0.1, -0.07), best); if (dot(o, o) > 0.0) dir = o;
  return clamp(dot(dir, normalize(vec3(-1.0, 0.35, 0.25))), 0.0, 1.0);
}
float rimeAmt(vec3 p, vec3 b) {
  float w = smoothstep(0.25, 0.85, windward(p, b));
  return w * ICE * (0.35 + 0.65 * smoothstep(0.3, 0.7, fbm3(p * 7.0)));
}

${O.extraGlsl}

vec2 sdf(vec3 p) {
  vec3 w = p;
  p.xz = rot(YAW) * p.xz;
  vec3 b = p;
  b.z -= bendZ(b.y);
  b.x -= bendX(b.y);

  // ── 방한복 (아노락): 가슴·배·치마 자락, 들쭉날쭉한 밑단
  float chest = sdEllipsoid(b - vec3(0.0, 1.23, -0.01), vec3(0.228, 0.27, 0.16));
  float belly = sdEllipsoid(b - vec3(0.0, 0.97, 0.005), vec3(0.215, 0.3, 0.165));
  float hemY = mix(0.6, 0.3, LEADER);
  float topY = 1.02;
  float yy = clamp((b.y - hemY) / (topY - hemY), 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rr = mix(mix(0.265, 0.335, LEADER), 0.215, pow(yy, 0.8));
  rr += 0.016 * (1.0 - yy) * (sin(ang * 7.0 + yy * 3.0) * 0.6 + sin(ang * 15.0 + 1.3) * 0.4);
  float skirt = (length(b.xz * vec2(1.0, 1.3)) - rr) * 0.75;
  float jag = 0.012 + 0.03 * fbm3(vec3(b.x * 11.0, 0.0, b.z * 11.0));
  skirt = max(skirt, max(hemY + jag - b.y, b.y - topY));
  float sh = min(sdSphere(b - vec3(0.19, 1.385, -0.015), 0.095), sdSphere(b - vec3(-0.19, 1.385, -0.015), 0.095));
  float parka = smin(chest, belly, 0.12);
  parka = smin(parka, skirt, 0.08);
  parka = smin(parka, sh, 0.1);
  // 주름: 허리띠 아래로 늘어진 세로 주름, 허리띠 위로 접힌 가로 주름
  float fz = smoothstep(1.02, 0.7, b.y) * (1.0 - LEADER * 0.3);
  parka += 0.011 * fz * sin(ang * 10.0 + 2.5 * noise(vec3(b.x * 5.0, b.y * 1.5, b.z * 5.0)));
  parka += 0.004 * sin(b.y * 75.0 + 3.0 * noise(b * 6.0)) * smoothstep(0.12, 0.0, abs(b.y - 1.07));
  // 허리띠가 졸라맨 허리
  float beltY = mix(0.99, 1.0, LEADER);
  parka += 0.018 * exp(-pow((b.y - beltY) / 0.035, 2.0));
  // 가슴 주머니 덮개
  vec3 pq = b - vec3(0.0, 1.2, 0.0);
  pq.x = abs(pq.x) - 0.11;
  float flap = sdRoundBox(pq - vec3(0.0, 0.0, 0.155), vec3(0.06, 0.035, 0.012), 0.008);
  parka = smin(parka, flap, 0.012);
  // 앞섶 여밈선
  parka = smax(parka, -sdBox(b - vec3(0.0, 1.0, 0.2), vec3(0.004, 0.42, 0.05)), 0.006);
  // 두건 뒤로 처진 부분 → 어깨
  parka = smin(parka, sdRoundCone(p, HEAD + vec3(0.0, -0.06, -0.06), vec3(bendX(1.4), 1.4, bendZ(1.4) - 0.04), 0.13, 0.16), 0.06);

  // ── 두건과 털 목도리
  vec3 hq = headLocal(p);
  float hood = sdEllipsoid(hq - vec3(0.0, 0.015, -0.02), vec3(0.145, 0.17, 0.158));
  float opening = sdEllipsoid(hq - vec3(0.0, -0.02, 0.13), vec3(0.1, 0.125, 0.1));
  float hollow = sdEllipsoid(hq - vec3(0.0, -0.01, 0.0), vec3(0.115, 0.14, 0.13));
  hood = max(hood, -opening);
  hood = max(hood, -max(hollow, -hq.z + 0.0));
  parka = smin(parka, hood, 0.04);

  // ── 소매
  float arms = min(sleeve(p, SH_R, EL_R, WR_R), sleeve(p, SH_L, EL_L, WR_L));
  parka = smin(parka, arms, 0.06);
  parka += 0.004 * (fbm3(p * 24.0) - 0.5);
  // 바람 맞은 쪽의 상고대: 바람을 거슬러 자란 얼음 깃털
  float rime = 0.0;
  if (parka < 0.08) {
    rime = rimeAmt(p, b);
    if (rime > 0.01) {
      float spikes = pow(noise(vec3(p.x * 9.0, p.y * 42.0, p.z * 42.0)), 2.0) * 0.7 + 0.3 * noise(p * 90.0);
      parka -= rime * (0.006 + 0.026 * spikes);
    }
  }
  vec2 r = vec2(parka, 1.0);

  // 털: 두건 테두리 + 소매 끝
  vec3 rq = hq - vec3(0.0, -0.02, 0.115);
  float ruff = length(vec2(length(rq.xy * vec2(1.0, 0.8)) - 0.115, rq.z + 0.005)) - 0.026;
  vec3 c1 = WR_R - normalize(WR_R - EL_R) * 0.02;
  vec3 c2 = WR_L - normalize(WR_L - EL_L) * 0.02;
  float cuff = min(sdSphere(p - c1, 0.074), sdSphere(p - c2, 0.074));
  ruff = min(ruff, cuff);
  if (ruff < 0.06) {
    float th = atan(rq.y, rq.x);
    float rho = length(rq.xy);
    float clump = fbm3(vec3(th * 6.0, rq.z * 16.0, rho * 10.0));
    float fib = noise(vec3(th * 45.0, rq.z * 30.0, rho * 3.0));
    ruff += 0.036 * (clump - 0.5) + 0.008 * (fib - 0.5) + 0.004 * (noise(p * 160.0) - 0.5);
  }
  r = umin(r, vec2(ruff * 0.8, 5.0));

  // ── 얼굴: 여윈 얼굴, 깊게 꺼진 눈두덩 속 하얗게 언 눈, 벌어진 입, 성에 낀 수염 (얼굴 앞면 z≈0.11)
  vec3 eq = hq;
  eq.x = abs(eq.x);
  float face = sdEllipsoid(hq - vec3(0.0, 0.012, 0.0), vec3(0.08, 0.1, 0.098));
  face = smin(face, sdEllipsoid(hq - vec3(0.0, -0.04, 0.035), vec3(0.064, 0.068, 0.072)), 0.03);
  // 눈썹뼈·광대
  face = smin(face, sdEllipsoid(hq - vec3(0.0, 0.03, 0.083), vec3(0.066, 0.017, 0.026)), 0.018);
  face = smin(face, sdEllipsoid(eq - vec3(0.05, -0.012, 0.08), vec3(0.022, 0.014, 0.02)), 0.015);
  // 코: 동상으로 검게 썩은 끝
  face = smin(face, sdRoundCone(hq, vec3(0.0, 0.016, 0.098), vec3(0.0, -0.028, 0.128), 0.011, 0.014), 0.01);
  // 눈두덩
  face = smax(face, -sdSphere(eq - vec3(0.033, 0.006, 0.104), 0.021), 0.012);
  // 꺼진 볼
  face = smax(face, -sdEllipsoid(eq - vec3(0.052, -0.048, 0.1), vec3(0.02, 0.024, 0.016)), 0.018);
  // 벌어진 입 (턱이 처졌다)
  float mouth = sdEllipsoid(hq - vec3(0.0, -0.07, 0.1), vec3(0.025, 0.017, 0.03));
  face = smax(face, -mouth, 0.008);
  r = umin(r, vec2(face, 4.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.07, 0.088), vec3(0.021, 0.014, 0.02)), 99.0));
  // 하얗게 언 눈알 (반쯤 뜬)
  float eye = sdSphere(eq - vec3(0.033, 0.004, 0.09), 0.0145);
  eye = max(eye, -(eq.y - 0.0135));
  r = umin(r, vec2(eye, 7.0));
  // 수염 (턱과 볼을 덮고 입은 비운다)
  float beard = sdEllipsoid(hq - vec3(0.0, -0.09, 0.068), vec3(0.058, 0.04, 0.045));
  beard = smin(beard, sdEllipsoid(eq - vec3(0.056, -0.06, 0.06), vec3(0.022, 0.04, 0.035)), 0.02);
  beard = max(beard, -sdEllipsoid(hq - vec3(0.0, -0.072, 0.11), vec3(0.032, 0.022, 0.04)));
  if (beard < 0.05) beard += 0.01 * (fbm3(hq * vec3(60.0, 25.0, 60.0)) - 0.5);
  for (int i = 0; i < 5; i++) {
    float fi = float(i) - 2.0;
    vec3 t = vec3(fi * 0.02, -0.118 + abs(fi) * 0.008, 0.085 - abs(fi) * 0.012);
    beard = min(beard, sdRoundCone(hq, t, t + vec3(fi * 0.003, -0.03 - 0.025 * hash11(fi + 3.0), 0.004), 0.0055, 0.0012));
  }
  r = umin(r, vec2(beard, 6.0));
  // 눈썹 서리
  r = umin(r, vec2(sdEllipsoid(eq - vec3(0.035, 0.03, 0.1), vec3(0.025, 0.007, 0.012)) - 0.002 * noise(hq * 200.0), 6.0));

  // 얼어붙은 목도리: 코 아래 얼굴을 칭칭 감았다
  if (SCARF > 0.5) {
    vec3 sq = hq - vec3(0.0, -0.07, 0.02);
    float band = length(vec2(length(sq.xz * vec2(1.0, 0.92)) - 0.085, sq.y * 0.55)) - 0.033;
    band = smin(band, sdEllipsoid(hq - vec3(0.0, -0.08, 0.08), vec3(0.075, 0.06, 0.06)), 0.03);
    band += 0.006 * sin(hq.y * 160.0 + hq.x * 30.0) + 0.006 * (fbm3(hq * 50.0) - 0.5);
    // 늘어진 끝자락
    band = smin(band, sdRoundCone(hq, vec3(0.05, -0.1, 0.06), vec3(0.09, -0.3, 0.1), 0.028, 0.02), 0.02);
    r = umin(r, vec2(band, 13.0));
  }
  // 방한 고글 (이마에 올린)
  if (GOGGLES > 0.5) {
    vec3 gq = eq - vec3(0.034, 0.075, 0.075);
    float lens = sdCylinder(vec3(gq.x, gq.z, gq.y), 0.012, 0.026);
    float strap = length(vec2(length(hq.xz * vec2(1.0, 0.95)) - 0.125, hq.y - 0.075)) - 0.008;
    strap = max(strap, -hq.z - 0.02);
    r = umin(r, vec2(min(lens, strap), 12.0));
  }

  // 허리띠 + 버클
  float bl = max(abs(length(b.xz * vec2(1.0, 1.3)) - 0.205) - 0.012, abs(b.y - beltY) - 0.024);
  bl = min(bl, sdRoundBox(b - vec3(0.0, beltY, 0.162), vec3(0.03, 0.03, 0.01), 0.004));
  r = umin(r, vec2(bl, 3.0));

  // ── 바지와 장화
  float legs = 1e5;
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? 1.0 : -1.0;
    float fw = sg < 0.0 ? 0.09 : -0.07;
    vec3 hip = vec3(0.105 * sg, 0.84, 0.0);
    vec3 kn = vec3(0.125 * sg, 0.48, 0.05 + fw * 0.7);
    vec3 an = vec3(0.135 * sg, 0.16, fw);
    legs = min(legs, smin(sdRoundCone(p, hip, kn, 0.09, 0.075), sdRoundCone(p, kn, an, 0.075, 0.068), 0.04));
  }
  legs += 0.003 * (fbm3(p * 30.0) - 0.5);
  float bunch = smoothstep(0.08, 0.0, abs(p.y - 0.33));
  legs += 0.004 * bunch * sin(p.y * 70.0 + 6.0 * noise(p * 7.0));
  if (legs < 0.06) {
    float rl = rimeAmt(p, b);
    if (rl > 0.01) legs -= rl * (0.005 + 0.02 * pow(noise(vec3(p.x * 9.0, p.y * 42.0, p.z * 42.0)), 2.0));
  }
  r = umin(r, vec2(legs, 2.0));
  float boots = 1e5;
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? 1.0 : -1.0;
    vec3 f = vec3(0.135 * sg, 0.0, sg < 0.0 ? 0.09 : -0.07);
    float bt = sdRoundCone(p, f + vec3(0.0, 0.3, -0.005), f + vec3(0.0, 0.07, 0.0), 0.078, 0.072);
    bt = smin(bt, sdEllipsoid(p - f - vec3(0.0, 0.055, 0.06), vec3(0.072, 0.056, 0.13)), 0.05);
    bt += 0.003 * sin(p.y * 90.0 + 7.0 * noise(p * 10.0)) * smoothstep(0.08, 0.2, p.y);
    bt = max(bt, -p.y);
    boots = min(boots, bt);
  }
  r = umin(r, vec2(boots, 3.0));

  // ── 장갑과 공구
  float gR = glove(p, WR_R, normalize(TOOL_DIR * 0.2 + normalize(WR_R - EL_R)), normalize(vec3(1.0, 0.0, -0.3)), vec4(1.5, 1.55, 1.6, 1.6), 0.03);
  float gL = glove(p, WR_L, normalize(WR_L - EL_L + vec3(0.0, -0.25, 0.15)), normalize(vec3(-0.3, 1.0, 0.2)), vec4(1.05, 1.15, 1.25, 1.35), 0.1);
  r = umin(r, vec2(min(gR, gL), 3.0));
  float metal;
  vec3 gripAt = WR_R + normalize(WR_R - EL_R) * 0.075;
  float tl = tool(p, gripAt, TOOL_DIR, TOOL, metal);
  r = umin(r, vec2(tl, metal > 0.5 ? 9.0 : 10.0));

  // 밧줄 타래 (왼어깨 → 오른허리)
  vec3 cq = b - vec3(0.0, 1.13, 0.02);
  cq.xy = rot(-0.75) * cq.xy;
  float coil = length(vec2(length(cq.xz * vec2(1.0, 1.35)) - 0.27, cq.y)) - 0.022;
  coil = min(coil, length(vec2(length(cq.xz * vec2(1.0, 1.35)) - 0.27, cq.y - 0.03)) - 0.02);
  if (LEADER < -1.0) r = umin(r, vec2(coil, 11.0));

  // ── 고드름
  float ice = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 c = uB[i + 1];
    if (a.w <= 0.0 || c.w <= 0.0) continue;
    ice = min(ice, sdRoundCone(p, a.xyz, c.xyz, a.w, c.w));
  }
  r = umin(r, vec2(ice, 8.0));
  ${O.extraSdf}
  return r;
}

// 발치에 흩날리는 눈보라 (바람은 -x 쪽에서 분다)
vec4 volume(vec3 p) {
  vec4 v = vec4(0.0);
  ${O.extraVol ?? ''}
  if (p.y > 0.6 || p.y < -0.02) return v;
  float r = length(p.xz - vec2(0.05, 0.05));
  if (r > ${(O.mistR ?? 0.7).toFixed(2)}) return v;
  vec3 q = p * vec3(2.2, 7.0, 4.0) + vec3(-p.y * 3.0, 0.0, 0.0);
  float streak = smoothstep(0.33, 0.62, fbm3(q + vec3(3.1, 0.0, 1.7)));
  float d = streak * smoothstep(0.3, 0.0, p.y) * 0.9 * smoothstep(${(O.mistR ?? 0.7).toFixed(2)}, 0.3, r) * ${(O.mist ?? 1).toFixed(2)};
  return v + vec4(vec3(0.3, 0.4, 0.52) * d * 0.9, d * 1.6);
}

float snowAt(vec3 p, vec3 n) {
  return smoothstep(0.5, 0.85, n.y + 0.35 * (fbm3(p * 9.0) - 0.5)) * ICE;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float snow = snowAt(lp, n);
  vec3 lb = lp;
  lb.z -= bendZ(lb.y);
  lb.x -= bendX(lb.y);
  float rimeM = (id < 3.5) ? smoothstep(0.15, 0.55, rimeAmt(lp, lb)) : 0.0;
  float glint = step(0.996, hash31(floor(lp * 420.0))) * ICE * max(rimeM, snowAt(lp, n));
  vec3 snowCol = vec3(0.3, 0.35, 0.42);
  vec3 glEmi = vec3(0.5, 0.75, 1.0) * glint * 0.35;
  float frostAll = (0.25 + 0.35 * fbm3(lp * 14.0)) * ICE;
  ${O.extraMat}
  if (id < 1.5) {
    // 바랜 캔버스 방한복: 얼룩, 서리
    float dirt = fbm3(lp * 6.0);
    float weave = 0.85 + 0.15 * noise(lp * vec3(180.0, 40.0, 180.0));
    vec3 alb = mix(vec3(0.095, 0.078, 0.055), vec3(0.045, 0.05, 0.05), LEADER) * (0.55 + 0.8 * dirt) * weave;
    alb = mix(alb, vec3(0.13, 0.15, 0.18), frostAll * 0.5);
    alb = mix(alb, snowCol, max(snow, rimeM * 0.9));
    float sn = max(snow, rimeM);
    return Mat(alb, 0.85 - sn * 0.3, 0.1 + sn * 0.7, glEmi * (0.3 + sn), 0.0, sn * 0.5, 0.05 + frostAll * 0.2);
  }
  float crust = smoothstep(0.32, 0.05, lp.y + 0.12 * (fbm3(lp * 12.0) - 0.5)) * ICE;
  snow = max(snow, crust * 0.85);
  if (id < 2.5) {
    float dirt = fbm3(lp * 8.0);
    vec3 alb = vec3(0.028, 0.03, 0.034) * (0.6 + 0.8 * dirt);
    alb = mix(alb, vec3(0.12, 0.14, 0.17), frostAll * 0.45);
    alb = mix(alb, snowCol, max(snow, rimeM * 0.9));
    return Mat(alb, 0.9, 0.08 + rimeM * 0.6, glEmi * 0.4, 0.0, rimeM * 0.5, 0.05);
  }
  if (id < 3.5) {
    // 얼어 갈라진 가죽 (장화·장갑)
    float crack = smoothstep(0.05, 0.0, ridge(lp * 26.0));
    vec3 alb = vec3(0.04, 0.03, 0.022) * (0.7 + 0.5 * fbm3(lp * 20.0)) * (1.0 - crack * 0.5);
    alb = mix(alb, vec3(0.14, 0.16, 0.19), frostAll * 0.6 + crack * 0.2);
    alb = mix(alb, snowCol, snow);
    return Mat(alb, 0.55, 0.45, glEmi * 0.5, 0.0, 0.0, 0.25);
  }
  if (id < 4.5) {
    // 동상으로 검푸르게 죽은 살갗: 코·뺨·귀 끝이 검게 썩었다
    vec3 hq = headLocal(lp);
    float bite = smoothstep(0.35, 0.75, fbm3(lp * 30.0)) * 0.6 + smoothstep(0.1, 0.13, hq.z) * 0.8;
    float pore = noise(lp * 260.0);
    vec3 alb = mix(vec3(0.13, 0.12, 0.13), vec3(0.03, 0.022, 0.028), clamp(bite, 0.0, 1.0)) * (0.85 + 0.3 * pore);
    float rime = smoothstep(0.55, 0.8, fbm3(lp * 45.0) + n.y * 0.25);
    alb = mix(alb, vec3(0.26, 0.3, 0.36), rime * ICE * 0.8);
    return Mat(alb, 0.72 - rime * 0.3, 0.22 + rime * 0.6, glEmi * 0.5, 0.0, 0.3, 0.08 + rime * 0.3);
  }
  if (id < 5.5) {
    // 울버린 털: 끝이 서리로 하얗다
    float tip = smoothstep(0.45, 0.8, fbm3(lp * 50.0));
    vec3 alb = mix(vec3(0.05, 0.038, 0.028) * (0.6 + 0.8 * noise(lp * 120.0)), vec3(0.22, 0.25, 0.29), tip * (0.4 + 0.4 * ICE));
    alb = mix(alb, snowCol, snow * 0.6);
    return Mat(alb, 0.95, 0.15, glEmi, 0.0, 0.3, 0.0);
  }
  if (id < 6.5) {
    // 성에 낀 수염·눈썹: 검은 털 끝에 서리
    float fr = smoothstep(0.4, 0.75, noise(lp * 160.0) * 0.6 + n.y * 0.5);
    vec3 alb = mix(vec3(0.03, 0.028, 0.026), vec3(0.28, 0.32, 0.38), fr);
    return Mat(alb, 0.6, 0.7, glEmi * 1.5, 0.0, 0.3, 0.3);
  }
  if (id < 7.5) {
    // 하얗게 언 눈동자: 희미하게 빛난다
    return Mat(vec3(0.3, 0.33, 0.36), 0.2, 1.2, vec3(0.1, 0.14, 0.18), 0.0, 0.5, 0.9);
  }
  if (id < 8.5) {
    // 고드름: 투명한 얼음 (속에서 빛이 돈다)
    float inner = 0.5 + 0.5 * noise(lp * 40.0);
    return Mat(vec3(0.07, 0.085, 0.1), 0.08, 1.5, vec3(0.03, 0.05, 0.07) * inner, 0.0, 0.7, 1.0);
  }
  if (id < 9.5) {
    // 서리 앉은 강철
    vec3 alb = mix(vec3(0.05, 0.055, 0.06), vec3(0.18, 0.21, 0.25), frostAll * 0.7);
    return Mat(alb, 0.32, 1.4, glEmi, 0.0, 0.0, 0.5);
  }
  if (id < 10.5) {
    // 나무 자루
    float grain = 0.7 + 0.3 * sin(dot(lp, vec3(30.0, 260.0, 30.0)) + 3.0 * noise(lp * 20.0));
    vec3 alb = vec3(0.07, 0.042, 0.022) * grain;
    alb = mix(alb, vec3(0.16, 0.18, 0.21), frostAll * 0.5);
    return Mat(alb, 0.6, 0.3, glEmi * 0.5, 0.0, 0.0, 0.1);
  }
  if (id < 11.5) {
    // 밧줄
    float tw = 0.7 + 0.3 * sin(dot(lp, vec3(140.0, 200.0, 140.0)));
    vec3 alb = vec3(0.085, 0.075, 0.055) * tw;
    alb = mix(alb, snowCol, snow * 0.8);
    return Mat(alb, 0.95, 0.05, glEmi, 0.0, 0.0, 0.0);
  }
  if (id > 12.5 && id < 13.5) {
    // 털실 목도리: 입김이 얼어붙어 하얀 성에 덩어리
    float knit = 0.8 + 0.2 * sin(lp.y * 300.0) * sin(lp.x * 300.0 + lp.z * 300.0);
    float fr = smoothstep(0.35, 0.7, fbm3(lp * 30.0));
    vec3 alb = mix(vec3(0.045, 0.045, 0.05) * knit, vec3(0.3, 0.34, 0.4), fr * ICE * 0.75);
    alb = mix(alb, snowCol, snow);
    return Mat(alb, 0.8, 0.3 + fr * 0.5, glEmi, 0.0, 0.3, 0.1);
  }
  if (id < 12.5) {
    // 고글: 검은 가죽 + 서리 낀 렌즈
    return Mat(vec3(0.03, 0.035, 0.04), 0.2, 1.4, vec3(0.03, 0.05, 0.07), 0.3, 0.0, 0.8);
  }
  return Mat(vec3(0.05), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.0);
}
`,
  };
}

export default function frozenExplorer({ seed = 1 } = {}) {
  return expedition({ seed });
}
