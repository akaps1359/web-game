// 밀랍 수사 (2층) — 녹은 촛농을 제 몸에 부어 상처를 봉한 수사.
// 정수리를 민 마른 머리. 굳은 밀랍이 얼굴 반을 덮었고(그 아래 눈은 멀었다), 어깨와 가슴엔 상처를 봉한 밀랍 덩이와 흘러내린 촛농 줄기.
// 머리와 어깨의 밀랍에 박힌 초들이 타고 있다. 손엔 끝이 피에 젖은 긴 쇠 촛대(창처럼 쓴다).
const YAW = 0.12;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function waxFriar() {
  const head = [0.0, 1.57, 0.25];
  // 초: [밑동 xyz, 높이, 반지름, 기울기x, 기울기z] (지역 좌표)
  const candles = [
    [head[0] - 0.02, head[1] + 0.105, head[2] - 0.02, 0.15, 0.018, -0.1, -0.12],
    [head[0] - 0.07, head[1] + 0.075, head[2] + 0.02, 0.09, 0.015, -0.45, 0.05],
    [head[0] + 0.035, head[1] + 0.095, head[2] - 0.03, 0.06, 0.013, 0.3, -0.25],
    [0.19, 1.47, 0.0, 0.11, 0.02, 0.25, 0.0],
    [0.24, 1.44, -0.06, 0.065, 0.016, 0.4, -0.2],
    [-0.19, 1.46, -0.01, 0.05, 0.017, -0.35, 0.1],
  ];
  const tips = candles.map(([x, y, z, h, , ax, az]) => {
    const dx = Math.sin(ax) * h;
    const dz = Math.sin(az) * h;
    const dy = Math.sqrt(Math.max(0, h * h - dx * dx - dz * dz));
    return [x + dx, y + dy, z + dz];
  });
  const flames = tips.map((t) => [t[0], t[1] + 0.022, t[2]]);
  const pt = [head[0] + 0.02, head[1] + 0.33, head[2] + 0.18];
  return {
    preset: 'act2',
    cam: { pos: [-0.2, 0.75, 5.4], target: [0.05, 1.0, 0.0], fov: 1.85 },
    light: {
      key: [-0.4, 0.62, -0.78],
      rim: 1.2,
      fillCol: [0.22, 0.12, 0.05],
      pt: toWorld(pt),
      ptCol: [1.2, 0.72, 0.3],
      exposure: 1.18,
    },
    frame: { fill: 0.9 },
    arrays: {
      uP: candles.map((c) => [c[0], c[1], c[2], c[3]]).concat(candles.map((c) => [c[4], c[5], c[6], 0])),
      uL: flames.map((f, i) => [...toWorld(f), i < 3 ? 0.016 : 0.014]).concat(flames.slice(0, 1).map((f) => [...toWorld([f[0], f[1] + 0.02, f[2]]), 0.09])),
      uLC: flames.map(() => [1.0, 0.72, 0.32, 1.35]).concat([[1.0, 0.6, 0.25, 0.18]]),
    },
    glsl: /* glsl */ `
const float YAW = ${YAW};
const vec3 HEAD = ${v3(head)};
const vec3 STAFF_A = vec3(0.37, 0.0, 0.3);
const vec3 STAFF_B = vec3(0.4, 1.78, 0.38);
const vec3 HANDR = vec3(0.37, 1.02, 0.32);
const vec3 HANDL = vec3(-0.3, 0.86, 0.18);

float bendZ(float y) { float h = max(y - 0.75, 0.0); return 0.3 * h * h; }

float sdHand(vec3 p, vec3 w, vec3 f, vec3 u, float s, vec4 c, float sp, float th, float tc) {
  float bd = length(p - w);
  if (bd > 0.3 * s) return bd - 0.2 * s;
  f = normalize(f);
  u = normalize(u - f * dot(u, f));
  vec3 sd = cross(f, u) * th;
  vec3 pc = w + f * 0.045 * s;
  vec3 q = p - pc;
  vec3 lq = vec3(dot(q, sd), dot(q, u), dot(q, f));
  float d = sdEllipsoid(lq, vec3(0.038, 0.014, 0.046) * s);
  d = smin(d, sdRoundCone(p, w - f * 0.07 * s, pc, 0.02 * s, 0.024 * s), 0.02 * s);
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    float cu = i == 0 ? c.x : i == 1 ? c.y : i == 2 ? c.z : c.w;
    vec3 a = pc + f * 0.04 * s - sd * fi * 0.017 * s + u * 0.002 * s;
    vec3 dd = normalize(f - sd * fi * sp);
    float len = (0.05 - abs(fi + 0.4) * 0.007) * s;
    float r = 0.009 * s;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.82), 0.003 * s);
      d = min(d, sdSphere(p - a, r * 1.12));
      a = b;
      r *= 0.85;
      len *= 0.8;
      dd = normalize(dd - u * cu * 0.8);
    }
  }
  vec3 ta = pc - f * 0.02 * s + sd * 0.03 * s - u * 0.006 * s;
  vec3 tb = ta + normalize(f * 0.6 + sd * 0.7 - u * 0.3) * 0.038 * s;
  vec3 tc3 = tb + normalize(f * 0.9 - sd * tc * 0.6 - u * tc * 0.5) * 0.03 * s;
  d = smin(d, sdRoundCone(p, ta, tb, 0.011 * s, 0.009 * s), 0.008 * s);
  d = smin(d, sdRoundCone(p, tb, tc3, 0.009 * s, 0.007 * s), 0.004 * s);
  return d;
}

vec3 headSpace(vec3 p) {
  vec3 q = p - HEAD;
  q.yz = rot(0.28) * q.yz;
  q.xy = rot(0.12) * q.xy;
  return q;
}
/** 마른 얼굴: 움푹한 뺨, 깊은 눈두덩, 얇은 입 */
float sdFace(vec3 q) {
  float d = sdEllipsoid(q - vec3(0.0, 0.025, -0.012), vec3(0.083, 0.1, 0.098));
  float jaw = sdEllipsoid(q - vec3(0.0, -0.07, 0.03), vec3(0.058, 0.048, 0.062));
  d = smin(d, jaw, 0.045);
  vec3 qa = vec3(abs(q.x), q.y, q.z);
  d = smin(d, sdEllipsoid(qa - vec3(0.053, -0.012, 0.058), vec3(0.024, 0.017, 0.026)), 0.02);
  d = smax(d, -sdEllipsoid(qa - vec3(0.066, -0.05, 0.048), vec3(0.022, 0.028, 0.03)), 0.02);
  d = smax(d, -sdEllipsoid(qa - vec3(0.031, 0.012, 0.084), vec3(0.023, 0.016, 0.02)), 0.012);
  d = smin(d, sdEllipsoid(qa - vec3(0.03, 0.034, 0.08), vec3(0.03, 0.01, 0.016)), 0.015);
  d = smin(d, sdRoundCone(q, vec3(0.0, 0.012, 0.094), vec3(0.0, -0.028, 0.112), 0.009, 0.012), 0.012);
  d = smax(d, -sdEllipsoid(q - vec3(0.0, -0.058, 0.094), vec3(0.022, 0.0035, 0.02)), 0.004);
  d = smin(d, sdEllipsoid(qa - vec3(0.083, 0.0, 0.0), vec3(0.01, 0.026, 0.017)), 0.01);
  return d;
}

float sdCandle(vec3 p, int i, out float isWick) {
  vec4 a = uP[i];
  vec4 b = uP[i + 6];
  vec3 dir = normalize(vec3(sin(b.y), 1.0, sin(b.z)));
  vec3 base = a.xyz;
  vec3 tip = base + dir * a.w;
  float d = sdCapsule(p, base, tip - dir * 0.004, b.x);
  // 녹은 윗면 구덩이
  d = max(d, -sdSphere(p - tip - dir * 0.004, b.x * 0.75));
  float wick = sdCapsule(p, tip - dir * 0.01, tip + dir * 0.012, 0.0018);
  isWick = wick < d ? 1.0 : 0.0;
  return min(d, wick);
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  vec3 b = p;
  b.z -= bendZ(b.y);

  // ── 수도복: 무겁고 두꺼운 갈색 모직
  float y = clamp(b.y / 1.3, 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rr = mix(0.36, 0.2, pow(y, 0.55)) + 0.05 * smoothstep(0.12, 0.0, b.y);
  rr += 0.035 * (1.0 - y * 0.8) * (sin(ang * 8.0 + y * 3.0) * 0.6 + sin(ang * 19.0 + 1.0) * 0.3);
  float robe = (length(b.xz * vec2(1.0, 1.15)) - rr) * 0.7;
  robe = max(robe, b.y - 1.3);
  robe = max(robe, 0.01 + 0.04 * fbm3(vec3(b.x * 9.0, 0.0, b.z * 9.0)) - b.y);
  float torso = sdEllipsoid(b - vec3(0.0, 1.24, 0.0), vec3(0.21, 0.26, 0.18));
  torso = smin(torso, sdEllipsoid(b - vec3(0.0, 1.32, -0.08), vec3(0.2, 0.18, 0.13)), 0.08);
  float shoulders = min(sdSphere(b - vec3(0.17, 1.35, -0.02), 0.085), sdSphere(b - vec3(-0.17, 1.35, -0.02), 0.085));
  // 목에서 어깨로 비스듬히 내려가는 승모근
  shoulders = smin(shoulders, sdEllipsoid(b - vec3(0.0, 1.42, -0.03), vec3(0.15, 0.06, 0.11)), 0.08);
  torso = smin(torso, shoulders, 0.1);
  float body = smin(robe, torso, 0.16);
  // 목 뒤로 늘어진 두건 (벗었다)
  vec3 kq = b - vec3(0.0, 1.43, -0.06);
  float hood = sdTorus(kq * vec3(1.0, 1.0, 1.15), vec2(0.12, 0.05)) - 0.01 * sin(atan(kq.z, kq.x) * 9.0);
  hood = smin(hood, sdEllipsoid(kq - vec3(0.0, -0.02, -0.12), vec3(0.16, 0.12, 0.09)), 0.05);
  body = smin(body, hood, 0.05);
  // 팔
  vec3 shR = vec3(0.18, 1.34, bendZ(1.34));
  vec3 elR = vec3(0.36, 1.12, 0.12);
  vec3 shL = vec3(-0.18, 1.34, bendZ(1.34));
  vec3 elL = vec3(-0.33, 1.08, 0.06);
  float arms = min(sdRoundCone(p, shR, elR, 0.085, 0.075), sdRoundCone(p, elR, HANDR + vec3(-0.01, 0.0, -0.06), 0.075, 0.09));
  arms = min(arms, min(sdRoundCone(p, shL, elL, 0.085, 0.075), sdRoundCone(p, elL, HANDL + vec3(0.0, 0.07, -0.02), 0.075, 0.09)));
  arms = max(arms, -sdSphere(p - HANDR - vec3(-0.01, 0.0, -0.02), 0.06));
  arms = max(arms, -sdSphere(p - HANDL - vec3(0.0, 0.04, 0.0), 0.06));
  body = smin(body, arms, 0.05);
  body += 0.004 * (fbm3(p * 22.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  // 허리 끈과 세 매듭
  vec3 wq = b - vec3(0.0, 0.98, 0.0);
  float belt = length(vec2(length(wq.xz * vec2(1.0, 1.15)) - 0.255, wq.y)) - 0.017;
  vec3 kq2 = b - vec3(-0.08, 0.96, 0.24);
  float cord = sdCapsule(kq2, vec3(0.0), vec3(-0.02, -0.5, 0.05), 0.012);
  for (int i = 0; i < 3; i++) cord = min(cord, sdSphere(kq2 - vec3(-0.004 * float(i + 1), -0.14 * float(i + 1), 0.01 * float(i + 1)), 0.022));
  r = umin(r, vec2(min(belt, cord), 4.0));

  // ── 머리: 민머리, 마른 얼굴
  vec3 hq = headSpace(p);
  float face = sdFace(hq);
  float neck = sdRoundCone(p, vec3(0.0, 1.42, bendZ(1.42) + 0.01), HEAD + vec3(0.0, -0.08, -0.02), 0.065, 0.05);
  face = smin(face, neck, 0.04);
  face += 0.0015 * (fbm3(p * 70.0) - 0.5);
  r = umin(r, vec2(face, 2.0));
  // 드러난 쪽 눈: 젖은 눈알이 움푹한 눈두덩 속에서 번들거린다
  r = umin(r, vec2(sdSphere(hq - vec3(0.031, 0.011, 0.075), 0.0125), 6.0));

  // ── 밀랍: 얼굴 오른쪽 반을 덮은 두꺼운 껍질 + 정수리의 밀랍 덩이 + 어깨·가슴의 봉합
  float side = smoothstep(-0.02, 0.025, -hq.x + 0.012 + 0.018 * sin(hq.y * 40.0 + 1.0) + 0.015 * noise(hq * 30.0) - 0.25 * max(hq.y - 0.02, 0.0));
  // 얇고 울퉁불퉁한 껍질: 정수리 쪽이 두껍고, 아래로 흘러내린 골이 졌다
  float thick = 0.003 + 0.016 * smoothstep(-0.03, 0.11, hq.y) + 0.006 * fbm3(hq * 30.0);
  float runnel = noise(vec3(hq.x * 70.0, hq.y * 9.0, hq.z * 70.0));
  thick += 0.006 * smoothstep(0.4, 0.8, runnel);
  float shell = sdFace(hq) - thick * side;
  float wax = smax(shell, -side + 0.45, 0.01);
  float crown = sdEllipsoid(hq - vec3(-0.015, 0.085, -0.01), vec3(0.08, 0.04, 0.08)) - 0.008 * fbm3(hq * 22.0);
  wax = smin(wax, crown, 0.03);
  // 얼굴과 목으로 흘러내린 촛농 줄기
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float x = -0.085 + fi * 0.016 + 0.008 * sin(fi * 3.7);
    float zz = 0.05 + 0.04 * cos(fi * 1.3);
    float len = 0.06 + 0.07 * fract(sin(fi * 12.9898) * 43758.5);
    vec3 s0 = vec3(x, 0.07 - abs(x) * 0.4, zz);
    vec3 s1 = s0 + vec3(0.004 * sin(fi), -len - (x > -0.02 ? 0.06 : 0.0), 0.012 + 0.01 * cos(fi));
    // 얼굴 표면을 따라 흐르도록 얼굴 쪽으로 붙인다
    float drip = sdRoundCone(hq, s0, s1, 0.008, 0.005);
    drip = smin(drip, sdSphere(hq - s1, 0.0075), 0.005);
    drip = max(drip, sdFace(hq) - 0.014);
    if (x < 0.02 || i == 6) wax = smin(wax, drip, 0.008);
  }
  // 어깨 위에 굳은 밀랍 덩이 + 가슴의 상처 봉합
  float blobs = sdEllipsoid(b - vec3(0.16, 1.42, -0.01), vec3(0.085, 0.04, 0.08));
  blobs = smin(blobs, sdEllipsoid(b - vec3(-0.16, 1.42, -0.01), vec3(0.085, 0.04, 0.08)), 0.02);
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float sx = i < 4 ? 0.16 : -0.16;
    float a = fi * 2.399;
    vec3 s0 = vec3(sx + 0.055 * cos(a), 1.4, 0.05 * sin(a) + 0.02);
    s0.z += bendZ(1.45);
    float len = 0.08 + 0.1 * fract(sin(fi * 7.31) * 43758.5);
    vec3 s1 = s0 + vec3(0.01 * cos(a), -len * 0.7, 0.045 + 0.02 * sin(a));
    blobs = smin(blobs, sdRoundCone(p, s0, s1, 0.013, 0.007), 0.012);
  }
  // 가슴의 상처를 봉한 넓적한 밀랍 (옷에 스며 붙었다)
  float splash = sdEllipsoid(b - vec3(-0.05, 1.19, 0.17), vec3(0.075, 0.06, 0.12)) + 0.04 * (fbm3(b * 14.0) - 0.5);
  float seal = max(body - 0.01 - 0.006 * fbm3(p * 30.0), splash);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = -0.1 + fi * 0.035;
    float len = 0.08 + 0.12 * fract(sin(fi * 5.1) * 437.5);
    seal = smin(seal, max(body - 0.007, sdEllipsoid(b - vec3(x, 1.17 - len * 0.5, 0.2), vec3(0.012, len * 0.5, 0.1))), 0.015);
  }
  blobs = min(blobs, seal);
  // 왼손은 밀랍에 엉겨 손가락이 붙었다
  blobs = smin(blobs, sdEllipsoid(p - HANDL - vec3(0.0, -0.04, 0.03), vec3(0.05, 0.065, 0.04)), 0.02);
  wax = min(wax, blobs);
  wax += 0.0025 * (fbm3(p * 45.0) - 0.5);
  r = umin(r, vec2(wax, 3.0));

  // ── 초 (밀랍에 박혀 타고 있다)
  for (int i = 0; i < 6; i++) {
    float w;
    float c = sdCandle(p, i, w);
    if (c < r.x) r = vec2(c, w > 0.5 ? 8.0 : 7.0);
  }

  // ── 손: 쇠 촛대를 쥔 오른손 + 밀랍에 엉긴 왼손
  float hR = sdHand(p, HANDR + vec3(-0.035, 0.0, -0.03), vec3(0.15, -0.1, 1.0), vec3(1.0, 0.25, 0.0), 1.2, vec4(1.5, 1.55, 1.55, 1.5), 0.04, -1.0, 1.2);
  float hL = sdHand(p, HANDL + vec3(0.0, 0.03, 0.0), vec3(0.05, -1.0, 0.15), vec3(-1.0, 0.0, 0.1), 1.2, vec4(0.4, 0.45, 0.5, 0.6), 0.05, 1.0, 0.5);
  r = umin(r, vec2(min(hR, hL), 2.0));

  // ── 쇠 촛대: 세발 받침, 마디, 촛농 받이 접시, 피 묻은 꼬챙이
  vec3 sa = STAFF_A + vec3(0.0, 0.06, 0.0);
  vec3 sdir = normalize(STAFF_B - sa);
  float staff = sdCapsule(p, sa, STAFF_B, 0.014);
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.094 + 0.3;
    staff = min(staff, sdCapsule(p, sa + vec3(0.0, 0.03, 0.0), STAFF_A + vec3(cos(a) * 0.13, 0.008, sin(a) * 0.13), 0.01));
  }
  staff = min(staff, sdSphere(p - mix(sa, STAFF_B, 0.4), 0.028));
  staff = min(staff, sdSphere(p - mix(sa, STAFF_B, 0.83), 0.022));
  vec3 pan = STAFF_B - sdir * 0.07;
  vec3 pq = p - pan;
  float dish = max(abs(pq.y) - 0.006, length(pq.xz) - 0.085);
  dish = min(dish, max(abs(length(pq.xz) - 0.082) - 0.006, abs(pq.y - 0.012) - 0.018));
  staff = min(staff, dish);
  float spike = sdRoundCone(p, STAFF_B - sdir * 0.07, STAFF_B + sdir * 0.17, 0.012, 0.001);
  staff = min(staff, spike);
  r = umin(r, vec2(staff, 5.0));
  // 접시에 고인 밀랍
  r = umin(r, vec2(max(sdEllipsoid(pq - vec3(0.0, 0.01, 0.0), vec3(0.075, 0.02, 0.075)), -pq.y + 0.004), 3.0));
  return r;
}

float ashDust(vec3 p, vec3 n) {
  return smoothstep(0.3, 0.9, n.y + 0.35 * (fbm3(p * 9.0) - 0.5));
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = ashDust(lp, n);
  if (id < 1.5) {
    float dirt = fbm3(lp * 5.0);
    float weave = 0.82 + 0.18 * noise(lp * vec3(200.0, 70.0, 200.0));
    vec3 alb = vec3(0.045, 0.032, 0.022) * (0.6 + 0.8 * dirt) * weave;
    alb = mix(alb, vec3(0.1, 0.095, 0.09), ash * 0.55);
    // 피가 밴 얼룩 (밀랍 아래에서 번졌다)
    float stain = smoothstep(0.6, 0.8, fbm3(lp * 7.0 + 3.0)) * smoothstep(0.5, 1.3, lp.y);
    alb = mix(alb, vec3(0.035, 0.006, 0.005), stain);
    return Mat(alb, 0.9, 0.08, vec3(0.0), 0.0, 0.0, stain * 0.3);
  }
  if (id < 2.5) {
    // 창백하고 마른 살갗
    float blot = fbm3(lp * 20.0);
    vec3 alb = vec3(0.17, 0.135, 0.11) * (0.72 + 0.45 * blot);
    float vein = smoothstep(0.06, 0.0, ridge(lp * 22.0)) * 0.4;
    alb = mix(alb, vec3(0.08, 0.05, 0.06), vein);
    return Mat(alb, 0.55, 0.4, vec3(0.0), 0.0, 0.6, 0.18);
  }
  if (id < 3.5) {
    // 밀랍: 누런 상아빛, 반투명, 번들거림. 오래된 곳은 재가 섞여 잿빛, 상처 위는 피가 비친다
    float age = fbm3(lp * 8.0);
    vec3 alb = mix(vec3(0.19, 0.13, 0.055), vec3(0.11, 0.09, 0.06), smoothstep(0.4, 0.75, age));
    float blood = smoothstep(0.6, 0.8, fbm3(lp * 14.0 + 7.0));
    alb = mix(alb, vec3(0.14, 0.025, 0.015), blood * 0.75);
    alb = mix(alb, vec3(0.1, 0.095, 0.09), ash * 0.4);
    return Mat(alb * 0.85, 0.22, 1.0, vec3(0.0), 0.0, 0.6, 0.65);
  }
  if (id < 4.5) {
    float tw = 0.7 + 0.3 * sin(dot(lp, vec3(120.0, 160.0, 120.0)));
    return Mat(vec3(0.07, 0.06, 0.045) * tw, 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 5.5) {
    // 검은 쇠, 녹, 꼬챙이 끝의 피
    float rust = fbm3(lp * 16.0);
    vec3 alb = mix(vec3(0.025, 0.022, 0.02), vec3(0.07, 0.032, 0.016), smoothstep(0.45, 0.7, rust));
    float blood = smoothstep(1.6, 1.85, lp.y) * smoothstep(0.3, 0.6, fbm3(lp * 30.0));
    alb = mix(alb, vec3(0.06, 0.005, 0.004), blood);
    return Mat(alb, mix(0.55, 0.2, blood), mix(0.7, 1.2, blood), vec3(0.0), 0.0, 0.0, blood * 0.8);
  }
  if (id < 6.5) return Mat(vec3(0.12, 0.11, 0.1), 0.05, 2.0, vec3(0.0), 0.0, 0.0, 1.0);
  if (id < 7.5) {
    // 초: 상아빛, 위로 갈수록 불빛을 머금는다
    return Mat(vec3(0.13, 0.105, 0.065), 0.35, 0.5, vec3(0.0), 0.0, 0.6, 0.4);
  }
  return Mat(vec3(0.01), 0.9, 0.0, vec3(0.4, 0.15, 0.03), 0.0, 0.0, 0.0);
}
`,
  };
}
