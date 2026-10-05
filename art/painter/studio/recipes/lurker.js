// 어둠 속의 눈 (1층) — 하수구 어둠이 뭉쳐 떠 있는 형체. 너덜너덜한 검은 수의 같은 몸, 고개를 숙인 두건 모양의
// 덩어리 속은 빛을 먹는 완전한 어둠이고, 그 어둠 속에 크기가 제각각인 노란 눈들이 떠 있다 (몇은 젖은 살 눈꺼풀
// 아래 반쯤 감겼다). 수의 밑에서 마디가 너무 많은 그림자 팔 둘이 갈고리 손가락을 뻗고, 아래쪽은 찢긴 넝마와
// 검은 연기로 풀려 흩어진다.
import { rng } from '../../lib.js';

export default function lurker({ seed = 1 } = {}) {
  const R = rng(seed * 977 + 5);
  const cam = [0.5, 0.85, 5.4];
  const C = [0.0, 1.72, 0.12]; // 두건 속 어둠의 중심
  // 눈: 두건 속 어둠의 겉면 (앞쪽)
  const want = [
    [0.02, 0.02, 0.07],
    [-0.13, 0.12, 0.042],
    [0.14, -0.07, 0.045],
    [-0.1, -0.12, 0.03],
    [0.1, 0.14, 0.028],
    [-0.19, -0.02, 0.022],
    [0.2, 0.06, 0.02],
    [0.0, -0.2, 0.026],
    [-0.03, 0.2, 0.018],
    [0.08, -0.22, 0.016],
    [-0.17, 0.2, 0.014],
    [0.2, -0.17, 0.015],
  ];
  const RAD = 0.27;
  const eyes = [];
  const gaze = [];
  for (const [x, y, r] of want) {
    const zz = Math.sqrt(Math.max(RAD * RAD - x * x - y * y, 0.001));
    const pos = [C[0] + x, C[1] + y, C[2] + zz + r * 0.25];
    eyes.push([...pos, r]);
    let g = [cam[0] - pos[0] + (R() - 0.5) * 1.2, cam[1] - pos[1] + (R() - 0.5) * 0.8, cam[2] - pos[2]];
    const gl = Math.hypot(...g);
    g = g.map((v) => v / gl);
    gaze.push([...g, R() < 0.8 ? 5 : 1]);
  }
  // 팔: 어깨 → 마디들 → 손목, 손가락은 셰이더에서
  const arms = [
    [[-0.34, 1.42, 0.12], [-0.62, 1.32, 0.34], [-0.78, 1.02, 0.55], [-0.72, 0.72, 0.74], [-0.56, 0.52, 0.9]],
    [[0.34, 1.38, 0.14], [0.6, 1.2, 0.3], [0.76, 0.92, 0.48], [0.68, 0.62, 0.66], [0.5, 0.44, 0.82]],
  ];
  const ch = [];
  const wrists = [];
  for (const pts of arms) {
    pts.forEach((p, i) => ch.push([...p, [0.062, 0.04, 0.03, 0.024, 0.02][i]]));
    ch.push([0, 0, 0, 0]);
    const w = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    wrists.push([...w, 0], [w[0] - prev[0], w[1] - prev[1], w[2] - prev[2], 0]);
  }
  return {
    preset: 'act1',
    cam: { pos: cam, target: [0.0, 1.15, 0.0], fov: 1.75 },
    light: { key: [-0.4, 0.75, -0.65], rim: 2.6, rimCol: [0.6, 0.9, 0.8], fillCol: [0.14, 0.1, 0.06], amb: [0.012, 0.016, 0.018], eyeEmit: 2.2, glow: 0.08 },
    frame: { fill: 0.92 },
    arrays: { uB: ch, uE: eyes, uG: gaze, uP: [[...C, RAD], ...wrists] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 48
#define VOLUME_FAR 9.0

/** 마디가 너무 많은 손: 손가락 넷, 각 세 마디, 끝은 갈고리 손톱 */
float hand(vec3 p, vec3 w, vec3 dir) {
  vec3 f = normalize(dir);
  vec3 s = normalize(cross(f, vec3(0.0, 1.0, 0.0)));
  vec3 u = cross(s, f);
  float d = sdEllipsoid(p - w - f * 0.03, vec3(0.04, 0.04, 0.04));
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 a = w + f * 0.04 + s * o * 0.022;
    vec3 m1 = a + f * 0.1 + s * o * 0.03 + u * 0.02;
    vec3 m2 = m1 + f * 0.08 - u * 0.05 + s * o * 0.012;
    vec3 e = m2 + f * 0.02 - u * 0.075;
    d = smin(d, sdRoundCone(p, a, m1, 0.012, 0.009), 0.012);
    d = smin(d, sdRoundCone(p, m1, m2, 0.009, 0.007), 0.006);
    d = min(d, sdRoundCone(p, m2, e, 0.007, 0.001));
  }
  return d;
}

float chainRange(vec3 p, int i0, int i1, float k) {
  float d = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i < i0) continue;
    if (i + 1 >= i1 || i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
  }
  return d;
}

vec2 sdf(vec3 p) {
  vec3 C = uP[0].xyz;
  float RAD = uP[0].w;
  // ── 두건 모양의 덩어리: 앞으로 숙였고, 앞이 크게 뚫려 속은 어둠
  vec3 q = p - C;
  q.yz = rot(0.25) * q.yz;
  float outer = sdEllipsoid(q - vec3(0.0, 0.05, -0.06), vec3(0.44, 0.48, 0.42));
  outer = smin(outer, sdRoundCone(q, vec3(0.0, 0.2, -0.15), vec3(0.05, 0.42, -0.45), 0.25, 0.04), 0.15);
  float opening = sdEllipsoid(q - vec3(0.0, -0.06, 0.32), vec3(0.3, 0.36, 0.34));
  float cowl = max(outer, -opening);
  // ── 수의: 어깨에서 아래로 넓어졌다가, 찢긴 넝마 띠로 풀린다
  float y = p.y;
  float ang = atan(p.z, p.x);
  // 아래로 가늘어져 꼬리처럼 풀린다 (가장자리는 찢겨 너덜거린다)
  vec2 cs = vec2(cos(ang), sin(ang));
  float tat = noise(vec3(cs * 1.6, y * 2.5)) - 0.5;
  float rr = mix(0.03, 0.42, smoothstep(0.12, 1.3, y)) * mix(1.0, 0.75, smoothstep(1.35, 1.65, y));
  rr += 0.05 * tat * smoothstep(1.3, 0.4, y);
  rr += 0.02 * sin(ang * 9.0 + 2.0 * noise(p * 2.0)) * smoothstep(1.5, 0.6, y);
  float robe = (length(p.xz * vec2(1.0, 1.15)) - max(rr, 0.01)) * 0.6;
  robe = max(robe, y - 1.75);
  robe = max(robe, 0.1 - y);
  float body = smin(cowl, robe, 0.12);
  if (body < 0.05) body += 0.012 * (fbm3(p * vec3(5.0, 2.0, 5.0)) - 0.5) + 0.004 * (noise(p * 30.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  // ── 두건 속 어둠
  r = umin(r, vec2(length(p - C) - RAD, 99.0));
  // ── 눈꺼풀: 젖은 살 테두리가 눈을 감싸고, 몇몇은 위 눈꺼풀이 반쯤 덮었다
  float lids = 1e5;
  for (int i = 0; i < 12; i++) {
    if (i >= uEN) break;
    vec3 c = uE[i].xyz;
    float er = uE[i].w;
    vec3 eq = p - c;
    if (length(eq) > er * 2.2) continue;
    vec3 g = normalize(uG[i].xyz);
    float along = dot(eq, g);
    vec3 perp = eq - g * along;
    float ring = length(vec2(length(perp) - er * 1.02, along + er * 0.05)) - er * 0.24;
    lids = min(lids, ring);
    if (mod(float(i), 3.0) < 0.5 && i != 0) {
      vec3 up = normalize(vec3(0.0, 1.0, 0.0) - g * g.y);
      float cap = abs(length(eq) - er * 1.06) - er * 0.1;
      cap = max(cap, -(dot(eq, up) - er * 0.05));
      cap = max(cap, -along - er * 0.2);
      lids = min(lids, cap);
    }
  }
  r = umin(r, vec2(lids, 2.0));
  // ── 그림자 팔과 손
  float arms = chainRange(p, 0, 159, 0.03);
  if (arms < 0.03) arms += 0.003 * (fbm3(p * 30.0) - 0.5) - 0.003 * smoothstep(0.08, 0.0, ridge(p * vec3(8.0, 20.0, 8.0)));
  for (int i = 0; i < 2; i++) {
    arms = min(arms, hand(p, uP[1 + i * 2].xyz, uP[2 + i * 2].xyz));
  }
  // 팔꿈치 혹
  for (int i = 0; i < 12; i++) {
    if (i >= uBN) break;
    if (uB[i].w <= 0.0) continue;
    arms = smin(arms, length(p - uB[i].xyz) - uB[i].w * 1.03, 0.04);
  }
  r = umin(r, vec2(arms, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 빛을 거의 먹는 검은 수의: 젖은 광택과 기름막만 테두리에 걸린다
    float v = fbm3(p * 4.0);
    vec3 alb = vec3(0.011, 0.01, 0.014) * (0.6 + 0.8 * v);
    return Mat(alb, 0.5, 0.45, vec3(0.0), 0.25, 0.0, 0.35);
  }
  if (id < 2.5) {
    // 눈꺼풀: 검붉은 젖은 살
    float vein = smoothstep(0.1, 0.0, ridge(p * 40.0));
    return Mat(mix(vec3(0.06, 0.02, 0.02), vec3(0.12, 0.02, 0.015), vein), 0.3, 0.9, vec3(0.0), 0.0, 0.6, 0.9);
  }
  // 팔: 잿빛 마른 가죽
  return Mat(vec3(0.03, 0.028, 0.03) * (0.7 + 0.5 * fbm3(p * 12.0)), 0.45, 0.6, vec3(0.0), 0.1, 0.2, 0.4);
}

vec4 volume(vec3 p) {
  // 몸 아래로 흘러내려 흩어지는 검은 연기
  if (p.y > 1.6 || p.y < -0.6 || length(p.xz) > 1.2) return vec4(0.0);
  float w = fbm3(p * vec3(2.2, 1.4, 2.2) + vec3(0.0, uSeed, 0.0));
  float rad = mix(0.12, 0.45, smoothstep(0.0, 1.0, p.y));
  float near = smoothstep(rad + 0.25, rad * 0.3, length(p.xz * vec2(1.0, 1.1))) * smoothstep(1.2, 0.6, p.y) * smoothstep(-0.25, 0.35, p.y);
  float d = near * smoothstep(0.42, 0.75, w) * 2.6;
  return vec4(vec3(0.008, 0.008, 0.012) * d, d);
}
`,
  };
}
