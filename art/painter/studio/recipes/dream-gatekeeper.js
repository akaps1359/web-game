// 꿈의 문지기 (5층 정예) — 얕은 잠의 일흔 계단 끝, 깊은 잠의 문을 지키는 자. 문 앞에서는 무엇이 진짜인지 그가 정한다.
// 허공에 떠 선, 키가 사람 셋은 되는 사제. 길고 뾰족한 두건 속엔 눈을 감은 창백한 가면만 떠 있다.
// 무거운 법의의 앞섶이 가슴에서 발치까지 뾰족한 아치처럼 갈라져 있고, 그 안엔 몸이 없다 —
// 대신 금빛 속으로 끝없이 내려가는 계단이 보인다 (그 자신이 깊은 잠의 문이다).
// 한 손엔 열쇠 꾸러미와 작은 등을 매단 긴 지팡이, 다른 손은 마른 손바닥을 내밀어 길을 막는다. 밑단은 해져 안개로 풀린다.
import { rng } from '../../lib.js';

export default function dreamGatekeeper({ seed = 1 } = {}) {
  const R = rng(seed * 733 + 41);
  const head = [0.0, 3.38, 0.32];
  const staffTop = [1.02, 4.2, 0.55];
  const lamp = [1.02, 3.62, 0.66];
  const lights = [
    [head[0] - 0.068, head[1] - 0.01, head[2] + 0.2, 0.007],
    [head[0] + 0.068, head[1] - 0.01, head[2] + 0.2, 0.007],
    [lamp[0], lamp[1], lamp[2], 0.04],
  ];
  const lc = [
    [1.0, 0.82, 0.45, 1.3],
    [1.0, 0.82, 0.45, 1.3],
    [1.0, 0.8, 0.45, 0.6],
  ];
  // 문에서 흘러나오는 금빛 티끌
  for (let i = 0; i < 12; i++) {
    lights.push([(R() - 0.5) * 0.9, 0.5 + R() * 2.0, 0.6 + R() * 0.8, 0.005 + R() * 0.007]);
    lc.push([1.0, 0.85, 0.55, 0.9]);
  }
  for (let i = 0; i < 5; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (1.2 + R() * 0.6), 0.6 + R() * 3.4, Math.sin(a) * 0.5 + 0.3, 0.005 + R() * 0.006]);
    lc.push([0.85, 0.7, 1.0, 0.7]);
  }
  return {
    preset: 'act5',
    cam: { pos: [2.4, 0.6, 10.4], target: [0.15, 2.2, 0.0], fov: 1.75 },
    light: {
      key: [-0.4, 0.55, -0.75],
      keyCol: [1.15, 0.8, 1.15],
      fillCol: [0.05, 0.1, 0.13],
      amb: [0.012, 0.01, 0.02],
      rimCol: [1.0, 0.75, 1.2],
      rim: 1.7,
      exposure: 1.25,
      glow: 0.05,
      pt: [0.0, 1.55, 0.9],
      ptCol: [1.5, 1.0, 0.45],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uL: lights, uLC: lc },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 40
#define VOLUME_FAR 16.0
#define HAS_BG

const vec3 HEAD = vec3(${head.join(', ')});
const vec3 STAFF_TOP = vec3(${staffTop.join(', ')});
const vec3 LAMP = vec3(${lamp.join(', ')});
const vec3 HAND_R = vec3(0.98, 2.3, 0.56);
const vec3 HAND_L = vec3(-0.72, 2.55, 0.92);

// 등이 살짝 앞으로 굽는다
float bend(float y) { float h = max(y - 1.6, 0.0); return 0.12 * h * h; }

float hand(vec3 p, vec3 c, vec3 dir, vec3 up, float spread, float curl) {
  float d = sdEllipsoid(p - c, vec3(0.05, 0.065, 0.028));
  vec3 side = normalize(cross(dir, up));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5);
    vec3 a = c + dir * 0.045 + side * o * 0.022;
    vec3 fd = normalize(dir + side * o * spread);
    vec3 m = a + fd * (0.1 - abs(o) * 0.012);
    vec3 e = m + normalize(fd - up * curl) * 0.08;
    d = smin(d, sdRoundCone(p, a, m, 0.012, 0.009), 0.01);
    d = smin(d, sdRoundCone(p, m, e, 0.009, 0.005), 0.005);
    d = smin(d, sdSphere(p - m, 0.011), 0.004);
  }
  d = smin(d, sdRoundCone(p, c - side * 0.035, c - side * 0.085 + dir * 0.05, 0.013, 0.008), 0.012);
  return d;
}

// 늘어진 종 모양 소매: 어깨→팔꿈치는 통, 팔꿈치 아래로 넓게 처진 빈 자락 (끝은 해졌다)
float sleeve(vec3 p, vec3 sh, vec3 el, vec3 hangDir) {
  float upper = sdRoundCone(p, sh, el, 0.14, 0.13);
  vec3 ax = normalize(hangDir);
  vec3 q = p - el;
  float h = dot(q, ax);
  float rad = length(q - ax * h);
  float L = 0.62;
  float t = clamp(h / L, 0.0, 1.0);
  float R = mix(0.13, 0.3, pow(t, 0.8));
  float cone = (rad - R) * 0.85;
  vec3 sd = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
  float ang = atan(dot(q, cross(ax, sd)), dot(q, sd));
  float cut = h - L - 0.07 * sin(ang * 4.0 + 1.0) - 0.06 * (noise(p * 7.0) - 0.4);
  float lower = max(abs(cone) - 0.02, max(-h, cut));
  return smin(upper, lower, 0.06);
}
// 마른 아래팔: 뼈가 불거진 두 마디
float forearm(vec3 p, vec3 a, vec3 b) {
  float d = sdRoundCone(p, a, b, 0.045, 0.03);
  d = smin(d, sdSphere(p - mix(a, b, 0.08), 0.05), 0.03);
  d = smin(d, sdEllipsoid(p - mix(a, b, 0.92), vec3(0.04, 0.035, 0.035)), 0.02);
  return d;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.2, 2.1, 0.2)) - 2.7;
  if (bb > 0.5) return vec2(bb, 1.0);
  vec3 b = p;
  b.z -= bend(b.y);
  // ── 법의: 속이 빈 껍데기. 밑단은 해져 안개로 풀린다 (떠 있다)
  float robeS = sdRobe(b - vec3(0.0, 0.1, 0.0), 3.05, 0.3, 0.82, 10.0, 0.07);
  float torso = sdEllipsoid(b - vec3(0.0, 2.85, -0.02), vec3(0.42, 0.34, 0.3));
  robeS = smin(robeS, torso, 0.25);
  float shell = abs(robeS + 0.04) - 0.035;
  float hem = 0.1 + 0.35 * fbm3(vec3(p.x * 4.0, 0.0, p.z * 4.0)) + 0.3 * smoothstep(0.55, 0.9, noise(vec3(atan(p.z, p.x) * 3.0, 1.0, 2.0)));
  shell = max(shell, hem - p.y);
  // 앞섶이 뾰족한 아치로 갈라진다 (가슴에서 발치까지)
  float yy = clamp((p.y - 0.2) / 2.75, 0.0, 1.0);
  float w = 0.46 * pow(1.0 - yy, 0.55) - 0.02;
  w += 0.02 * sin(p.y * 13.0);
  float open = max(abs(b.x) - w, -b.z + 0.05);
  open = max(open, b.y - 2.95);
  shell = smax(shell, -open, 0.03);
  // 앞섶 가장자리가 두껍게 접혀 있다
  float lapel = max(abs(abs(b.x) - w - 0.02) - 0.03, max(-b.z + 0.25 + 0.0 * b.y, b.y - 2.9));
  lapel = max(lapel, robeS - 0.02);
  lapel = max(lapel, -robeS - 0.12);
  lapel = max(lapel, hem - p.y);
  shell = smin(shell, lapel, 0.03);
  // 소매: 넓게 늘어진다 (끝이 비었다)
  vec3 shR = vec3(0.45, 2.95, bend(2.95));
  vec3 shL = vec3(-0.45, 2.95, bend(2.95));
  vec3 elR = vec3(0.78, 2.5, 0.22);
  vec3 elL = vec3(-0.7, 2.45, 0.38);
  float sleeves = min(sleeve(p, shR, elR, vec3(0.25, -1.0, 0.35)), sleeve(p, shL, elL, vec3(-0.15, -1.0, 0.45)));
  float robe = smin(shell, sleeves, 0.06);
  // ── 깊고 뾰족한 두건
  vec3 hq = (p - HEAD) / 1.25;
  hq.yz = rot(0.4) * hq.yz;
  float hood = sdEllipsoid(hq - vec3(0.0, 0.02, -0.04), vec3(0.2, 0.24, 0.23));
  hood = smin(hood, sdRoundCone(hq, vec3(0.0, 0.1, -0.12), vec3(0.0, 0.34, -0.42), 0.16, 0.025), 0.12);
  hood = smin(hood, sdEllipsoid(hq - vec3(0.0, 0.08, 0.12), vec3(0.19, 0.15, 0.16)), 0.06);
  // 두건 자락이 어깨를 덮는 짧은 망토
  vec3 cq = p - vec3(0.0, 2.95, bend(2.95) - 0.02);
  float cape = sdEllipsoid(cq, vec3(0.5, 0.38, 0.38));
  cape = max(abs(cape) - 0.03, cq.y - 0.35 + 0.0);
  cape = max(cape, -(cq.y + 0.32 + 0.08 * sin(atan(cq.z, cq.x) * 9.0) + 0.06 * noise(cq * 8.0)));
  cape = max(cape, -sdEllipsoid(cq - vec3(0.0, 0.35, 0.35), vec3(0.16, 0.3, 0.22)));
  float faceCut = sdEllipsoid(hq - vec3(0.0, -0.03, 0.2), vec3(0.13, 0.17, 0.2));
  hood = max(hood, -faceCut);
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.01, -0.02), vec3(0.16, 0.2, 0.19)));
  robe = smin(robe, hood * 1.25, 0.06);
  robe = smin(robe, cape, 0.05);
  if (robe < 0.05) robe += 0.005 * (fbm3(p * 18.0) - 0.5);
  // 안쪽 면 (껍데기 속): 문 너머의 빛
  float inside = step(robeS + 0.04, 0.0);
  vec2 r = vec2(robe, inside > 0.5 && sleeves > 0.02 && hood > 0.02 ? 5.0 : 1.0);
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.02, 0.0), vec3(0.14, 0.18, 0.15)) * 1.25, 99.0));
  // ── 가면: 눈 감은 창백한 얼굴, 두건 속에 떠 있다
  vec3 mq = hq - vec3(0.0, -0.03, 0.075);
  float mask = sdEllipsoid(mq, vec3(0.085, 0.12, 0.055));
  mask = max(mask, -sdEllipsoid(mq + vec3(0.0, 0.0, 0.03), vec3(0.085, 0.12, 0.06)));
  float slit = sdBox(vec3(abs(mq.x) - 0.042, mq.y - 0.012 + 0.012 * abs(mq.x) * 10.0 * 0.0, mq.z - 0.05), vec3(0.028, 0.003, 0.05));
  mask = smax(mask, -slit, 0.004);
  mask = smin(mask, sdEllipsoid(mq - vec3(0.0, -0.01, 0.045), vec3(0.012, 0.04, 0.02)), 0.02);
  r = umin(r, vec2(mask * 1.25, 2.0));
  // ── 손
  float fa = min(forearm(p, elR + vec3(0.0, -0.12, 0.1), HAND_R - vec3(-0.04, 0.03, 0.03)), forearm(p, elL + vec3(0.0, -0.1, 0.12), HAND_L - vec3(0.02, 0.06, 0.01)));
  float hr = hand(p, HAND_R, normalize(vec3(0.2, 0.0, 1.0)), vec3(0.0, 1.0, 0.0), 0.03, 2.2);
  float hl = hand(p * 0.8 + HAND_L * 0.2, HAND_L, normalize(vec3(0.05, 1.0, 0.2)), normalize(vec3(0.0, -0.2, 1.0)), 0.16, -0.15) / 0.8;
  r = umin(r, vec2(smin(min(hr, hl), fa, 0.03), 7.0));
  // ── 지팡이: 끝은 갈고리처럼 휘어 등을 매달았다, 열쇠 꾸러미
  vec3 sbot = vec3(1.05, 0.25, 0.5);
  float staff = sdCapsule(p, sbot, STAFF_TOP, 0.026);
  vec3 tq = p - STAFF_TOP;
  float hook = abs(length(tq.xy - vec2(-0.13, 0.0)) - 0.13) - 0.022;
  hook = max(hook, abs(tq.z) - 0.022);
  hook = max(hook, -tq.y - 0.0 + min(0.0, tq.x + 0.13) * 0.0);
  hook = max(hook, -(tq.y + 0.02));
  staff = min(staff, hook);
  staff = min(staff, sdCapsule(p, STAFF_TOP + vec3(-0.26, 0.0, 0.0), LAMP + vec3(-0.0, 0.1, 0.0) + vec3(-0.0, 0.0, 0.0), 0.006));
  vec3 lq = p - LAMP;
  float cage = sdRoundBox(lq, vec3(0.045, 0.07, 0.045), 0.01);
  cage = max(cage, -sdBox(lq, vec3(0.035, 0.055, 0.07)));
  cage = max(cage, -sdBox(lq, vec3(0.07, 0.055, 0.035)));
  cage = min(cage, sdCappedCone(lq - vec3(0.0, 0.085, 0.0), 0.018, 0.05, 0.012));
  staff = min(staff, cage);
  // 열쇠들: 지팡이 중간 고리에 매달린 긴 열쇠 셋
  vec3 kr = vec3(1.05, 3.15, 0.53);
  staff = min(staff, sdTorus((p - kr).xzy, vec2(0.05, 0.008)));
  for (int i = 0; i < 3; i++) {
    float fi = float(i) - 1.0;
    vec3 k0 = kr + vec3(fi * 0.035, -0.05, 0.04);
    vec3 k1 = k0 + vec3(fi * 0.05, -0.28 + abs(fi) * 0.06, 0.02);
    float key = sdCapsule(p, k0, k1, 0.009);
    key = min(key, sdTorus((p - k0 - vec3(0.0, -0.02, 0.0)).xyz, vec2(0.022, 0.006)));
    key = min(key, sdBox(p - k1 - vec3(0.02, 0.03, 0.0), vec3(0.02, 0.008, 0.006)));
    staff = min(staff, key);
  }
  r = umin(r, vec2(staff, 3.0));
  r = umin(r, vec2(sdEllipsoid(lq, vec3(0.028, 0.045, 0.028)), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 5.0);
  if (id < 1.5) {
    // 무거운 법의: 검보랏빛, 결이 진 천, 앞섶 가장자리엔 바랜 금실
    float weave = 0.85 + 0.15 * noise(p * 120.0);
    vec3 alb = vec3(0.032, 0.026, 0.044) * (0.55 + 0.8 * v) * weave;
    float yy = clamp((p.y - 0.2) / 2.75, 0.0, 1.0);
    float w = 0.46 * pow(1.0 - yy, 0.55) - 0.02 + 0.02 * sin(p.y * 13.0);
    float edge = smoothstep(0.09, 0.03, abs(abs(p.x) - w - 0.03)) * step(0.0, p.z) * step(p.y, 2.95);
    float hemBand = smoothstep(0.03, 0.0, abs(p.y - 0.75 - 0.15 * v) - 0.022);
    float gold = max(edge, hemBand) * smoothstep(0.25, 0.6, noise(p * 30.0) + 0.3);
    alb = mix(alb, vec3(0.2, 0.14, 0.05), gold);
    return Mat(alb, mix(0.9, 0.3, gold), mix(0.08, 1.2, gold), vec3(0.0), 0.0, 0.0, 0.05);
  }
  if (id < 2.5) {
    // 가면: 오래된 상아빛 사기, 금이 가 있다
    float crack = smoothstep(0.03, 0.0, ridge(p * 14.0)) * 0.6;
    vec3 alb = vec3(0.32, 0.29, 0.25) * (0.75 + 0.3 * v) * (1.0 - crack * 0.6);
    return Mat(alb, 0.35, 0.7, vec3(0.0), 0.0, 0.3, 0.2);
  }
  if (id < 3.5) {
    // 검게 그을린 쇠와 바랜 금
    float worn = 0.6 + 0.6 * fbm3(p * 25.0);
    return Mat(vec3(0.07, 0.05, 0.03) * worn, 0.35, 1.2, vec3(0.0), 0.0, 0.0, 0.3);
  }
  if (id < 4.5) return Mat(vec3(0.0), 0.1, 1.0, vec3(2.2, 1.45, 0.6), 0.0, 0.0, 0.3);
  if (id < 5.5) {
    // 법의 안: 몸 대신 금빛 속으로 끝없이 내려가는 계단. 먼 끝(위 가운데)에 작은 빛의 문
    float y = p.y;
    float yh = 2.32;
    float far = 1.0 / max(yh - y, 0.04);
    float halfW = 0.05 + max(yh - y, 0.0) * 0.16;
    float px = p.x - (p.z - 0.5) * 0.23;
    float inStair = smoothstep(0.015, -0.015, abs(px) - halfW) * step(y, yh);
    float stp = fract(far * 1.1);
    float riser = smoothstep(0.0, 0.08, stp) * smoothstep(0.6, 0.4, stp);
    float glow = exp(-max(yh - y, 0.0) * 1.1);
    vec2 dq = vec2(px, y - yh);
    float doorA = max(abs(dq.x) - 0.045, max(-dq.y, dq.y - 0.11));
    doorA = min(doorA, max(length(dq - vec2(0.0, 0.11)) - 0.045, -dq.y + 0.11));
    float door = smoothstep(0.01, -0.005, doorA);
    vec3 dark = vec3(0.02, 0.012, 0.03);
    vec3 gold = vec3(1.5, 1.0, 0.42);
    vec3 emi = gold * glow * inStair * mix(0.18, 1.0, riser) * 1.1;
    emi += vec3(0.12, 0.05, 0.17) * (1.0 - inStair) * (0.1 + 0.45 * glow);
    emi += vec3(2.2, 1.8, 1.2) * door + gold * exp(-length(dq - vec2(0.0, 0.06)) * 9.0) * 0.6;
    return Mat(dark, 0.9, 0.0, emi, 0.0, 0.0, 0.0);
  }
  // 손: 잿빛으로 마른 살, 마디는 더 어둡다
  return Mat(vec3(0.075, 0.07, 0.075) * (0.7 + 0.5 * v), 0.5, 0.4, vec3(0.0), 0.0, 0.35, 0.15);
}

// 밑단에서 풀려 나오는 안개 + 앞섶 틈으로 흘러나오는 금빛
vec4 volume(vec3 p) {
  float n1 = fbm3(p * vec3(2.0, 3.0, 2.0) + vec3(0.0, uSeed, 3.0));
  float low = smoothstep(0.8, 0.0, p.y) * smoothstep(1.4, 0.4, length(p.xz)) * smoothstep(-0.4, 0.15, p.y);
  float mist = low * smoothstep(0.42, 0.7, n1);
  float spill = smoothstep(0.45, 0.0, abs(p.x) - 0.1) * smoothstep(2.2, 0.3, p.y) * smoothstep(0.3, 0.7, p.z) * smoothstep(1.6, 0.8, p.z);
  float dens = mist * 1.4 + spill * 0.35 * (0.4 + n1);
  if (dens < 0.002) return vec4(0.0);
  vec3 col = vec3(0.3, 0.24, 0.42) * mist * 0.35 + vec3(1.0, 0.72, 0.32) * spill * 0.8;
  return vec4(col, dens * 0.8);
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
