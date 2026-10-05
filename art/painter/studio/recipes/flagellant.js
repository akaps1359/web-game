// 대고행자 (2층 정예) — 백 년 동안 하루도 빠짐없이 자신을 채찍질했다. 이제 그의 피는 가시처럼 단단하다.
// 얼굴까지 덮은 높은 고깔 두건(눈구멍 둘), 앙상하게 드러난 상체에 채찍 자국. 상처마다 굳은 피가 붉은 수정 가시로 돋아
// 어깨와 등을 뒤덮었다. 한 손은 갈고리 달린 아홉 갈래 채찍을 어깨 너머로 치켜들었고, 허리엔 피에 전 삼베.

export default function flagellant() {
  const hand = [0.42, 2.12, -0.08];
  return {
    preset: 'act2',
    cam: { pos: [4.5, 0.3, 4.6], target: [0.0, 1.2, 0.0], fov: 1.5 },
    light: {
      key: [-0.4, 0.65, -0.65],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.22, 0.11, 0.04],
      amb: [0.022, 0.017, 0.016],
      rim: 1.35,
      pt: [0.9, 1.2, 1.2],
      ptCol: [0.7, 0.3, 0.1],
      exposure: 1.2,
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: {

    },
    glsl: /* glsl */ `
const vec3 HANDR = vec3(${hand.join(', ')});
const vec3 HEADC = vec3(0.0, 1.72, 0.12);

float hand(vec3 p, vec3 c, vec3 f, vec3 u, float curl) {
  float bd = length(p - c) - 0.25;
  if (bd > 0.1) return bd;
  f = normalize(f);
  vec3 s = normalize(cross(f, u));
  u = normalize(cross(s, f));
  float d = sdEllipsoid(p - c, vec3(0.045, 0.055, 0.025));
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 k = c + f * 0.045 + s * o * 0.022;
    float L = 0.09 - abs(o) * 0.012;
    vec3 m = k + normalize(f - u * curl * 0.6) * L * 0.55;
    vec3 e = m + normalize(f - u * curl * 1.6) * L * 0.5;
    d = smin(d, min(sdRoundCone(p, k, m, 0.011, 0.009), sdRoundCone(p, m, e, 0.009, 0.006)), 0.01);
  }
  return d;
}
float limb(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1, float r2) {
  float d = sdRoundCone(p, a, b, r0, r1);
  d = smin(d, sdEllipsoid(p - mix(a, b, 0.4), vec3(r0 * 0.75, length(b - a) * 0.3, r0 * 0.75)), r0 * 0.5);
  d = smin(d, sdRoundCone(p, b, c, r1, r2), r1 * 0.4);
  d = smin(d, sdSphere(p - b, r1 * 1.05), r1 * 0.4);
  return d;
}

// 피 가시: 등과 어깨의 상처에서 위·뒤로 솟은 검붉은 수정 (등 위의 가시 망토)
float thorns(vec3 p) {
  float bd = length(p - vec3(0.0, 1.55, -0.2)) - 0.95;
  if (bd > 0.2) return bd;
  float d = 1e5;
  for (int i = 0; i < 46; i++) {
    float fi = float(i);
    float u = hash11(fi * 1.7 + 0.3);
    float v = hash11(fi * 3.1 + 1.1);
    float a = mix(-3.0, -0.15, u);            // 몸통 둘레 (0 = 오른쪽, -π/2 = 뒤, -π = 왼쪽)
    float y = mix(1.15, 1.62, sqrt(v));
    vec3 base = vec3(cos(a) * 0.22, y, sin(a) * 0.15 - 0.03);
    vec3 dir = normalize(vec3(cos(a) * 0.7, 1.0 + 0.4 * hash11(fi * 5.3), sin(a) * 0.9 - 0.35) + 0.6 * (vec3(hash11(fi * 7.1), hash11(fi * 9.7), hash11(fi * 2.3)) - 0.5));
    float L = (0.16 + 0.55 * pow(hash11(fi * 4.4), 1.2)) * smoothstep(1.05, 1.45, y);
    d = min(d, sdRoundCone(p, base, base + dir * L, 0.018 + L * 0.07, 0.002));
  }
  return d;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  // ── 몸: 앙상하고 약간 앞으로 숙인 상체 ──
  vec3 b = p;
  float h = max(b.y - 1.0, 0.0);
  b.z -= 0.32 * h * h;
  float torso = sdEllipsoid(b - vec3(0.0, 1.32, -0.02), vec3(0.24, 0.32, 0.16));
  torso = smin(torso, sdEllipsoid(b - vec3(0.0, 1.05, -0.02), vec3(0.19, 0.18, 0.14)), 0.1);
  // 갈비: 옆구리에만 얕게, 배는 움푹
  float ribG = abs(fract(b.y * 11.0 + 0.3) - 0.5);
  torso -= 0.006 * smoothstep(0.3, 0.45, ribG) * smoothstep(0.15, 0.23, abs(b.x)) * smoothstep(1.15, 1.3, b.y) * smoothstep(1.5, 1.4, b.y);
  torso = smax(torso, -sdEllipsoid(b - vec3(0.0, 1.08, 0.17), vec3(0.14, 0.1, 0.06)), 0.05);
  // 날개뼈
  torso = smin(torso, sdEllipsoid(b - vec3(0.12, 1.42, -0.15), vec3(0.08, 0.1, 0.03)), 0.05);
  torso = smin(torso, sdEllipsoid(b - vec3(-0.12, 1.42, -0.15), vec3(0.08, 0.1, 0.03)), 0.05);
  // 어깨·쇄골
  torso = smin(torso, sdEllipsoid(b - vec3(0.25, 1.55, -0.02), vec3(0.1, 0.08, 0.09)), 0.07);
  torso = smin(torso, sdEllipsoid(b - vec3(-0.25, 1.53, -0.02), vec3(0.1, 0.08, 0.09)), 0.07);
  torso = smin(torso, sdRoundCone(b, vec3(0.0, 1.55, 0.0), vec3(0.0, 1.66, 0.06), 0.07, 0.06), 0.05);
  float lashT = abs(fract((b.x * 0.7 + b.y) * 9.0 + 0.3 * noise(b * 8.0)) - 0.5);
  torso += 0.007 * smoothstep(0.08, 0.0, lashT) * smoothstep(0.0, -0.08, b.z) * step(0.95, b.y);
  // 팔: 오른팔은 채찍을 어깨 너머로 치켜들고, 왼팔은 늘어뜨려 주먹을 쥐었다
  float arms = limb(p, vec3(0.26, 1.54, 0.08), vec3(0.44, 1.8, 0.2), HANDR + vec3(0.0, -0.05, 0.02), 0.045, 0.034, 0.026);
  arms = min(arms, limb(p, vec3(-0.26, 1.52, 0.08), vec3(-0.34, 1.18, 0.14), vec3(-0.3, 0.88, 0.2), 0.045, 0.034, 0.026));
  float hands = hand(p, HANDR, vec3(0.0, 0.3, -1.0), vec3(1.0, 0.0, 0.0), 1.8);
  hands = min(hands, hand(p, vec3(-0.3, 0.81, 0.21), vec3(0.0, -1.0, 0.2), vec3(-1.0, 0.0, 0.0), 1.9));
  float body = smin(torso, smin(arms, hands, 0.03), 0.05);
  // 다리: 앙상한 정강이, 맨발
  float legs = limb(p, vec3(-0.1, 0.92, 0.0), vec3(-0.13, 0.5, 0.06), vec3(-0.14, 0.08, 0.0), 0.075, 0.05, 0.04);
  legs = min(legs, limb(p, vec3(0.1, 0.92, 0.0), vec3(0.14, 0.48, 0.1), vec3(0.17, 0.08, 0.02), 0.075, 0.05, 0.04));
  legs = min(legs, sdRoundCone(p, vec3(-0.14, 0.05, 0.0), vec3(-0.15, 0.03, 0.16), 0.035, 0.03));
  legs = min(legs, sdRoundCone(p, vec3(0.17, 0.05, 0.02), vec3(0.2, 0.03, 0.18), 0.035, 0.03));
  body = min(body, legs + 0.0);
  body += 0.003 * (fbm3(p * 22.0) - 0.5);
  r = vec2(body, 1.0);

  // ── 피 가시 ──
  r = umin(r, vec2(thorns(b), 2.0));

  // ── 고깔 두건: 높은 원뿔, 얼굴 앞으로 늘어진 천에 눈구멍 둘 ──
  vec3 hq = b - HEADC;
  hq.yz = rot(0.12) * hq.yz;
  float yy = clamp((hq.y + 0.25) / 0.95, 0.0, 1.0);
  float cr = mix(0.2, 0.012, pow(yy, 0.8));
  float ang = atan(hq.x, hq.z);
  cr += 0.012 * (1.0 - yy) * sin(ang * 7.0 + hq.y * 5.0);
  float cone = (length(hq.xz) - cr) * 0.9;
  cone = max(cone, max(-hq.y - 0.25, hq.y - 0.7));
  // 가슴까지 늘어진 앞자락
  float flap = sdRoundBox(hq - vec3(0.0, -0.3, 0.14), vec3(0.16, 0.16, 0.025), 0.02);
  flap = max(flap, -(hq.y + 0.42 + 0.05 * fbm3(hq * 12.0)));
  cone = smin(cone, flap, 0.06);
  // 눈구멍
  vec3 eq = hq - vec3(0.0, -0.02, 0.17);
  eq.x = abs(eq.x) - 0.05;
  cone = max(cone, -sdEllipsoid(eq, vec3(0.018, 0.009, 0.035)));
  cone += 0.004 * (fbm3(p * 25.0) - 0.5);
  r = umin(r, vec2(cone, 3.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.06, 0.02), vec3(0.1, 0.12, 0.1)), 99.0));

  // ── 허리의 피 젖은 삼베 ──
  float cloth = sdRobe(p - vec3(0.0, 0.0, 0.02), 1.02, 0.2, 0.46, 9.0, 0.04);
  cloth = max(cloth, -(p.y - 0.01 - 0.1 * fbm3(vec3(p.x * 9.0, 0.0, p.z * 9.0))));
  // 허리에 감은 매듭 밧줄과 늘어진 끝
  cloth = min(cloth, sdCapsule(p, vec3(0.12, 0.93, 0.16), vec3(0.16, 0.45, 0.24), 0.018));
  cloth = min(cloth, sdTorus(p - vec3(0.0, 0.95, -0.01), vec2(0.2, 0.025)));
  r = umin(r, vec2(cloth, 4.0));

  // ── 채찍: 손잡이 + 아홉 갈래 끈 (등 뒤로 늘어짐), 끝마다 갈고리 ──
  vec3 top = HANDR + vec3(0.0, 0.12, -0.05);
  float whip = sdCapsule(p, HANDR + vec3(0.0, -0.06, 0.03), top, 0.022);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float sp = (fi - 3.0);
    float hh = hash11(fi * 3.7);
    vec3 c0 = top;
    vec3 c1 = top + vec3(0.02 + sp * 0.015, 0.1 + 0.03 * hh, -0.16 - 0.02 * sp);
    vec3 c2 = top + vec3(0.06 + sp * 0.035, -0.12 - 0.08 * hh, -0.34 - 0.02 * sp);
    vec3 c3 = top + vec3(0.08 + sp * 0.05, -0.55 - 0.18 * hh, -0.4 + 0.05 * sin(fi * 2.0));
    vec3 c4 = c3 + vec3(0.02 * sp, -0.3 - 0.12 * hh, 0.06 + 0.05 * cos(fi * 3.0));
    float s1 = min(min(sdCapsule(p, c0, c1, 0.008), sdCapsule(p, c1, c2, 0.0075)), min(sdCapsule(p, c2, c3, 0.007), sdCapsule(p, c3, c4, 0.0065)));
    c3 = c4;
    // 끝의 갈고리 가시
    s1 = min(s1, sdRoundCone(p, c3, c3 + vec3(0.03, -0.06, 0.04), 0.016, 0.002));
    whip = min(whip, s1);
  }
  r = umin(r, vec2(whip, 5.0));
  r.x = max(r.x, -p.y);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 창백한 살갗, 채찍 자국과 피딱지, 흘러내린 피
    vec3 b = p;
    float h = max(b.y - 1.0, 0.0);
    b.z -= 0.32 * h * h;
    float lash = abs(fract((b.x * 0.7 + b.y) * 9.0 + 0.3 * noise(b * 8.0)) - 0.5);
    float wound = smoothstep(0.1, 0.0, lash) * smoothstep(0.05, -0.1, b.z) * step(0.95, b.y);
    float drip = smoothstep(0.55, 0.75, noise(vec3(p.x * 16.0, p.y * 1.5, p.z * 16.0))) * smoothstep(1.65, 0.95, p.y);
    float blood = max(wound, drip * 0.8);
    vec3 alb = vec3(0.095, 0.09, 0.088) * (0.7 + 0.5 * fbm3(p * 14.0));
    alb = mix(alb, vec3(0.1, 0.008, 0.006), blood);
    return Mat(alb, mix(0.55, 0.2, blood), mix(0.3, 1.2, blood), vec3(0.0), 0.0, 0.6, blood * 0.8);
  }
  if (id < 2.5) {
    // 굳은 피의 수정: 검붉고 반투명, 끝이 희미하게 붉게 빛난다
    float g = noise(p * 30.0);
    return Mat(vec3(0.05, 0.003, 0.003), 0.08, 2.4, vec3(0.09, 0.004, 0.003) * (0.3 + 0.7 * g), 0.1, 0.4, 1.0);
  }
  if (id < 3.5) {
    // 거친 삼베 고깔: 피가 번졌다
    float weave = 0.8 + 0.2 * noise(p * 120.0);
    float blood = smoothstep(0.6, 0.8, fbm3(p * 5.0 + 1.0)) * smoothstep(1.9, 1.4, p.y);
    vec3 alb = vec3(0.07, 0.06, 0.05) * weave * (0.7 + 0.5 * fbm3(p * 6.0));
    alb = mix(alb, vec3(0.06, 0.006, 0.004), blood * 0.8);
    return Mat(alb, 0.92, 0.08, vec3(0.0), 0.0, 0.0, blood * 0.3);
  }
  if (id < 4.5) {
    float weave = 0.8 + 0.2 * noise(p * 120.0);
    float blood = smoothstep(0.4, 0.7, fbm3(p * 4.0 + 3.0));
    vec3 alb = mix(vec3(0.06, 0.05, 0.04), vec3(0.07, 0.005, 0.004), blood) * weave;
    return Mat(alb, 0.85, 0.15, vec3(0.0), 0.0, 0.0, blood * 0.5);
  }
  // 채찍: 검게 전 가죽
  return Mat(vec3(0.03, 0.012, 0.01), 0.5, 0.6, vec3(0.0), 0.0, 0.0, 0.5);
}
`,
  };
}
