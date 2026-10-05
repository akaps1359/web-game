// 재에 묻힌 것 (2층 수호자) — 수백 년 동안 향로의 재가 납골당 바닥에 쌓였고, 그 아래에서 무언가가 자랐다.
// 교단은 그것을 파내지 않고 매일 새 재를 덮어 주었다.
// 잿더미에서 상체만 끌어올린 거대한 것: 재가 굳은 껍질 같은 살갗, 갈라진 틈마다 불씨. 등에서 창처럼 뚫고 나온 갈비뼈,
// 눈 없는 머리는 위를 향해 턱을 벌렸고, 한 팔은 재 위로 뻗어 바닥을 움켜쥔다. 어깨엔 교단이 세워 둔 초가 녹아내린다.

export default function ashBuried() {
  const mouth = [0.15, 2.28, 0.86];
  const candles = [
    [-0.95, 2.02, 0.2],
    [-0.75, 2.12, 0.0],
    [0.9, 2.06, 0.1],
  ];
  return {
    preset: 'act2',
    cam: { pos: [1.7, 0.3, 10.0], target: [0.0, 1.6, 0.3], fov: 1.6 },
    light: {
      key: [-0.45, 0.65, -0.6],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.14, 0.085, 0.045],
      amb: [0.022, 0.018, 0.016],
      rim: 1.35,
      pt: mouth,
      ptCol: [1.8, 0.55, 0.15],
      exposure: 1.2,
    },
    frame: { fill: 0.94, bottom: 0.03 },
    arrays: {
      uL: [
        ...candles.map((c) => [c[0], c[1] + 0.17, c[2], 0.03]),
        [mouth[0], mouth[1] - 0.05, mouth[2] - 0.08, 0.14],
        [0.0, 2.48, 0.85, 0.02],
        [0.24, 2.48, 0.83, 0.02],
      ],
      uLC: [
        ...candles.map(() => [1.0, 0.7, 0.3, 1.1]),
        [1.0, 0.4, 0.1, 0.35],
        [1.0, 0.45, 0.12, 0.7],
        [1.0, 0.45, 0.12, 0.7],
      ],
      uP: candles.map((c) => [c[0], c[1] + 0.17, c[2], 0]),
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 36
#define VOLUME_FAR 16.0
const vec3 HEADC = vec3(0.12, 2.42, 0.62);

vec3 ptLight(vec3 p, vec3 n, vec3 lp, vec3 col, float fall) {
  vec3 l = lp - p;
  float d = length(l);
  return col * max(dot(n, l / d), 0.0) / (1.0 + d * d * fall);
}

// 굳은 재 껍질의 갈라짐: 3D 보로노이 경계 (0에 가까울수록 금)
float vcrack(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d1 = 9.0;
  float d2 = 9.0;
  for (int k = 0; k < 27; k++) {
    vec3 g = vec3(float(k % 3), float((k / 3) % 3), float(k / 9)) - 1.0;
    vec3 o = vec3(hash31(i + g), hash31(i + g + 7.1), hash31(i + g + 3.3));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}

float claw(vec3 p, vec3 c, vec3 f, vec3 u, float len, float curl, float r) {
  float bd = length(p - c) - len * 1.7;
  if (bd > 0.1) return bd;
  f = normalize(f);
  vec3 s = normalize(cross(f, u));
  u = normalize(cross(s, f));
  float d = sdRoundCone(p, c - f * len * 0.25, c + f * len * 0.22, r * 2.0, r * 1.7);
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 k = c + f * len * 0.28 + s * o * r * 2.3;
    float L = len * (1.0 - abs(o) * 0.12);
    vec3 d1 = normalize(f * cos(curl * 0.6) - u * sin(curl * 0.6) + s * o * 0.16);
    vec3 m = k + d1 * L * 0.55;
    vec3 d2 = normalize(f * cos(curl * 1.5) - u * sin(curl * 1.5) + s * o * 0.12);
    vec3 e = m + d2 * L * 0.55;
    d = smin(d, min(sdRoundCone(p, k, m, r, r * 0.8), sdRoundCone(p, m, e, r * 0.8, r * 0.3)), r * 0.7);
  }
  vec3 tk = c - f * len * 0.05 - s * r * 3.6;
  vec3 tm = tk + normalize(f - s * 0.8 - u * 0.4) * len * 0.45;
  d = smin(d, sdRoundCone(p, tk, tm, r * 1.2, r * 0.4), r * 0.8);
  return d;
}
float limb(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1, float r2) {
  float d = sdRoundCone(p, a, b, r0, r1);
  d = smin(d, sdEllipsoid(p - mix(a, b, 0.4), vec3(r0 * 0.95, length(b - a) * 0.3, r0 * 0.95)), r0 * 0.5);
  d = smin(d, sdRoundCone(p, b, c, r1, r2), r1 * 0.4);
  d = smin(d, sdSphere(p - b, r1 * 1.05), r1 * 0.4);
  return d;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  // ── 잿더미 언덕: 바람결 같은 물결 ──
  float dune = sdEllipsoid(p - vec3(0.0, -0.25, 0.25), vec3(2.35, 0.9, 1.9));
  dune += 0.035 * sin(p.x * 5.0 + p.z * 2.5 + 2.5 * noise(p * 1.3)) + 0.16 * (fbm3(p * 2.0) - 0.5) + 0.03 * (noise(p * 9.0) - 0.5);
  r = vec2(dune, 7.0);

  float bb = length(p - vec3(0.0, 1.7, 0.3)) - 2.5;
  if (bb < 0.2) {
    // ── 상체: 재에서 끌어올린 몸, 앞으로 기울었다 ──
    vec3 cq = p - vec3(0.0, 1.3, -0.05);
    cq.yz = rot(-0.35) * cq.yz;
    float body = sdEllipsoid(cq - vec3(0.0, 0.15, 0.0), vec3(0.78, 0.82, 0.55));
    // 움푹 꺼진 배
    body = smax(body, -sdEllipsoid(cq - vec3(0.0, -0.55, 0.55), vec3(0.55, 0.4, 0.3)), 0.2);
    // 깊은 갈비 골
    float ribG = abs(fract(cq.y * 5.5 + 0.3) - 0.5);
    body -= 0.05 * smoothstep(0.18, 0.45, ribG) * smoothstep(0.15, 0.5, abs(cq.x)) * smoothstep(-0.5, 0.2, cq.y);
    // 앙상한 어깨뼈
    body = smin(body, sdEllipsoid(p - vec3(0.85, 1.9, 0.05), vec3(0.26, 0.2, 0.26)), 0.16);
    body = smin(body, sdEllipsoid(p - vec3(-0.85, 1.88, 0.03), vec3(0.26, 0.2, 0.26)), 0.16);
    body = smin(body, sdCapsule(p, vec3(-0.75, 1.98, 0.3), vec3(0.75, 2.0, 0.32), 0.06), 0.1);
    // 목: 위·앞으로 길게
    body = smin(body, sdRoundCone(p, vec3(0.05, 1.95, 0.25), HEADC + vec3(0.0, -0.12, -0.12), 0.32, 0.17), 0.14);
    // 등뼈 능선
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      vec3 sp = mix(vec3(0.0, 2.05, -0.2), vec3(0.0, 0.55, -0.72), t);
      body = smin(body, sdSphere(p - sp, 0.11 - t * 0.03), 0.1);
    }
    // 팔: 오른팔은 재 위로 뻗어 바닥을 움켜쥐고, 왼팔은 재에 반쯤 묻혔다
    float arms = limb(p, vec3(0.92, 1.88, 0.1), vec3(1.68, 1.25, 0.8), vec3(1.35, 0.62, 1.7), 0.2, 0.12, 0.085);
    arms = min(arms, limb(p, vec3(-0.92, 1.85, 0.08), vec3(-1.6, 0.9, 0.5), vec3(-1.2, 0.35, 1.45), 0.2, 0.12, 0.085));
    float hands = claw(p, vec3(1.3, 0.5, 1.85), vec3(-0.05, -0.55, 0.9), vec3(0.0, 1.0, 0.3), 0.55, 1.0, 0.04);
    hands = min(hands, claw(p, vec3(-1.12, 0.32, 1.62), vec3(0.15, -0.5, 0.9), vec3(0.0, 1.0, 0.0), 0.5, 1.1, 0.038));
    body = smin(body, smin(arms, hands, 0.06), 0.12);
    // 재 껍질: 비늘처럼 일어난 조각
    body += 0.012 * (fbm3(p * 7.0) - 0.5) + 0.006 * ridge(p * 13.0);
    // 재와 녹아 붙는다
    body = smin(body, dune + 0.05, 0.3);
    r = umin(r, vec2(body, 1.0));

    // ── 등을 뚫고 나온 창 같은 갈비뼈 ──
    float ribs = 1e5;
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      for (int sgn = 0; sgn < 2; sgn++) {
        float sx = sgn == 0 ? -1.0 : 1.0;
        float L = 1.25 - t * 0.5 + 0.2 * hash11(float(i) * 3.0 + sx);
        vec3 base = vec3(sx * (0.3 + 0.06 * t), 1.95 - t * 1.15, -0.3 - t * 0.32);
        vec3 tip = base + normalize(vec3(sx * (0.7 - t * 0.2), 1.0 - t * 0.35, -0.55)) * L;
        vec3 mid = mix(base, tip, 0.45) + vec3(sx * 0.1, 0.1, 0.05);
        float rb = min(sdRoundCone(p, base, mid, 0.075, 0.05), sdRoundCone(p, mid, tip, 0.05, 0.006));
        ribs = min(ribs, rb);
      }
    }
    r = umin(r, vec2(ribs, 4.0));

    // ── 머리: 눈 없는 길쭉한 두개골, 위를 향해 벌린 턱 ──
    vec3 hq = p - HEADC;
    hq.yz = rot(-0.5) * hq.yz;   // 얼굴이 위·앞을 향함
    hq.xy = rot(0.15) * hq.xy;
    float head = sdEllipsoid(hq - vec3(0.0, 0.05, -0.05), vec3(0.27, 0.3, 0.32));
    head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.12, 0.16), vec3(0.2, 0.18, 0.2)), 0.12);
    vec3 he = hq;
    he.x = abs(he.x);
    // 깊은 눈구멍 (불씨가 고였다)
    head = smax(head, -sdSphere(he - vec3(0.12, 0.06, 0.27), 0.075), 0.03);
    // 크게 벌린 입 (세로로 찢어짐)
    float mouthD = sdEllipsoid(hq - vec3(0.0, -0.2, 0.3), vec3(0.11, 0.22, 0.14));
    head = smax(head, -mouthD, 0.04);
    // 처진 아래턱
    vec3 jq = hq - vec3(0.0, -0.3, 0.05);
    jq.yz = rot(0.5) * jq.yz;
    float jaw = sdRoundCone(jq, vec3(0.0, 0.0, 0.0), vec3(0.0, -0.22, 0.22), 0.15, 0.08);
    jaw = smax(jaw, -sdEllipsoid(jq - vec3(0.0, -0.08, 0.17), vec3(0.08, 0.2, 0.1)), 0.03);
    head = smin(head, jaw, 0.06);
    head += 0.01 * (fbm3(p * 8.0) - 0.5) + 0.005 * ridge(p * 14.0);
    r = umin(r, vec2(head, 1.0));
    r = umin(r, vec2(mouthD + 0.03, 99.0));
    // 이빨
    float teeth = 1e5;
    for (int i = 0; i < 5; i++) {
      float a = (float(i) - 2.0) * 0.45;
      vec3 tb = vec3(sin(a) * 0.1, -0.02, 0.3 + cos(a) * 0.02 - 0.02);
      teeth = min(teeth, sdRoundCone(hq, tb, tb + vec3(0.0, -0.07, 0.02), 0.018, 0.003));
    }
    r = umin(r, vec2(teeth, 4.0));
  } else {
    r.x = min(r.x, bb);
  }

  // ── 어깨 위의 초 ──
  float cd = 1e5;
  for (int i = 0; i < 3; i++) {
    vec3 c = uP[i].xyz - vec3(0.0, 0.17, 0.0);
    float h = 0.09 + 0.04 * float(i);
    cd = min(cd, sdCylinder(p - c - vec3(0.0, h * 0.5 - 0.03, 0.0), h * 0.5, 0.035));
    cd = smin(cd, sdEllipsoid(p - c + vec3(0.0, 0.04, 0.0), vec3(0.09, 0.04, 0.09)), 0.04);
    cd = smin(cd, sdCapsule(p, c + vec3(0.04, -0.03, 0.04), c + vec3(0.06, -0.22, 0.08), 0.015), 0.02);
  }
  r = umin(r, vec2(cd, 6.0));
  r.x = max(r.x, -p.y);
  return r;
}

vec3 candleLight(vec3 p, vec3 n) {
  vec3 c = vec3(0.0);
  for (int i = 0; i < 3; i++) c += ptLight(p, n, uP[i].xyz, vec3(1.0, 0.62, 0.28), 10.0);
  return c;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 cl = candleLight(p, n);
  if (id < 1.5) {
    // 재가 굳은 잿빛 껍질, 갈라진 틈마다 불씨. 아래로 갈수록 재에 덮여 밝다
    float vc = vcrack(p * 4.5);
    float crk = smoothstep(0.06, 0.0, vc);
    float hot = smoothstep(0.035, 0.0, vc);
    float glow = hot * smoothstep(0.55, 0.78, noise(p * 2.0 + 2.0)) * smoothstep(0.3, 1.2, p.y);
    float flake = fbm3(p * 11.0);
    vec3 alb = vec3(0.07, 0.068, 0.066) * (0.6 + 0.6 * flake);
    alb = mix(alb, vec3(0.12, 0.118, 0.115), smoothstep(0.9, 0.2, p.y) * 0.6 + smoothstep(0.55, 0.9, n.y) * 0.35);
    // 눈구멍 속 불씨
    vec3 emi = vec3(2.2, 0.6, 0.11) * glow * (0.5 + 0.5 * noise(p * 12.0));
    // 눈구멍 속에 고인 불씨
    vec3 hq = p - HEADC;
    hq.yz = rot(-0.5) * hq.yz;
    hq.xy = rot(0.15) * hq.xy;
    vec3 he = vec3(abs(hq.x), hq.y, hq.z);
    float sock = smoothstep(0.09, 0.03, length(he - vec3(0.12, 0.06, 0.25)));
    emi += vec3(3.0, 0.9, 0.2) * sock;
    return Mat(alb * (1.0 - crk * 0.75), 0.92, 0.1, emi + alb * cl, 0.0, 0.1, 0.0);
  }
  if (id < 4.5) {
    // 뼈 (갈비 창·이빨): 그을린 끝
    float g = fbm3(p * 12.0);
    vec3 alb = vec3(0.19, 0.16, 0.12) * (0.55 + 0.6 * g);
    return Mat(alb, 0.55, 0.4, alb * cl, 0.0, 0.3, 0.05);
  }
  if (id < 6.5) return Mat(vec3(0.3, 0.26, 0.18), 0.45, 0.3, vec3(0.3, 0.26, 0.18) * cl * 1.5, 0.0, 0.85, 0.1);
  // 재 언덕: 밝은 잿빛, 고운 결
  float g = fbm3(p * 6.0);
  float rip = 0.5 + 0.5 * sin(p.x * 14.0 + p.z * 6.0 + 3.0 * noise(p * 2.0));
  vec3 alb = vec3(0.055, 0.053, 0.051) * (0.7 + 0.4 * g) * (0.9 + 0.15 * rip);
  return Mat(alb, 0.97, 0.02, alb * cl, 0.0, 0.0, 0.0);
}

// 떠도는 잿가루 안개 (언덕 위로 낮게)
vec4 volume(vec3 p) {
  float h = p.y;
  if (h < 0.0 || h > 1.6) return vec4(0.0);
  float rr = length(vec2(p.x / 2.3, (p.z - 0.3) / 1.9));
  if (rr > 1.0) return vec4(0.0);
  float w = fbm3(p * vec3(1.6, 2.5, 1.6) + vec3(uSeed, 0.0, 0.0));
  float dens = smoothstep(1.0, 0.6, rr) * smoothstep(1.6, 0.3, h) * pow(max(w - 0.35, 0.0), 1.5) * 1.6;
  return vec4(vec3(0.07, 0.065, 0.06), dens);
}
`,
  };
}
