// 몽유병자 (5층) — 별 사이를 헤매다 돌아가는 길을 잃은 사람들. 눈을 감은 채 걷는다. 깨우지 않는 편이 낫다.
// 바닥에 닿지 않고 떠서 걷는 깡마른 사람: 해진 잠옷 자락은 발치에서 별가루로 풀려 흩어지고, 두 팔은 앞으로 곧게 뻗어
// 손목이 힘없이 꺾였다. 고개는 살짝 젖혀졌고 감긴 눈꺼풀 틈으로 창백한 푸른 빛이 새며, 반쯤 벌어진 입은 검다.
// 길고 검은 머리카락은 무게 없이 위로 풀려 떠오른다. 발끝은 아래로 늘어졌다.
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

export default function sleepwalker({ seed = 1 } = {}) {
  const R = rng(seed * 271 + 99);
  const Y = 0.22; // 떠 있는 높이
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 팔: 앞으로 곧게 뻗었고 손목이 꺾였다
  const armR = (t) => 0.04 - 0.017 * t + 0.009 * Math.exp(-((t - 0.5) ** 2) * 150);
  const wR = [0.21, 1.4 + Y, 0.82];
  const wL = [-0.13, 1.44 + Y, 0.86];
  path([[0.19, 1.55 + Y, 0.0], [0.22, 1.47 + Y, 0.36], wR], armR);
  path([[-0.19, 1.55 + Y, 0.0], [-0.17, 1.5 + Y, 0.38], wL], armR);
  // 다리: 발끝이 아래로 늘어졌다 (한쪽은 걷다 만 듯 굽었다)
  path([[0.09, 0.95 + Y, 0.0], [0.1, 0.52 + Y, 0.06], [0.1, 0.12 + Y, -0.02], [0.11, 0.02 + Y, 0.07], [0.11, -0.08 + Y, 0.11]], (t) => (t < 0.75 ? 0.05 - 0.025 * t + 0.01 * Math.exp(-((t - 0.36) ** 2) * 200) : 0.03 - 0.022 * (t - 0.75) * 4));
  path([[-0.09, 0.95 + Y, 0.0], [-0.1, 0.55 + Y, 0.16], [-0.11, 0.2 + Y, 0.05], [-0.11, 0.1 + Y, 0.14], [-0.11, 0.0 + Y, 0.18]], (t) => (t < 0.75 ? 0.05 - 0.025 * t + 0.01 * Math.exp(-((t - 0.36) ** 2) * 200) : 0.03 - 0.022 * (t - 0.75) * 4));
  const nArmLeg = ch.length;
  // 늘어진 손가락
  for (const [w, sx] of [[wR, 1], [wL, -1]]) {
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.018;
      const b0 = add(w, [o, -0.035, 0.05]);
      const b1 = add(b0, [o * 0.3, -0.075, 0.03]);
      const b2 = add(b1, [0, -0.065, -0.01]);
      path([b0, b1, b2], (t) => 0.009 - 0.005 * t);
    }
    path([add(w, [-sx * 0.025, -0.02, 0.03]), add(w, [-sx * 0.035, -0.06, 0.07])], (t) => 0.012 - 0.004 * t);
  }
  const nSkin = ch.length;
  const nLimb = nSkin;
  // 머리카락: 숙인 얼굴 앞과 어깨 위로 길게 늘어진 검은 머리 (얼굴을 거의 가린다)
  const head = [0, 1.73 + Y, 0.06];
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + (R() - 0.5) * 0.2;
    const front = Math.cos(a - Math.PI / 2); // +z 쪽이 1
    const crown = [0, head[1] + 0.1, head[2] - 0.02];
    const s0 = [Math.cos(a) * 0.085, head[1] + 0.045, head[2] + Math.sin(a) * 0.085];
    const hangZ = head[2] + Math.sin(a) * 0.11 + (front > 0.3 ? 0.03 : -0.02);
    const len = 0.45 + R() * 0.3 + (front > 0.3 ? 0.1 : 0);
    const P = [crown, s0, [Math.cos(a) * 0.11, head[1] - 0.08, hangZ], [Math.cos(a) * 0.12 + (R() - 0.5) * 0.05, head[1] - len * 0.6, hangZ + 0.02], [Math.cos(a) * 0.12 + (R() - 0.5) * 0.08, head[1] - len, hangZ + (R() - 0.5) * 0.06]];
    path(spline(P, 8), (t) => (t < 0.15 ? 0.03 : 0.03 * Math.pow(1 - (t - 0.15) / 0.85, 0.6) + 0.004));
  }
  const nHair = ch.length;

  // 빛: 감긴 눈 틈 + 흩어지는 별가루
  const lights = [
    [0.033, head[1] - 0.02, head[2] + 0.09, 0.007],
    [-0.033, head[1] - 0.02, head[2] + 0.09, 0.007],
  ];
  const lc = [
    [0.75, 0.85, 1.0, 1.0],
    [0.75, 0.85, 1.0, 1.0],
  ];
  for (let i = 0; i < 6; i++) {
    lights.push([(R() - 0.5) * 0.25, head[1] + 0.15 + i * 0.09 + R() * 0.05, head[2] + (R() - 0.5) * 0.2, 0.004 + R() * 0.005]);
    lc.push([0.75, 0.85, 1.0, 0.9]);
  }
  for (let i = 0; i < 14; i++) {
    const t = R();
    lights.push([(R() - 0.5) * 0.7, Y - 0.1 + t * 0.7 + R() * 0.2, (R() - 0.5) * 0.5, 0.004 + R() * 0.008]);
    lc.push([0.8, 0.88, 1.0, 0.9]);
  }
  return {
    preset: 'act5',
    cam: { pos: [2.1, 0.75, 5.6], target: [0.0, 1.2, 0.15], fov: 1.75 },
    light: {
      key: [-0.4, 0.6, -0.7],
      keyCol: [1.05, 0.9, 1.15],
      fillCol: [0.08, 0.12, 0.17],
      amb: [0.016, 0.016, 0.024],
      rimCol: [0.85, 0.9, 1.2],
      rim: 2.0,
      exposure: 1.1,
      glow: 0.05,
      pt: [0.0, 1.6 + Y, 0.6],
      ptCol: [0.18, 0.22, 0.32],
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: ch, uL: lights, uLC: lc, uP: [[nSkin, nHair, nArmLeg, 0], [...head, Y]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 32
#define VOLUME_FAR 10.0
#define HAS_BG

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
  float bb = length(p - vec3(0.0, 1.1, 0.0)) - 1.6;
  if (bb > 0.5) return vec2(bb, 1.0);
  float Y = uP[1].w;
  vec3 q = p - vec3(0.0, Y, 0.0);
  // ── 몸: 앙상한 어깨와 가슴 (잠옷 속)
  float torso = sdEllipsoid(q - vec3(0.0, 1.4, 0.0), vec3(0.19, 0.2, 0.11));
  torso = smin(torso, sdEllipsoid(vec3(abs(q.x), q.yz) - vec3(0.16, 1.53, 0.0), vec3(0.07, 0.05, 0.06)), 0.05);
  // 목: 고개를 살짝 젖혔다
  torso = smin(torso, sdRoundCone(q, vec3(0.0, 1.55, 0.0), vec3(0.0, 1.68, 0.02), 0.045, 0.04), 0.03);
  // ── 잠옷: 어깨에서 무릎 아래까지, 얇고 해졌다, 밑단은 별가루로 풀린다
  vec3 g = q;
  float yy = clamp((1.55 - g.y) / 1.05, 0.0, 1.0);
  float rad = mix(0.17, 0.13, smoothstep(0.0, 0.3, yy)) + 0.13 * smoothstep(0.25, 1.0, yy);
  float ang = atan(g.z, g.x);
  rad += (0.03 * sin(ang * 7.0 + g.y * 5.0 + 2.0 * noise(g * 3.0)) + 0.016 * sin(ang * 13.0 + 1.0)) * smoothstep(0.15, 1.0, yy);
  float gown = (length(g.xz - vec2(0.0, 0.03 * yy)) - rad) * 0.8;
  gown = max(gown, g.y - 1.56);
  float hem = 0.25 + 0.22 * fbm3(vec3(g.x * 6.0, 0.0, g.z * 6.0)) + 0.1 * sin(ang * 5.0 + 1.0) + 0.12 * smoothstep(0.6, 0.95, noise(vec3(ang * 4.0, 2.0, 0.0)));
  gown = max(gown, hem - g.y);
  gown = abs(gown) - 0.012;
  gown = max(gown, g.y - 1.56);
  // 해진 구멍
  float holes = smoothstep(0.62, 0.72, fbm3(g * vec3(7.0, 4.0, 7.0) + 3.0)) * smoothstep(1.0, 0.6, g.y);
  gown = max(gown, (holes - 0.5) * 0.1);
  // 소매: 짧게 접혔다
  float sl = min(sdRoundCone(q, vec3(0.17, 1.52, 0.0), vec3(0.2, 1.46, 0.2), 0.07, 0.06), sdRoundCone(q, vec3(-0.17, 1.52, 0.0), vec3(-0.17, 1.49, 0.2), 0.07, 0.06));
  gown = smin(gown, sl, 0.02);
  float body = smin(torso, gown, 0.02);
  // ── 머리: 갸름하고 창백하다, 눈은 감겼고 입은 반쯤 벌어졌다
  vec3 hq = p - uP[1].xyz;
  hq.yz = rot(-0.38) * hq.yz;
  float head = sdEllipsoid(hq, vec3(0.075, 0.1, 0.09));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.055, 0.035), vec3(0.055, 0.055, 0.06)), 0.03);
  vec3 hs = vec3(abs(hq.x), hq.yz);
  // 꺼진 눈두덩과 감긴 눈꺼풀 금
  head = smax(head, -sdEllipsoid(hs - vec3(0.034, 0.012, 0.085), vec3(0.024, 0.014, 0.02)), 0.01);
  head = smin(head, sdEllipsoid(hs - vec3(0.034, 0.012, 0.075), vec3(0.021, 0.011, 0.014)), 0.004);
  head = smax(head, -sdBox(hs - vec3(0.034, 0.008, 0.088), vec3(0.018, 0.0012, 0.01)), 0.002);
  // 코와 반쯤 벌어진 입
  head = smin(head, sdRoundCone(hq, vec3(0.0, 0.0, 0.088), vec3(0.0, -0.03, 0.1), 0.007, 0.011), 0.01);
  float mouth = sdEllipsoid(hq - vec3(0.0, -0.07, 0.08), vec3(0.016, 0.017, 0.02));
  head = smax(head, -mouth, 0.006);
  body = smin(body, head, 0.03);
  float limbs = chainR(p, 0, int(uP[0].z), 0.012);
  limbs = smin(limbs, chainR(p, int(uP[0].z), int(uP[0].x), 0.001), 0.008);
  body = smin(body, limbs, 0.03);
  if (body < 0.03) body += 0.0015 * (fbm3(p * 40.0) - 0.5);
  float isGown = step(gown, min(torso, min(head, limbs)) + 0.003);
  vec2 r = vec2(body, isGown > 0.5 ? 2.0 : 1.0);
  r = umin(r, vec2(max(mouth - 0.002, -head - 0.01), 99.0));
  // 머리카락
  float hair = chainR(p, int(uP[0].x), int(uP[0].y), 0.004);
  if (hair < 0.03) hair += 0.006 * (noise(vec3(p.x * 90.0, p.y * 6.0, p.z * 90.0)) - 0.5);
  r = umin(r, vec2(smin(hair, head + 0.005, 0.03), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 8.0);
  if (id < 1.5) {
    // 창백한 잿빛 살갗: 핏기가 없고, 푸른 핏줄이 비친다
    float vein = smoothstep(0.05, 0.0, ridge(p * 14.0)) * 0.4;
    vec3 alb = mix(vec3(0.2, 0.195, 0.21), vec3(0.08, 0.1, 0.16), vein) * (0.85 + 0.25 * v);
    return Mat(alb, 0.55, 0.35, vec3(0.0), 0.0, 0.75, 0.1);
  }
  if (id < 2.5) {
    // 잠옷: 바랜 잿빛 무명, 얼룩졌고 아래로 갈수록 별가루로 바스러진다
    float Y = uP[1].w;
    float low = smoothstep(0.85 + Y, 0.5 + Y, p.y);
    vec3 alb = vec3(0.13, 0.13, 0.145) * (0.6 + 0.6 * v) * (1.0 - 0.4 * smoothstep(0.5, 0.75, fbm3(p * 4.0)));
    vec3 gg = p * 60.0;
    float spark = step(0.96, hash31(floor(gg))) * smoothstep(0.3, 0.1, length(fract(gg) - 0.5)) * low;
    return Mat(alb, 0.95, 0.05, vec3(0.7, 0.8, 1.0) * spark * 1.2, 0.0, 0.5, 0.0);
  }
  // 검은 머리카락: 가닥마다 윤기
  return Mat(vec3(0.02, 0.018, 0.022), 0.3, 0.9, vec3(0.0), 0.05, 0.0, 0.3);
}

// 밑단과 발치에서 흩어지는 별가루 안개
vec4 volume(vec3 p) {
  float Y = uP[1].w;
  float low = smoothstep(0.75 + Y, 0.35 + Y, p.y) * smoothstep(-0.3 + Y, 0.2 + Y, p.y);
  float rad = smoothstep(0.45, 0.1, length(p.xz - vec2(0.0, 0.05)));
  float n1 = fbm3(p * vec3(6.0, 3.0, 6.0) + vec3(0.0, uSeed, 0.0));
  float dens = low * rad * smoothstep(0.45, 0.75, n1) * 3.0;
  if (dens < 0.003) return vec4(0.0);
  return vec4(vec3(0.55, 0.62, 0.85) * dens * 0.5, dens * 0.5);
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
