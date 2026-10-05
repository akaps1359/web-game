// 렝의 거미 (3층 일반) — 렝 고원에서 얼음을 건너온 보랏빛 거미. 조랑말만 한 몸집.
// 젖은 검보라 등딱지, 부풀어 늘어진 배(벨벳 같은 털, 희미한 연보라 무늬), 무릎이 몸보다 높이 솟은 여덟 다리,
// 앞쪽으로 내민 굵은 엄니와 촉수, 눈두덩에 모인 여덟 개의 보랏빛 눈. 다리 사이로 서리 낀 거미줄이 걸려 있다.
// lengSpider()는 렝의 대거미·새끼 거미 레시피도 같이 쓴다.
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

export function lengSpider(o) {
  const R = rng((o.seed ?? 1) * 4409 + (o.salt ?? 0));
  const S = o.size ?? 1;
  const yaw = o.yaw ?? 0.5;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const base = o.pos ?? [0, 0, 0];
  const W = (p) => {
    const q = mul(p, S);
    return [base[0] + cy * q[0] - sy * q[2], base[1] + q[1], base[2] + sy * q[0] + cy * q[2]];
  };
  const B = [];
  const brk = () => B.push([0, 0, 0, 0]);
  const pt = (p, r) => B.push([...W(p), r * S]);

  const C = o.ceph ?? [0.28, 0.5, 0]; // 머리가슴
  const A = o.abd ?? [-0.5, 0.68, 0]; // 배
  const abR = o.abR ?? [0.52, 0.42, 0.44];
  const legLen = o.legLen ?? 1;
  const kneeH = o.kneeH ?? 0.6;
  // ── 다리 여덟: 몸 옆에서 나와 무릎이 높이 솟고, 발끝은 바닥을 짚는다
  const yawsL = o.legYaws ?? [38, 72, 108, 145];
  const feet = [];
  const knees = [];
  for (const s of [-1, 1]) {
    yawsL.forEach((deg, i) => {
      const a = ((deg + (R() - 0.5) * 8) * Math.PI) / 180;
      const dir = [Math.cos(a), 0, s * Math.sin(a)];
      const raise = o.raise && o.raise[i] ? o.raise[i] : 0; // 앞다리 치켜들기
      const b0 = add(C, [Math.cos(a) * 0.12, -0.02, s * 0.13]);
      const L = legLen * (i === 0 ? 1.15 : i === 3 ? 1.1 : 1.0) * (0.95 + R() * 0.1);
      let knee = add(add(b0, dir, 0.42 * L), [0, kneeH * L, 0]);
      let ank = add(b0, dir, 1.02 * L);
      ank[1] = 0.26 * L + 0.25 * b0[1];
      let foot = add(b0, dir, 1.36 * L);
      foot[1] = 0.02;
      if (raise) {
        // 치켜든 다리: 무릎이 높이, 정강이는 앞으로 뻗고 발끝은 갈고리처럼 아래로
        knee = add(add(b0, dir, 0.36 * L), [0.05, (kneeH + 0.22 * raise) * L, 0]);
        ank = add(add(knee, dir, 0.42 * L), [0.22 * raise * L, 0.12 * raise * L, 0]);
        foot = add(add(ank, dir, 0.2 * L), [0.18 * L, -0.16 * L, 0]);
      }
      foot[1] = Math.max(foot[1], 0.02);
      const tip = add(foot, add(mul(dir, 0.1 * L), [0, raise ? 0.08 : -0.015, 0]));
      tip[1] = Math.max(tip[1], 0.005);
      const w = o.legW ?? 1;
      pt(b0, 0.06 * w);
      pt(lerp(b0, knee, 0.15), 0.05 * w);
      pt(lerp(b0, knee, 0.85), 0.042 * w);
      pt(knee, 0.048 * w);
      pt(lerp(knee, ank, 0.1), 0.036 * w);
      pt(lerp(knee, ank, 0.9), 0.03 * w);
      pt(ank, 0.032 * w);
      pt(lerp(ank, foot, 0.55), 0.022 * w);
      pt(foot, 0.018 * w);
      pt(tip, 0.004 * w);
      brk();
      feet.push(foot);
      knees.push(knee);
    });
  }
  // ── 촉수(더듬이다리) 둘: 앞으로 짧게
  for (const s of [-1, 1]) {
    const b0 = add(C, [0.22, -0.05, s * 0.07]);
    pt(b0, 0.04);
    pt(add(b0, [0.14, 0.12, s * 0.06]), 0.035);
    pt(add(b0, [0.3, 0.06, s * 0.08]), 0.03);
    pt(add(b0, [0.38, -0.08, s * 0.07]), 0.02);
    brk();
  }
  // ── 엄니: 굵은 위턱 → 굽은 검은 송곳니
  const fangTips = [];
  for (const s of [-1, 1]) {
    const b0 = add(C, [0.27, -0.06, s * 0.045]);
    const m = add(b0, [0.1, -0.12, s * 0.02]);
    pt(b0, 0.05);
    pt(m, 0.045);
    brk();
    const f0 = add(m, [0.02, -0.03, 0]);
    const f1 = add(f0, [0.03, -0.09, -s * 0.02]);
    const f2 = add(f1, [-0.04, -0.07, -s * 0.03]);
    pt(f0, 0.022);
    pt(f1, 0.016);
    pt(f2, 0.003);
    brk();
    fangTips.push(f2);
  }
  // ── 실젖
  const spin = add(A, [-abR[0] * 0.95, -abR[1] * 0.25, 0]);
  pt(add(spin, [0.06, 0, 0]), 0.05);
  pt(add(spin, [-0.06, -0.04, 0]), 0.025);
  brk();
  const NLEG = B.length;
  // ── 서리 낀 거미줄: 다리 사이, 다리에서 바닥으로
  const threads = o.threads ?? 6;
  for (let i = 0; i < threads; i++) {
    const k = Math.floor(R() * knees.length);
    const a0 = knees[k];
    const k2 = (k + 1 + Math.floor(R() * 2)) % feet.length;
    const target = R() < 0.5 ? feet[k2] : add(feet[k], [(R() - 0.5) * 0.8, 0, (R() - 0.5) * 0.8]);
    target[1] = Math.max(0.0, target[1] - 0.02);
    pt(a0, 0.0022);
    pt(add(lerp(a0, target, 0.35), [0, -0.12, 0]), 0.0016);
    pt(add(lerp(a0, target, 0.7), [0, -0.12, 0]), 0.0016);
    pt(target, 0.0022);
    brk();
  }
  // 실젖에서 바닥으로 늘어진 실
  pt(spin, 0.003);
  pt(add(spin, [-0.25, -0.35, 0.1]), 0.0025);
  pt([spin[0] - 0.5, 0.0, spin[2] + 0.2], 0.0025);
  brk();

  // ── 눈 여덟: 눈두덩에 모였다 (가운데 큰 둘)
  const eyes = [];
  const eyeC = add(C, [0.24, 0.12, 0]);
  const ep = [
    [0.03, 0.02, 0.035, 0.032],
    [0.03, 0.02, -0.035, 0.032],
    [0.0, 0.06, 0.07, 0.018],
    [0.0, 0.06, -0.07, 0.018],
    [-0.02, 0.0, 0.09, 0.016],
    [-0.02, 0.0, -0.09, 0.016],
    [-0.06, 0.07, 0.035, 0.014],
    [-0.06, 0.07, -0.035, 0.014],
  ];
  for (const [x, y, z, r] of ep) eyes.push([...W(add(eyeC, [x, y, z])), r * S * (o.eyeScale ?? 1)]);
  const lights = eyes.map((e) => [e[0], e[1], e[2], e[3] * 0.55]);
  const lcol = eyes.map(() => [0.75, 0.45, 1.0, 1.4]);
  // 엄니 끝에 맺힌 독
  for (const f of fangTips) {
    lights.push([...W(add(f, [0, -0.02, 0])), 0.008 * S]);
    lcol.push([0.85, 0.5, 1.0, 1.2]);
  }
  return {
    B,
    NLEG,
    eyes,
    lights,
    lcol,
    W,
    ceph: W(C),
    abd: W(A),
    abR: mul(abR, S),
    yaw,
    S,
    fangTips: fangTips.map(W),
  };
}

export const SPIDER_GLSL = /* glsl */ `
// uP[0] = (다리 사슬 수, 크기, 배 무늬 세기, 털), uP[1] = 머리가슴 중심(xyz) + yaw, uP[2] = 배 중심 + 0, uP[3] = 배 반지름
vec3 spLocal(vec3 p, vec3 c) {
  vec3 q = p - c;
  float yw = uP[1].w;
  return vec3(cos(yw) * q.x + sin(yw) * q.z, q.y, -sin(yw) * q.x + cos(yw) * q.z);
}
vec2 legChains(vec3 p) {
  float d = 1e5;
  float dt = 1e5;
  int nl = int(uP[0].x + 0.5);
  for (int i = 0; i < 159; i++) {
    if (i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    vec3 m = (a.xyz + b.xyz) * 0.5;
    float bound = length(p - m) - (length(a.xyz - b.xyz) * 0.5 + max(a.w, b.w));
    if (i < nl) {
      if (bound > d + 0.03) continue;
      d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), 0.02 * uP[0].y);
    } else {
      if (bound > dt) continue;
      dt = min(dt, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w));
    }
  }
  return vec2(d, dt);
}
vec2 spiderBody(vec3 p) {
  float S = uP[0].y;
  vec3 qc = spLocal(p, uP[1].xyz) / S;
  vec3 qa = spLocal(p, uP[2].xyz) / S;
  vec3 ar = uP[3].xyz / S;
  // 머리가슴: 낮고 넓은 방패, 앞쪽에 솟은 눈두덩
  float ce = sdEllipsoid(qc, vec3(0.3, 0.15, 0.24));
  ce = smin(ce, sdEllipsoid(qc - vec3(0.2, 0.08, 0.0), vec3(0.11, 0.09, 0.1)), 0.06);
  // 등딱지 가운데 홈
  ce = smax(ce, -sdEllipsoid(qc - vec3(-0.05, 0.16, 0.0), vec3(0.05, 0.03, 0.03)), 0.02);
  // 허리
  float pd = sdCapsule(qc, vec3(-0.2, 0.02, 0.0), (spLocal(uP[2].xyz, uP[1].xyz) / S) + vec3(ar.x * 0.7, -ar.y * 0.2, 0.0), 0.06);
  // 배: 뒤로 늘어진 알 모양, 옆구리에 주름
  vec3 qa2 = qa;
  qa2.y += 0.12 * qa.x * qa.x / ar.x;
  float ab = sdEllipsoid(qa2, ar);
  float body = smin(min(ce, ab), pd, 0.06);
  vec2 r = vec2(body * S, qa.x > -ar.x * 1.3 && length(qa / ar) < 1.25 ? 2.0 : 1.0);
  if (ce < ab) r.y = 1.0;
  return r;
}
vec2 spiderSdf(vec3 p) {
  float S = uP[0].y;
  vec2 b = spiderBody(p);
  vec2 lc = legChains(p);
  float d = smin(b.x, lc.x, 0.04 * S);
  vec2 r = vec2(d, b.x < lc.x ? b.y : 3.0);
  // 털: 다리와 배에 가는 결
  if (r.x < 0.05 * S) {
    r.x += 0.004 * S * (fbm3(p * 60.0 / S) - 0.5) * (r.y > 1.5 ? 1.0 : 0.3);
    // 배의 벨벳 털
    if (r.y > 1.5 && r.y < 2.5) r.x += 0.007 * S * (noise(p * 140.0 / S) - 0.5);
    // 다리의 억센 가시털
    if (r.y > 2.5 && r.y < 3.5) r.x -= 0.006 * S * smoothstep(0.55, 0.9, noise(p * vec3(150.0, 60.0, 150.0) / S));
  }
  // 엄니 끝 (사슬 중 반지름이 아주 작게 끝나는 것)은 재질 4로: 머리가슴 앞쪽 아래
  vec3 qc = spLocal(p, uP[1].xyz) / S;
  if (r.y > 2.5 && qc.x > 0.28 && qc.y < -0.08 && abs(qc.z) < 0.12) r.y = 4.0;
  // 눈: 반들거리는 검은 구슬
  float de = 1e5;
  for (int i = 0; i < 8; i++) {
    if (i >= uEN) break;
    de = min(de, length(p - uE[i].xyz) - uE[i].w);
  }
  if (de < r.x) r = vec2(de, 8.0);
  // 거미줄
  if (lc.y < r.x) r = vec2(lc.y, 5.0);
  return r;
}
Mat spiderMat(float id, vec3 p, vec3 n) {
  float S = uP[0].y;
  vec3 violet = vec3(0.75, 0.42, 1.0);
  if (id < 1.5) {
    // 등딱지: 젖은 검보라 키틴, 가는 방사형 홈
    vec3 qc = spLocal(p, uP[1].xyz) / S;
    float rad = smoothstep(0.03, 0.0, abs(sin(atan(qc.z, qc.x) * 7.0)) * length(qc.xz) - 0.01);
    vec3 alb = mix(vec3(0.045, 0.025, 0.06), vec3(0.2, 0.15, 0.24), uP[0].w) * (0.6 + 0.6 * fbm3(p * 9.0 / S)) * (1.0 - rad * 0.5);
    return Mat(alb, 0.18, 1.4, vec3(0.0), 0.35, 0.1 + 0.6 * uP[0].w, 0.7);
  }
  if (id < 2.5) {
    // 배: 벨벳 같은 털, 희미한 연보라 잎무늬(가운데 줄 + 갈비 같은 갈매기 무늬)
    vec3 qa = spLocal(p, uP[2].xyz) / S;
    vec3 ar = uP[3].xyz / S;
    float u = qa.x / ar.x;
    float mid = smoothstep(0.06, 0.0, abs(qa.z) - 0.02 - 0.03 * (1.0 - abs(u)));
    float chev = smoothstep(0.035, 0.0, abs(fract((u * 2.6 + abs(qa.z) * 3.0)) - 0.5) - 0.38) * smoothstep(0.25, 0.05, abs(qa.z) / ar.z) * step(qa.y, ar.y) * smoothstep(-0.2, 0.3, qa.y / ar.y);
    float pat = max(mid * smoothstep(-0.2, 0.4, qa.y / ar.y), chev) * uP[0].z;
    float fur = fbm3(p * 30.0 / S);
    vec3 alb = mix(mix(vec3(0.05, 0.022, 0.07), vec3(0.22, 0.17, 0.27), uP[0].w), vec3(0.32, 0.22, 0.4), pat * 0.75) * (0.55 + 0.7 * fur);
    return Mat(alb, 0.75 - 0.4 * uP[0].w, 0.35 + 0.6 * uP[0].w, violet * pat * 0.16 * (0.5 + fur), 0.0, 0.35 + 0.5 * uP[0].w, 0.15 + 0.4 * uP[0].w);
  }
  if (id < 3.5) {
    // 다리: 마디마다 연한 띠, 검은 털
    vec3 alb = mix(vec3(0.04, 0.022, 0.05), vec3(0.17, 0.13, 0.2), uP[0].w) * (0.6 + 0.8 * fbm3(p * 20.0 / S));
    return Mat(alb, 0.45, 0.8, vec3(0.0), 0.2, 0.15 + 0.5 * uP[0].w, 0.35);
  }
  if (id < 4.5) return Mat(vec3(0.015, 0.012, 0.014), 0.1, 1.6, vec3(0.0), 0.0, 0.0, 0.9);
  if (id < 5.5) return Mat(vec3(0.12, 0.13, 0.17), 0.4, 0.6, vec3(0.45, 0.55, 0.85) * 0.12, 0.0, 0.5, 0.2);
  if (id < 6.5) {
    // 고치: 겹겹이 엇갈려 감긴 희뿌연 실, 서리
    float w1 = abs(sin((p.x * 0.7 + p.y + p.z * 0.4) * 160.0 / S + fbm3(p * 25.0 / S) * 5.0));
    float w2 = abs(sin((p.x * -0.5 + p.y + p.z * 0.8) * 120.0 / S + fbm3(p * 18.0 / S + 3.0) * 5.0));
    float wrap = 0.55 + 0.45 * min(w1, w2);
    vec3 alb = vec3(0.2, 0.21, 0.23) * wrap * (0.6 + 0.6 * fbm3(p * 6.0 / S));
    float frost = step(0.985, hash31(floor(p * 260.0 / S)));
    return Mat(alb, 0.8, 0.3, vec3(0.6, 0.75, 1.0) * frost * 0.5, 0.0, 0.6, 0.15);
  }
  if (id < 7.5) {
    // 알주머니: 젖은 얇은 막, 속에서 희미하게 비치는 보랏빛
    float v = fbm3(p * 14.0 / S);
    vec3 alb = mix(vec3(0.16, 0.13, 0.18), vec3(0.3, 0.26, 0.33), v);
    return Mat(alb, 0.25, 1.0, violet * smoothstep(0.55, 0.8, v) * 0.08, 0.1, 0.9, 0.8);
  }
  // 눈
  return Mat(vec3(0.01, 0.005, 0.015), 0.02, 2.0, violet * 0.25, 0.0, 0.0, 1.0);
}
`;

export function spiderRecipe(sp, o) {
  return {
    preset: 'act3',
    cam: o.cam,
    light: {
      key: [-0.45, 0.6, -0.7],
      keyCol: [0.9, 1.1, 1.45],
      fill: [0.6, 0.25, 0.75],
      fillCol: [0.2, 0.1, 0.28],
      amb: [0.02, 0.018, 0.035],
      rimCol: [0.75, 0.85, 1.25],
      rim: 1.8,
      glow: 0.12,
      exposure: 1.3,
      ...(o.light ?? {}),
    },
    frame: o.frame ?? { fill: 0.92, bottom: 0.03 },
    arrays: {
      uB: sp.B,
      uE: [],
      uL: [...sp.lights, ...(o.extraLights ?? [])],
      uLC: [...sp.lcol, ...(o.extraLC ?? [])],
      uA: o.uA ?? [],
      uP: [
        [sp.NLEG, sp.S, o.pattern ?? 1, o.pale ?? 0],
        [...sp.ceph, sp.yaw],
        [...sp.abd, 0],
        [...sp.abR, 0],
        ...(o.extraP ?? []),
      ],
      // 눈은 uE 대신 셰이더 안에서 구슬로 (uE를 비워 두면 자동 눈 셰이딩을 피한다) → uG에 넣어 둔다
      uG: sp.eyes,
    },
    glsl: SPIDER_GLSL.replace(/uE\[i\]/g, 'uG[i]').replace('if (i >= uEN) break;', 'if (i >= uGN) break;') + (o.helpers ?? '') + /* glsl */ `
vec2 sdf(vec3 p) {
  vec2 r = spiderSdf(p);
  ${o.sdfExtra ?? ''}
  return r;
}
Mat material(float id, vec3 p, vec3 n) {
  ${o.matExtra ?? ''}
  return spiderMat(id, p, n);
}
`,
  };
}

export default function lengSpider_({ seed = 1 } = {}) {
  // 위협 자세: 앞다리 둘을 높이 치켜들고 엄니를 드러냈다
  const sp = lengSpider({
    seed,
    yaw: 1.25,
    size: 1.0,
    threads: 0,
    raise: [1.0, 0.3, 0, 0],
    ceph: [0.28, 0.36, 0],
    abd: [-0.6, 0.6, 0],
    abR: [0.66, 0.5, 0.56],
    kneeH: 0.52,
    legLen: 1.1,
  });
  return spiderRecipe(sp, {
    cam: { pos: [0.5, 1.9, 8.2], target: [0.0, 0.45, 0.0], fov: 1.8 },
  });
}
