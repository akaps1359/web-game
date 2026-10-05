// 촛불을 든 것 (2층 추적자) — 향 연기 자욱한 회랑 저편에서 작은 촛불이 흔들린다.
// 길 잃은 수도사인 줄 알고 다가간 자들은 돌아오지 않았다.
// 앞으로 길게 뻗은 마른 팔 끝의 작은 촛불이 유일한 빛. 그 빛이 앙상한 손가락을 비추고,
// 뒤쪽 연기 속엔 수도사의 두건 모양을 한 거대한 것이 웅크렸다: 얼굴이 있어야 할 자리가 세로로 갈라진 아가리, 바늘 같은 이빨.

export default function candleLure() {
  const flame = [0.8, 1.3, 1.95];
  return {
    preset: 'act2',
    cam: { pos: [2.4, 0.5, 8.6], target: [0.2, 1.6, 0.3], fov: 1.6 },
    light: {
      key: [-0.45, 0.6, -0.65],
      keyCol: [1.0, 0.95, 0.9],
      fillCol: [0.06, 0.04, 0.03],
      amb: [0.012, 0.01, 0.01],
      rim: 1.1,
      pt: flame,
      ptCol: [3.2, 1.9, 0.75],
      exposure: 1.25,
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: {
      uL: [
        [flame[0], flame[1], flame[2], 0.035],
        [flame[0], flame[1] - 0.02, flame[2], 0.12],
      ],
      uLC: [
        [1.0, 0.85, 0.5, 1.4],
        [1.0, 0.6, 0.25, 0.25],
      ],
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 44
#define VOLUME_FAR 18.0
const vec3 FLAME = vec3(${flame.join(', ')});
const vec3 HEADC = vec3(0.05, 2.42, 1.0);

vec3 bendP(vec3 p) {
  float h = max(p.y - 0.8, 0.0);
  p.z -= 0.16 * h * h;
  return p;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  vec3 b = bendP(p);
  // ── 연기 속의 거대한 수도복 몸 (아래로 갈수록 연기에 녹는다) ──
  float robe = sdRobe(b, 2.4, 0.55, 1.0, 8.0, 0.08);
  robe = max(robe, -(b.y - 0.35 - 0.6 * fbm3(vec3(b.x * 3.0, 0.0, b.z * 3.0))));
  robe = smin(robe, sdEllipsoid(b - vec3(0.0, 2.1, 0.0), vec3(0.75, 0.45, 0.6)), 0.25);
  robe += 0.01 * (fbm3(p * 9.0) - 0.5);
  r = vec2(robe, 1.0);
  // ── 두건: 거대하고 촛불 쪽으로 숙였다. 입구 속엔 얼굴 대신 세로로 갈라진 아가리 ──
  vec3 hq = p - HEADC;
  hq.yz = rot(0.45) * hq.yz;
  hq.xz = rot(-0.25) * hq.xz;
  float cowl = sdEllipsoid(hq, vec3(0.46, 0.56, 0.5));
  cowl = smin(cowl, sdRoundCone(hq, vec3(0.0, 0.2, -0.15), vec3(0.0, 0.6, -0.55), 0.34, 0.03), 0.2);
  float ca = atan(hq.x, hq.z);
  cowl += 0.02 * sin(ca * 6.0 + hq.y * 5.0) * smoothstep(0.1, -0.4, hq.y);
  float shell = abs(cowl) - 0.035;
  vec3 oq = hq - vec3(0.0, -0.12, 0.36);
  float opening = sdEllipsoid(oq, vec3(0.3, 0.44, 0.3));
  shell = max(shell, -opening);
  shell += 0.006 * (fbm3(p * 14.0) - 0.5);
  shell = smin(shell, sdRoundCone(p, vec3(0.0, 2.3, 0.45), HEADC + vec3(0.0, 0.1, -0.3), 0.4, 0.3), 0.15);
  r = umin(r, vec2(shell, 1.0));
  // 입구 속 어둠
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.05, -0.16), vec3(0.38, 0.46, 0.3)), 99.0));
  // 세로 아가리: 두 줄의 젖은 바늘 이빨이 서로 맞물린다
  vec3 mq = hq - vec3(0.0, -0.1, 0.2);
  float teeth = 1e5;
  for (int i = 0; i < 11; i++) {
    float t = (float(i) + 0.5) / 11.0;
    float y = mix(-0.4, 0.34, t);
    float span = sqrt(max(1.0 - pow((y + 0.03) / 0.4, 2.0), 0.0));
    float w = 0.15 * span + 0.02;
    float L = 0.06 + 0.1 * span;
    for (int sgn = 0; sgn < 2; sgn++) {
      float sx = sgn == 0 ? -1.0 : 1.0;
      float hj = hash11(float(i) * 7.3 + sx * 3.1);
      vec3 a0 = vec3(sx * w, y + 0.015 * sx + 0.02 * (hj - 0.5), -0.02 * span);
      float LL = L * (0.6 + 0.8 * hj);
      teeth = min(teeth, sdRoundCone(mq, a0, a0 + vec3(-sx * LL, -0.03 * (hj - 0.3), 0.02 * hj), 0.011 + 0.006 * hj, 0.0015));
    }
  }
  // 이빨이 박힌 잇몸 (붉은 살)
  float gums = 1e5;
  for (int sgn = 0; sgn < 2; sgn++) {
    float sx = sgn == 0 ? -1.0 : 1.0;
    vec3 g = mq - vec3(sx * 0.17, -0.03, -0.05);
    gums = min(gums, sdEllipsoid(g, vec3(0.05, 0.42, 0.07)));
  }
  r = umin(r, vec2(gums, 2.0));
  r = umin(r, vec2(teeth, 3.0));
  // ── 촛불을 든 팔: 지나치게 길고 마른 세 마디 ──
  vec3 sh = vec3(0.55, 2.05, 0.65);
  vec3 el = vec3(1.3, 1.8, 1.25);
  vec3 wr = vec3(0.92, 1.26, 1.85);
  float arm = sdRoundCone(p, sh, el, 0.06, 0.04);
  arm = smin(arm, sdSphere(p - el, 0.048), 0.025);
  arm = smin(arm, sdRoundCone(p, el, wr, 0.04, 0.028), 0.02);
  // 손: 초를 감싼 긴 손가락
  vec3 c = FLAME - vec3(0.0, 0.17, 0.0);
  for (int i = 0; i < 4; i++) {
    float a = float(i) * 1.1 + 0.6;
    vec3 k = wr + vec3(0.0, -0.03, 0.03);
    vec3 m = c + vec3(cos(a) * 0.09, 0.0, sin(a) * 0.07) + vec3(0.0, 0.03, 0.0);
    vec3 e = c + vec3(cos(a + 0.6) * 0.05, -0.04, sin(a + 0.6) * 0.045);
    arm = smin(arm, min(sdRoundCone(p, k, m, 0.014, 0.011), sdRoundCone(p, m, e, 0.011, 0.006)), 0.012);
  }
  arm += 0.003 * ridge(p * vec3(14.0, 40.0, 14.0));
  r = umin(r, vec2(arm, 2.0));
  // 소매 (어깨에서 늘어진 넝마)
  float sleeve = sdRoundCone(p, sh + vec3(0.0, 0.05, -0.05), sh + vec3(0.35, -0.35, 0.2), 0.2, 0.17);
  sleeve = max(sleeve, -sdSphere(p - (sh + vec3(0.42, -0.4, 0.24)), 0.17));
  r = umin(r, vec2(sleeve, 1.0));
  // ── 작은 초 ──
  float cand = sdCylinder(p - c - vec3(0.0, 0.07, 0.0), 0.075, 0.03);
  cand = smin(cand, sdEllipsoid(p - c - vec3(0.02, 0.0, 0.0), vec3(0.04, 0.06, 0.035)), 0.02);
  r = umin(r, vec2(cand, 4.0));
  r = umin(r, vec2(sdEllipsoid(p - FLAME - vec3(0.0, 0.0, 0.0), vec3(0.012, 0.03, 0.012)), 5.0));
  r.x = max(r.x, -p.y);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 그을린 검은 천 (연기와 재)
    float g = fbm3(p * 4.0);
    vec3 alb = vec3(0.03, 0.028, 0.027) * (0.6 + 0.7 * g);
    return Mat(alb, 0.9, 0.08, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 창백한 살 (손가락·입술): 촛불이 비치면 붉게 비친다
    float gum = smoothstep(1.9, 2.2, p.y);
    vec3 alb = mix(vec3(0.075, 0.068, 0.064) * (0.7 + 0.5 * fbm3(p * 18.0)), vec3(0.08, 0.012, 0.016) * (0.7 + 0.5 * fbm3(p * 25.0)), gum);
    return Mat(alb, mix(0.55, 0.3, gum), mix(0.35, 1.2, gum), vec3(0.0), 0.0, 0.7, mix(0.15, 0.9, gum));
  }
  if (id < 3.5) return Mat(vec3(0.25, 0.23, 0.19), 0.25, 1.4, vec3(0.0), 0.0, 0.3, 0.8);
  if (id < 4.5) return Mat(vec3(0.3, 0.27, 0.2), 0.4, 0.3, vec3(0.5, 0.3, 0.1) * smoothstep(1.05, 1.12, p.y), 0.0, 0.9, 0.1);
  return Mat(vec3(0.0), 1.0, 0.0, vec3(4.0, 2.8, 1.2), 0.0, 0.0, 0.0);
}

// 향 연기: 몸을 감싸고 아래로 짙어진다. 촛불 가까이는 따뜻하게 비친다
vec4 volume(vec3 p) {
  vec3 q = p - vec3(0.0, 1.2, 0.1);
  float e = length(q / vec3(1.6, 1.6, 1.3));
  if (e > 1.0 || p.y < 0.0) return vec4(0.0);
  float w = fbm3(p * vec3(1.8, 1.2, 1.8) + vec3(0.0, -uSeed * 0.3, 0.0));
  float w2 = fbm3(p * 4.5 + 3.0);
  float dens = smoothstep(1.0, 0.6, e) * pow(max(w * 1.3 - 0.42 + 0.3 * w2, 0.0), 1.8) * 4.0 * smoothstep(2.4, 0.4, p.y);
  float lit = 1.0 / (1.0 + dot(p - FLAME, p - FLAME) * 9.0);
  vec3 col = vec3(0.055, 0.05, 0.048) + vec3(1.0, 0.6, 0.25) * lit * 0.5;
  return vec4(col, dens);
}
`,
  };
}
