// 타종 수련사 (2층) — 종탑의 밧줄을 당기던 견습. 제 몸만 한 청동 종을 등에 묶어 지고 다닌다.
// 종의 무게에 등이 꺾였고, 깊은 두건 아래 터진 고막에서 흘러내린 피가 목을 적셨다. 종 정수리엔 촛불 하나.
// 한 손엔 치켜든 작은 손종, 다른 손엔 바닥까지 끌리는 해진 밧줄. 종소리는 여전히 들린다고 한다.
import { rng } from '../../lib.js';

const YAW = -0.42;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((x) => x / l);
};

export default function bellAcolyte({ seed = 1 } = {}) {
  const R = rng(seed * 131 + 9);
  const M = [0.0, 1.1, -0.37]; // 큰 종의 입 중심
  const A = norm([0.0, 0.92, 0.36]); // 입 → 정수리
  const H = 0.5;
  const crown = M.map((v, i) => v + A[i] * H);
  const flame = [crown[0] + 0.0, crown[1] + 0.135, crown[2] + 0.05];
  const handL = [-0.15, 1.3, 0.47];
  const cr = (p0, p1, p2, p3, t) =>
    [0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t * t * t));
  const chainPts = [];
  const addRope = (P, r0, n = 5) => {
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)];
      const p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 0; k < n; k++) chainPts.push([...cr(p0, P[i], P[i + 1], p3, k / n), r0 * (0.92 + R() * 0.16)]);
    }
    chainPts.push([...P[P.length - 1], r0]);
    chainPts.push([0, 0, 0, 0]);
  };
  // 어깨끈 두 줄: 종 정수리 → 어깨 위 → 가슴 앞 → 겨드랑이 → 종 입 가장자리
  for (const s of [-1, 1]) {
    addRope(
      [
        [crown[0] + s * 0.06, crown[1] - 0.04, crown[2] + 0.02],
        [s * 0.15, 1.38, 0.02],
        [s * 0.18, 1.33, 0.2],
        [s * 0.1, 1.17, 0.27],
        [s * 0.19, 1.04, 0.13],
        [s * 0.22, 1.02, -0.12],
      ],
      0.016,
      4,
    );
  }
  return {
    preset: 'act2',
    cam: { pos: [0.5, 0.75, 5.2], target: [0.0, 0.9, 0.0], fov: 1.85 },
    light: {
      key: [-0.42, 0.62, -0.75],
      rim: 1.3,
      fillCol: [0.24, 0.13, 0.05],
      pt: toWorld([flame[0], flame[1] + 0.02, flame[2]]),
      ptCol: [1.5, 0.9, 0.36],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uB: chainPts,
      uL: [
        [...toWorld(flame), 0.025],
        [...toWorld([flame[0], flame[1] + 0.015, flame[2]]), 0.06],
      ],
      uLC: [
        [1.0, 0.72, 0.32, 1.3],
        [1.0, 0.58, 0.22, 0.22],
      ],
    },
    glsl: /* glsl */ `
const float YAW = ${YAW};
const vec3 BM = ${v3(M)};
const vec3 BA = ${v3(A)};
const float BH = ${H};
const vec3 CROWN = ${v3(crown)};
const vec3 FLAME = ${v3(flame)};
const vec3 HANDL = ${v3(handL)};
const vec3 HANDR = vec3(0.31, 1.44, 0.4);
const vec3 HEAD = vec3(0.0, 1.38, 0.42);
const float BOW = 0.85;

float bendZ(float y) { float h = max(y - 0.55, 0.0); return 0.42 * h * h; }

float sdHand(vec3 p, vec3 w, vec3 f, vec3 u, float s, vec4 c, float sp, float th, float tc) {
  float bd = length(p - w);
  if (bd > 0.3 * s) return bd - 0.2 * s;
  f = normalize(f);
  u = normalize(u - f * dot(u, f));
  vec3 sd = cross(f, u) * th;
  vec3 pc = w + f * 0.045 * s;
  vec3 q = p - pc;
  vec3 lq = vec3(dot(q, sd), dot(q, u), dot(q, f));
  float d = sdEllipsoid(lq, vec3(0.036, 0.012, 0.046) * s);
  d = smin(d, sdRoundCone(p, w - f * 0.07 * s, pc, 0.018 * s, 0.022 * s), 0.02 * s);
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    float cu = i == 0 ? c.x : i == 1 ? c.y : i == 2 ? c.z : c.w;
    vec3 a = pc + f * 0.04 * s - sd * fi * 0.017 * s + u * 0.002 * s;
    vec3 dd = normalize(f - sd * fi * sp);
    float len = (0.052 - abs(fi + 0.4) * 0.007) * s;
    float r = 0.0082 * s;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.8), 0.003 * s);
      d = min(d, sdSphere(p - a, r * 1.13));
      a = b;
      r *= 0.84;
      len *= 0.8;
      dd = normalize(dd - u * cu * 0.8);
    }
  }
  vec3 ta = pc - f * 0.02 * s + sd * 0.03 * s - u * 0.006 * s;
  vec3 tb = ta + normalize(f * 0.6 + sd * 0.7 - u * 0.3) * 0.038 * s;
  vec3 tc3 = tb + normalize(f * 0.9 - sd * tc * 0.6 - u * tc * 0.5) * 0.03 * s;
  d = smin(d, sdRoundCone(p, ta, tb, 0.0105 * s, 0.0085 * s), 0.008 * s);
  d = smin(d, sdRoundCone(p, tb, tc3, 0.0085 * s, 0.0065 * s), 0.004 * s);
  return d;
}

/** 종 옆모습: h(0 입 ~ 1 정수리) 에서의 반지름 (입 반지름 R) */
float bellR(float h, float R) {
  return R * (0.56 + 0.44 * pow(1.0 - h, 3.2) - 0.03 * sin(h * 3.1416));
}
/** q: 종 지역 좌표 (y = 입에서 정수리 방향) */
float sdBell(vec3 q, float H, float R) {
  float h = clamp(q.y / H, 0.0, 1.0);
  float d = (length(q.xz) - bellR(h, R)) * 0.85;
  float th = R * (0.05 + 0.09 * smoothstep(0.2, 0.03, q.y / H));
  float shell = abs(d + th * 0.5) - th;
  shell = max(shell, -q.y);
  float top = sdEllipsoid(q - vec3(0.0, H * 0.93, 0.0), vec3(0.56 * R, 0.3 * R, 0.56 * R));
  shell = min(max(shell, q.y - H * 0.93), top);
  shell = smin(shell, max(abs(d) - R * 0.025, abs(q.y - H * 0.8) - R * 0.03), R * 0.02);
  shell = smin(shell, max(abs(d) - R * 0.025, abs(q.y - H * 0.16) - R * 0.035), R * 0.02);
  return shell;
}
vec3 bigBellSpace(vec3 p) {
  vec3 q = p - BM;
  float a = atan(BA.z, BA.y);
  q.yz = rot(a) * q.yz;
  return q;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  vec3 b = p;
  b.z -= bendZ(b.y);

  // ── 해진 잿빛 수련복: 발목까지, 밑단은 갈가리 찢겼다
  float y = clamp((b.y - 0.1) / 1.2, 0.0, 1.0);
  float ang = atan(b.z, b.x);
  float rr = mix(0.29, 0.16, pow(y, 0.6));
  rr += 0.035 * (1.0 - y * 0.7) * (sin(ang * 7.0 + y * 3.0) * 0.6 + sin(ang * 17.0 + 1.0 + y * 2.0) * 0.35);
  float robe = (length(b.xz * vec2(1.0, 1.2)) - rr) * 0.7;
  float hem = 0.09 + 0.06 * fbm3(vec3(b.x * 10.0, 0.0, b.z * 10.0)) + 0.14 * pow(noise(vec3(ang * 8.0, 2.0, 0.0)), 2.5);
  robe = max(robe, max(hem - b.y, b.y - 1.3));
  float torso = sdEllipsoid(b - vec3(0.0, 1.18, 0.0), vec3(0.18, 0.2, 0.13));
  torso = smin(torso, sdEllipsoid(b - vec3(0.0, 1.22, -0.07), vec3(0.16, 0.16, 0.11)), 0.08);
  float body = smin(robe, torso, 0.1);
  // 두건: 깊고, 숙인 고개를 덮었다
  vec3 hq = p - HEAD;
  hq.yz = rot(BOW) * hq.yz;
  float outer = sdEllipsoid(hq - vec3(0.0, 0.0, -0.012), vec3(0.122, 0.145, 0.155));
  outer = smin(outer, sdRoundCone(hq, vec3(0.0, 0.04, -0.07), vec3(0.0, 0.05, -0.23), 0.085, 0.018), 0.06);
  outer = smin(outer, sdRoundCone(p, HEAD + vec3(0.0, -0.04, -0.08), vec3(0.0, 1.26, bendZ(1.26) + 0.02), 0.11, 0.15), 0.07);
  float opening = sdEllipsoid(hq - vec3(0.0, -0.045, 0.15), vec3(0.068, 0.1, 0.09));
  float inner = sdEllipsoid(hq - vec3(0.0, -0.01, 0.0), vec3(0.106, 0.128, 0.142));
  float hood = max(outer, -opening);
  hood = max(hood, -max(inner, hq.z - 0.18));
  body = smin(body, hood, 0.04);
  // 팔: 소매
  vec3 shL = vec3(-0.17, 1.27, bendZ(1.27));
  vec3 elL = vec3(-0.36, 1.1, 0.3);
  vec3 shR = vec3(0.17, 1.27, bendZ(1.27));
  vec3 elR = vec3(0.37, 1.18, 0.28);
  // 치켜든 팔: 넓은 소매가 팔꿈치까지 흘러내려 뭉쳤고, 뼈만 남은 팔뚝이 드러났다
  vec3 wrL = HANDL + vec3(-0.02, -0.08, -0.01);
  vec3 wrR = HANDR + vec3(0.0, -0.05, -0.02);
  float arms = sdRoundCone(p, shL, elL, 0.066, 0.06);
  arms = min(arms, sdRoundCone(p, shR, elR, 0.066, 0.06));
  // 팔꿈치에 뭉친 소맷자락 (아래로 처진다)
  for (int s = 0; s < 2; s++) {
    vec3 e = s == 0 ? elL : elR;
    vec3 w = s == 0 ? wrL : wrR;
    vec3 d = normalize(w - e);
    vec3 c = e + d * 0.06;
    float bunch = sdRoundCone(p, e - d * 0.02, c + d * 0.05, 0.075, 0.085);
    bunch = smin(bunch, sdRoundCone(p, c, c + vec3(0.0, -0.17, -0.02), 0.07, 0.03), 0.05);
    bunch += 0.01 * sin(dot(p - e, d) * 90.0 + 2.0 * noise(p * 30.0));
    bunch = max(bunch, -sdRoundCone(p, c + d * 0.06, c + d * 0.2, 0.05, 0.07));
    arms = smin(arms, bunch, 0.03);
  }
  body = smin(body, arms, 0.04);
  // 드러난 팔뚝 (살)
  float fore = sdRoundCone(p, elL + normalize(wrL - elL) * 0.08, wrL, 0.03, 0.022);
  fore = min(fore, sdRoundCone(p, elR + normalize(wrR - elR) * 0.08, wrR, 0.03, 0.022));
  fore = smin(fore, min(sdSphere(p - wrL, 0.025), sdSphere(p - wrR, 0.025)), 0.01);
  body += 0.004 * (fbm3(p * 24.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  fore += 0.002 * (fbm3(p * 60.0) - 0.5);
  r = umin(r, vec2(fore, 2.0));

  // ── 두건 속: 어둠 + 피가 흐르는 목
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, 0.015, -0.01), vec3(0.095, 0.115, 0.11)), 99.0));
  float neck = sdRoundCone(hq, vec3(0.0, -0.06, -0.01), vec3(0.0, -0.16, 0.02), 0.05, 0.055);
  r = umin(r, vec2(neck, 99.0));

  // ── 맨발
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -0.09 : 0.1;
    float fz = s == 0 ? 0.1 : 0.0;
    vec3 an = vec3(sx, 0.08, fz);
    float leg = sdRoundCone(p, an + vec3(0.0, 0.12, -0.02), an, 0.03, 0.024);
    float foot = sdRoundCone(p, an + vec3(0.0, -0.035, -0.02), an + vec3(0.0, -0.05, 0.13), 0.026, 0.022);
    for (int t = 0; t < 4; t++) {
      float tx = (float(t) - 1.5) * 0.017;
      foot = smin(foot, sdRoundCone(p, an + vec3(tx, -0.055, 0.12), an + vec3(tx * 1.2, -0.062, 0.165 - abs(tx) * 0.6), 0.009, 0.007), 0.01);
    }
    r = umin(r, vec2(smin(leg, foot, 0.03), 2.0));
  }

  // ── 손: 밧줄을 쥔 손 + 작은 종을 치켜든 손
  float hL = sdHand(p, HANDL + vec3(-0.02, -0.08, -0.01), vec3(0.15, 1.0, 0.05), vec3(-1.0, 0.15, -0.2), 1.2, vec4(0.25, 0.3, 0.4, 0.5), 0.12, 1.0, 0.3);
  float hR = sdHand(p, HANDR + vec3(0.0, -0.05, -0.02), vec3(-0.1, 0.4, 1.0), vec3(1.0, 0.2, 0.0), 1.15, vec4(1.45, 1.5, 1.55, 1.5), 0.04, -1.0, 1.2);
  r = umin(r, vec2(min(hL, hR), 2.0));
  vec3 hcrown = HANDR + vec3(0.03, -0.11, 0.07);
  float handle = sdCapsule(p, HANDR + vec3(0.0, 0.035, 0.045), hcrown, 0.011);
  r = umin(r, vec2(handle, 5.0));
  vec3 sq = p - hcrown;
  sq.xy = rot(0.55) * sq.xy;
  sq.y += 0.13;
  r = umin(r, vec2(sdBell(sq, 0.13, 0.085), 3.0));
  r = umin(r, vec2(sdSphere(sq - vec3(0.012, 0.0, 0.0), 0.016), 6.0));

  // ── 등에 진 큰 종 + 정수리의 촛불
  vec3 bq = bigBellSpace(p);
  float bell = sdBell(bq, BH, 0.3);
  bell = min(bell, sdTorus((bq - vec3(0.0, BH + 0.03, 0.0)).xzy, vec2(0.05, 0.016)));
  r = umin(r, vec2(bell, 3.0));
  float clap = sdCapsule(bq, vec3(0.0, BH * 0.8, 0.0), vec3(0.0, 0.03, 0.02), 0.014);
  clap = min(clap, sdSphere(bq - vec3(0.0, 0.0, 0.025), 0.045));
  r = umin(r, vec2(clap, 6.0));
  vec3 cq = p - CROWN;
  float wax = sdEllipsoid(cq - vec3(0.0, 0.03, 0.02), vec3(0.06, 0.035, 0.06));
  float candle = sdCappedCone(cq - vec3(0.0, 0.07, 0.04), 0.04, 0.026, 0.022);
  wax = smin(wax, candle, 0.02);
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.6 + 0.3;
    vec3 d0 = vec3(cos(a) * 0.045, 0.02, 0.02 + sin(a) * 0.045);
    wax = smin(wax, sdRoundCone(cq, d0, d0 + vec3(cos(a) * 0.03, -0.08 - 0.03 * float(i), sin(a) * 0.04 - 0.04), 0.012, 0.007), 0.015);
  }
  r = umin(r, vec2(wax, 7.0));
  r = umin(r, vec2(sdCapsule(cq, vec3(0.0, 0.11, 0.045), vec3(0.0, 0.127, 0.05), 0.0025), 8.0));

  // ── 어깨끈·밧줄
  r = umin(r, vec2(chains(p, 0.006), 4.0));
  return r;
}

float ashDust(vec3 p, vec3 n) {
  return smoothstep(0.3, 0.9, n.y + 0.35 * (fbm3(p * 9.0) - 0.5));
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = ashDust(lp, n);
  float streak = smoothstep(0.45, 0.8, noise(vec3(lp.x * 40.0, lp.y * 4.0, lp.z * 40.0)));
  float blood = streak * smoothstep(0.32, 0.12, length(lp.xz - vec2(0.0, bendZ(lp.y) + 0.1))) * smoothstep(0.9, 1.15, lp.y) * smoothstep(1.4, 1.25, lp.y);
  blood = max(blood, smoothstep(0.12, 0.03, length(lp - HANDL - vec3(0.03, 0.04, 0.0))) * smoothstep(0.35, 0.6, noise(lp * 45.0)));
  if (id < 1.5) {
    float dirt = fbm3(lp * 5.0);
    float weave = 0.8 + 0.2 * noise(lp * vec3(220.0, 60.0, 220.0));
    vec3 alb = vec3(0.062, 0.057, 0.05) * (0.55 + 0.8 * dirt) * weave;
    alb = mix(alb, vec3(0.11, 0.105, 0.1), ash * 0.6);
    alb = mix(alb, vec3(0.055, 0.005, 0.004), blood);
    return Mat(alb, mix(0.95, 0.3, blood), mix(0.05, 0.9, blood), vec3(0.0), 0.0, 0.0, blood * 0.8);
  }
  if (id < 2.5) {
    float blot = fbm3(lp * 16.0);
    vec3 alb = vec3(0.12, 0.105, 0.092) * (0.7 + 0.5 * blot);
    float nb = smoothstep(0.4, 0.75, noise(vec3(lp.x * 50.0, lp.y * 6.0, lp.z * 50.0))) * smoothstep(1.1, 1.3, lp.y);
    alb = mix(alb, vec3(0.06, 0.005, 0.004), max(blood, nb));
    alb = mix(alb, vec3(0.1, 0.1, 0.095), ash * 0.4 * smoothstep(0.3, 0.0, lp.y));
    return Mat(alb, 0.55, 0.35, vec3(0.0), 0.0, 0.5, 0.15 + max(blood, nb) * 0.7);
  }
  if (id < 3.5) {
    // 청동: 검게 산화했고, 튀어나온 곳은 금빛으로 닳았다. 위쪽엔 재.
    float pat = fbm3(lp * 14.0);
    float worn = smoothstep(0.55, 0.85, fbm3(lp * 6.0 + 2.0));
    vec3 alb = mix(vec3(0.035, 0.024, 0.014), vec3(0.2, 0.13, 0.05), worn);
    alb *= 0.7 + 0.5 * pat;
    alb = mix(alb, vec3(0.1, 0.095, 0.09), ash * 0.8);
    return Mat(alb, mix(0.4, 0.22, worn), mix(1.2, 2.0, worn) * (1.0 - ash * 0.7), vec3(0.0), 0.0, 0.0, 0.35 * (1.0 - ash));
  }
  if (id < 4.5) {
    float tw = 0.6 + 0.4 * sin(dot(lp, vec3(140.0, 210.0, 90.0)) + 6.0 * noise(lp * 40.0));
    vec3 alb = vec3(0.09, 0.075, 0.055) * tw * (0.7 + 0.5 * fbm3(lp * 8.0));
    alb = mix(alb, vec3(0.1, 0.098, 0.092), ash * 0.4);
    return Mat(alb, 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 5.5) return Mat(vec3(0.05, 0.03, 0.018), 0.6, 0.3, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 6.5) return Mat(vec3(0.025, 0.022, 0.02), 0.5, 0.7, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 7.5) {
    // 밀랍: 누렇고 반투명
    float fl = smoothstep(0.06, 0.0, length(lp - FLAME));
    vec3 alb = vec3(0.16, 0.13, 0.085) * (0.7 + 0.4 * fbm3(lp * 30.0));
    alb = mix(alb, vec3(0.06, 0.05, 0.04), smoothstep(0.03, -0.05, lp.y - CROWN.y) * 0.6);
    return Mat(alb, 0.4, 0.5, vec3(0.6, 0.3, 0.08) * fl, 0.0, 0.7, 0.3);
  }
  return Mat(vec3(0.01), 0.9, 0.0, vec3(0.0), 0.0, 0.0, 0.0);
}
`,
  };
}
