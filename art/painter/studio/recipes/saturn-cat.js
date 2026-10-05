// 토성의 고양이 (5층 정예) — 달의 뒷면에서 달짐승과 손잡은, 토성에서 온 기묘한 고양이. 좀처럼 죽지 않는다.
// 사냥 자세로 낮게 웅크린 굶주린 짐승: 몸통이 지나치게 길고, 등뼈와 어깨뼈가 칼날처럼 솟았으며, 다리는 마디가 하나씩 더 있다.
// 털은 짧고 검보랏빛 우단 같아 별가루가 박힌 듯 반짝인다. 좁고 각진 머리엔 찢긴 긴 귀, 금빛 세로 동공의 눈이 넷,
// 그리고 귀밑까지 찢어진 웃음 — 바늘 같은 이빨 사이로 금빛이 샌다. 꼬리는 등 위에서 고리처럼 말렸고,
// 몸을 비스듬히 감싸 도는 토성의 고리 — 금빛 먼지 띠 — 가 몸 앞뒤를 지나간다.
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
function spline(P, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * (P.length - 1);
    const k = Math.min(P.length - 2, Math.floor(u));
    const t = u - k;
    const p0 = P[Math.max(0, k - 1)];
    const p1 = P[k];
    const p2 = P[k + 1];
    const p3 = P[Math.min(P.length - 1, k + 2)];
    out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t)));
  }
  return out;
}

export default function saturnCat({ seed = 1 } = {}) {
  const R = rng(seed * 557 + 13);
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 다리 (살): 앞다리는 벌려 땅을 짚고, 뒷다리는 뒤꿈치가 높이 꺾였다
  for (const sx of [1, -1]) {
    path([[sx * 0.24, 0.98, 0.62], [sx * 0.42, 0.6, 0.5], [sx * 0.4, 0.3, 0.82], [sx * 0.36, 0.1, 1.02], [sx * 0.36, 0.04, 1.14]], (t) => 0.1 - 0.07 * t + 0.02 * Math.exp(-((t - 0.25) ** 2) * 80));
    path([[sx * 0.22, 1.28, -0.62], [sx * 0.34, 0.78, -0.3], [sx * 0.32, 0.5, -0.88], [sx * 0.3, 0.12, -0.72], [sx * 0.3, 0.04, -0.6]], (t) => 0.14 - 0.105 * t + 0.025 * Math.exp(-((t - 0.25) ** 2) * 60));
  }
  // 꼬리: 등 위로 올라가 고리처럼 말린다
  const tail = spline([[0, 1.42, -0.85], [0, 1.75, -1.15], [0.05, 2.2, -1.05], [0.1, 2.45, -0.6], [0.05, 2.3, -0.2], [-0.05, 2.0, -0.35], [-0.02, 1.95, -0.65], [0.05, 2.15, -0.75]], 26);
  const nLegs = ch.length;
  path(tail, (t) => 0.07 * (1 - t) + 0.012);
  const nSkin = ch.length;
  // 발톱 (고리처럼 휜 긴 발톱)
  for (const sx of [1, -1]) {
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.045;
      const b0 = [sx * 0.36 + o, 0.05, 1.16];
      const b1 = add(b0, [o * 0.4, 0.04, 0.09]);
      const b2 = add(b1, [o * 0.3, -0.05, 0.05]);
      const b3 = add(b2, [0, -0.04, -0.02]);
      ch.push([...b0, 0.016], [...b1, 0.012], [...b2, 0.007], [...b3, 0.002]);
      brk();
    }
  }
  const nClaw = ch.length;

  // 눈 넷 (작고 날카롭게)
  const cam = [3.6, 0.55, 6.4];
  const eyes = [];
  const gaze = [];
  const HC = [0.0, 0.8, 1.34];
  const HS = 0.84;
  for (const [x0, y0, z0, r0] of [
    [0.062, 0.002, 0.145, 0.016],
    [-0.062, 0.002, 0.145, 0.016],
    [0.105, 0.055, 0.1, 0.011],
    [-0.105, 0.055, 0.1, 0.011],
  ]) {
    const [x, y, z, r] = [HC[0] + x0 * HS, HC[1] + y0 * HS, HC[2] + z0 * HS, r0 * HS];
    eyes.push([x, y, z, r]);
    const g = [cam[0] - x, cam[1] - y, cam[2] - z];
    const l = Math.hypot(...g);
    gaze.push([g[0] / l, g[1] / l, g[2] / l, 5]);
  }
  // 고리의 반짝이는 얼음 티끌 + 입 속 빛
  const lights = [];
  const lc = [];
  const nl = Math.hypot(0.62, 0.76, 0.17);
  const ringN = [0.62 / nl, 0.76 / nl, 0.17 / nl];
  // 고리 평면의 두 축
  let u = [ringN[1] * 1 - ringN[2] * 0, ringN[2] * 0 - ringN[0] * 1, 0];
  u = [ringN[1], -ringN[0], 0];
  const ul = Math.hypot(...u);
  u = u.map((x) => x / ul);
  const w = [ringN[1] * u[2] - ringN[2] * u[1], ringN[2] * u[0] - ringN[0] * u[2], ringN[0] * u[1] - ringN[1] * u[0]];
  for (let i = 0; i < 16; i++) {
    const a = R() * 6.28;
    const rr = 1.02 + R() * 0.38;
    lights.push([u[0] * Math.cos(a) * rr + w[0] * Math.sin(a) * rr, 1.0 + u[1] * Math.cos(a) * rr + w[1] * Math.sin(a) * rr, 0.1 + u[2] * Math.cos(a) * rr + w[2] * Math.sin(a) * rr, 0.005 + R() * 0.008]);
    lc.push([1.0, 0.85, 0.5, 0.9]);
  }

  return {
    preset: 'act5',
    cam: { pos: cam, target: [0.0, 0.95, 0.15], fov: 1.7 },
    light: {
      key: [-0.45, 0.6, -0.65],
      keyCol: [1.2, 0.85, 1.05],
      fillCol: [0.06, 0.12, 0.16],
      amb: [0.012, 0.01, 0.02],
      rimCol: [1.1, 0.8, 1.2],
      rim: 1.7,
      exposure: 1.25,
      glow: 0.06,
      eyeEmit: 2.2,
      pt: [0.0, 0.85, 1.75],
      ptCol: [0.5, 0.35, 0.1],
    },
    frame: { fill: 0.94, bottom: 0.03 },
    arrays: { uB: ch, uE: eyes, uG: gaze, uL: lights, uLC: lc, uP: [[nSkin, nClaw, nLegs, 0], [...ringN, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_BG

const vec3 RING_C = vec3(0.0, 1.0, 0.1);
const vec3 HC = vec3(0.0, 0.8, 1.34);
const float HS = 0.84;

float chainR(vec3 p, int a, int b, float k) {
  float d = 1e5;
  for (int i = a; i < b - 1; i++) {
    vec4 s0 = uB[i];
    vec4 s1 = uB[i + 1];
    if (s0.w <= 0.0 || s1.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, s0.xyz, s1.xyz, s0.w, s1.w), k);
  }
  return d;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 1.1, 0.0)) - 2.2;
  if (bb > 0.5) return vec2(bb, 1.0);
  vec3 sp = vec3(abs(p.x), p.y, p.z);
  // ── 몸통: 길고 굶주렸다. 갈비가 드러난 가슴, 쏙 들어간 배, 높이 솟은 엉덩이
  float chest = sdEllipsoid(p - vec3(0.0, 0.98, 0.32), vec3(0.27, 0.3, 0.42));
  float waist = sdEllipsoid(p - vec3(0.0, 1.1, -0.25), vec3(0.17, 0.18, 0.38));
  float hips = sdEllipsoid(p - vec3(0.0, 1.25, -0.68), vec3(0.22, 0.22, 0.25));
  float body = smin(chest, waist, 0.18);
  body = smin(body, hips, 0.15);
  // 등뼈 마디와 칼날 같은 어깨뼈
  for (int i = 0; i < 12; i++) {
    float t = float(i) / 11.0;
    vec3 c = vec3(0.0, 1.27 + 0.1 * sin(t * 3.14159) - 0.12 * t + 0.08 * smoothstep(0.7, 1.0, t), 0.62 - t * 1.45);
    body = smin(body, length(p - c) - 0.045, 0.05);
  }
  body = smin(body, sdEllipsoid(sp - vec3(0.17, 1.2, 0.48), vec3(0.08, 0.13, 0.17)), 0.08);
  float ribs = abs(fract(p.z * 9.0 + 0.2) - 0.5);
  body += 0.014 * smoothstep(0.25, 0.05, ribs) * smoothstep(0.1, 0.25, abs(p.x)) * smoothstep(0.45, 0.0, abs(p.z - 0.25)) * smoothstep(1.2, 0.85, p.y);
  // 목: 낮게 앞으로
  body = smin(body, sdRoundCone(p, vec3(0.0, 1.08, 0.6), HC + vec3(0.0, 0.0, -0.1), 0.16, 0.085), 0.1);
  // ── 머리: 고양이 두개골 — 둥근 정수리, 불거진 광대, 짧은 주둥이. 귀는 크고 곧추섰다
  vec3 hq = (p - HC) / HS;
  vec3 hs = vec3(abs(hq.x), hq.yz);
  float head = sdEllipsoid(hq, vec3(0.15, 0.13, 0.15));
  head = smin(head, sdEllipsoid(hs - vec3(0.085, -0.055, 0.075), vec3(0.075, 0.06, 0.075)), 0.05);
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.065, 0.13), vec3(0.065, 0.05, 0.07)), 0.04);
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.035, 0.185), vec3(0.025, 0.02, 0.02)), 0.02);
  // 눈두덩 (눈을 그늘에 묻는다)
  head = smin(head, sdEllipsoid(hs - vec3(0.065, 0.035, 0.125), vec3(0.055, 0.018, 0.04)), 0.02);
  // 홀쭉하게 꺼진 뺨
  head = smax(head, -sdEllipsoid(hs - vec3(0.13, -0.02, 0.0), vec3(0.04, 0.05, 0.08)), 0.03);
  // 눈구멍
  head = smax(head, -sdSphere(hs - vec3(0.062, 0.002, 0.15), 0.022), 0.01);
  head = smax(head, -sdSphere(hs - vec3(0.105, 0.055, 0.105), 0.016), 0.008);
  // 찢어진 웃음: 주둥이에서 뺨을 지나 귀밑까지
  float mx = abs(hq.x);
  float curve = -0.088 + 1.9 * mx * mx - 0.15 * max(0.11 - hq.z, 0.0);
  float grin = max(abs(hq.y - curve) - 0.005 - 0.006 * smoothstep(0.12, 0.0, mx), max(mx - 0.15, -hq.z - 0.02));
  head = smax(head, -grin, 0.005);
  // 크고 곧추선 귀 (끝이 찢겼다)
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? 1.0 : -1.0;
    vec3 e0 = vec3(sx * 0.085, 0.09, -0.04);
    vec3 e1 = vec3(sx * 0.19, 0.36, -0.11);
    float ear = sdRoundCone(hq, e0, e1, 0.08, 0.008);
    vec3 en = normalize(vec3(sx * 0.3, 0.1, 1.0));
    float ez = dot(hq - e0, en);
    ear = max(ear, abs(ez + 0.005) - 0.014);
    ear = max(ear, -max(sdRoundCone(hq - en * 0.016, e0 + vec3(0.0, 0.035, 0.0), e1, 0.055, 0.004), -ez));
    ear = max(ear, -(sdSphere(hq - mix(e0, e1, 0.6) - vec3(sx * 0.055, 0.0, 0.0), 0.025)));
    head = smin(head, ear, 0.025);
  }
  body = smin(body, head * HS, 0.06);
  float legs = chainR(p, 0, int(uP[0].z), 0.05);
  legs = smin(legs, chainR(p, int(uP[0].z), int(uP[0].x), 0.004), 0.08);
  legs = smin(legs, sdEllipsoid(vec3(abs(p.x), p.y, p.z) - vec3(0.36, 0.05, 1.1), vec3(0.065, 0.045, 0.085)), 0.04);
  legs = smin(legs, sdEllipsoid(vec3(abs(p.x), p.y, p.z) - vec3(0.3, 0.05, -0.6), vec3(0.06, 0.045, 0.08)), 0.04);
  body = smin(body, legs, 0.08);
  if (body < 0.05) body += 0.004 * (fbm3(p * 20.0) - 0.5) + 0.0025 * noise(p * vec3(90.0, 25.0, 90.0));
  vec2 r = vec2(body, 1.0);
  // 입 속: 어둠과 바늘 이빨
  float mouthIn = max(abs(hq.y - curve) - 0.004, max(mx - 0.14, -hq.z - 0.01));
  mouthIn = max(mouthIn, head - 0.0 + 0.0);
  float teeth = 1e5;
  float tx = mod(hq.x + 0.008, 0.016) - 0.008;
  for (int j = 0; j < 2; j++) {
    float up = j == 0 ? 1.0 : -1.0;
    vec3 tq = vec3(tx, hq.y - curve - up * 0.008, hq.z);
    float tz = 0.09 + 0.1 * cos(min(mx * 10.0, 1.5));
    float tooth = sdRoundCone(tq - vec3(0.0, 0.0, tz - 0.03), vec3(0.0), vec3(0.0, -up * 0.02, 0.0), 0.0045, 0.0006);
    tooth = max(tooth, mx - 0.14);
    teeth = min(teeth, tooth);
  }
  r = umin(r, vec2(teeth * HS, 3.0));
  // 발톱
  r = umin(r, vec2(chainR(p, int(uP[0].x), int(uP[0].y), 0.004), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검보랏빛 짧은 우단 털: 결 따라 은은한 광택, 별가루 같은 반짝임
    float fur = 0.75 + 0.25 * noise(p * vec3(60.0, 160.0, 60.0));
    float v = fbm3(p * 4.0);
    vec3 alb = vec3(0.028, 0.022, 0.045) * (0.7 + 0.6 * v) * fur;
    vec3 g = p * 26.0;
    float spark = step(0.985, hash31(floor(g))) * smoothstep(0.3, 0.05, length(fract(g) - 0.5));
    vec3 emi = vec3(1.0, 0.85, 0.5) * spark * 0.9;
    // 웃음 자리 둘레가 희미하게 금빛을 머금는다
    vec3 hq = (p - HC) / HS;
    float curve = -0.088 + 1.9 * hq.x * hq.x - 0.15 * max(0.11 - hq.z, 0.0);
    emi += vec3(1.0, 0.55, 0.12) * smoothstep(0.012, 0.0, abs(hq.y - curve) - 0.004) * step(abs(hq.x), 0.14) * step(-0.02, hq.z) * 0.08;
    return Mat(alb, 0.9, 0.18, emi, 0.1, 0.15, 0.03);
  }
  // 이빨과 발톱: 누렇게 바랜 뼈
  return Mat(vec3(0.2, 0.17, 0.12), 0.3, 0.9, vec3(0.0), 0.0, 0.2, 0.4);
}

// 토성의 고리: 기울어진 평면 위 금빛 먼지 띠 (몸 뒤쪽은 몸에 가려진다)
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 N = normalize(uP[1].xyz);
  float dn = dot(rd, N);
  if (abs(dn) < 1e-4) return vec4(0.0);
  float t = dot(RING_C - ro, N) / dn;
  if (t < 0.0 || t > tHit) return vec4(0.0);
  vec3 q = ro + rd * t - RING_C;
  float r = length(q);
  float R0 = 1.0;
  float R1 = 1.42;
  if (r < R0 || r > R1) return vec4(0.0);
  float u = (r - R0) / (R1 - R0);
  float bands = 0.25 + 0.75 * noise(vec3(r * 30.0, 0.0, 0.0)) * (0.5 + 0.5 * noise(vec3(r * 9.0, 3.0, 0.0)));
  bands *= 0.55 + 0.45 * fbm3(q * 3.0 + 2.0);
  bands *= smoothstep(0.0, 0.06, u) * smoothstep(1.0, 0.85, u);
  bands *= 1.0 - 0.6 * smoothstep(0.02, 0.0, abs(u - 0.62) - 0.015);   // 카시니 틈
  bands *= 0.75 + 0.25 * noise(q * 6.0);
  float graze = 0.35 + 0.65 * pow(1.0 - abs(dn), 0.5);
  vec3 c = mix(vec3(1.0, 0.72, 0.3), vec3(0.7, 0.5, 0.85), u) * bands * 0.26 * graze;
  // 티끌 반짝임
  vec3 g = q * 40.0;
  c += vec3(1.0, 0.9, 0.7) * step(0.993, hash31(floor(g))) * 1.2 * bands;
  if (tHit > 1e4) return vec4(c * 1.6, clamp(bands * 0.75, 0.0, 1.0));
  return vec4(c * 0.9, 0.0);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.012);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.2, 0.07, 0.26) * pow(fbm3(rd * 3.0), 3.0) * 0.8 + vec3(0.03, 0.08, 0.1) * pow(fbm3(rd * 2.0 + 5.0), 3.0);
  return col;
}
`,
  };
}
