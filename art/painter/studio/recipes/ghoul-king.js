// 구울 왕 (2층 수호자) — 납골당 깊은 곳, 뼈로 쌓은 왕좌에 앉은 것. 수도원의 모든 죽음은 결국 그의 식탁에 오른다.
// 해골을 쌓아 올린 왕좌와 부채꼴로 솟은 긴 뼈 등받이. 그 위에 웅크린 거대한 구울: 고무 같은 잿빛 살갗, 개처럼 긴 주둥이,
// 손가락뼈로 엮은 관, 작고 붉은 눈. 무릎에 팔꿈치를 걸치고 다리뼈 하나를 갉아먹고 있다. 왕좌 팔걸이엔 녹아내린 초.

export default function ghoulKing() {
  const head = [0.0, 2.22, 0.98];
  const candles = [
    [-0.78, 1.22, 0.18],
    [-1.05, 0.95, 0.45],
    [0.88, 1.12, 0.22],
  ];
  return {
    preset: 'act2',
    cam: { pos: [2.4, 0.3, 8.6], target: [0.0, 1.6, 0.2], fov: 1.55 },
    light: {
      key: [-0.45, 0.65, -0.6],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.28, 0.14, 0.05],
      amb: [0.02, 0.017, 0.015],
      rim: 1.35,
      pt: [0.0, 1.5, 1.9],
      ptCol: [0.9, 0.42, 0.14],
      exposure: 1.2,
      eyeEmit: 2.4,
      glow: 0.12,
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: {
      uE: [
        [head[0] - 0.095, head[1] + 0.07, head[2] + 0.19, 0.034],
        [head[0] + 0.125, head[1] + 0.07, head[2] + 0.15, 0.034],
      ],
      uG: [
        [0.25, -0.2, 1, 3],
        [0.25, -0.2, 1, 3],
      ],
      uL: candles.map((c) => [c[0], c[1] + 0.16, c[2], 0.028]),
      uLC: candles.map(() => [1.0, 0.7, 0.3, 1.1]),
      uP: candles.map((c) => [c[0], c[1] + 0.16, c[2], 0]),
    },
    glsl: /* glsl */ `
const vec3 HEADC = vec3(${head.join(', ')});

vec3 ptLight(vec3 p, vec3 n, vec3 lp, vec3 col, float fall) {
  vec3 l = lp - p;
  float d = length(l);
  return col * max(dot(n, l / d), 0.0) / (1.0 + d * d * fall);
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
    vec3 k = c + f * len * 0.28 + s * o * r * 2.1;
    float L = len * (1.0 - abs(o) * 0.12);
    vec3 d1 = normalize(f * cos(curl * 0.6) - u * sin(curl * 0.6) + s * o * 0.1);
    vec3 m = k + d1 * L * 0.55;
    vec3 d2 = normalize(f * cos(curl * 1.5) - u * sin(curl * 1.5) + s * o * 0.08);
    vec3 e = m + d2 * L * 0.5;
    // 손톱: 끝으로 길게 뻗은 검은 갈고리
    vec3 tip = e + d2 * L * 0.28;
    d = smin(d, min(min(sdRoundCone(p, k, m, r, r * 0.8), sdRoundCone(p, m, e, r * 0.8, r * 0.5)), sdRoundCone(p, e, tip, r * 0.45, r * 0.08)), r * 0.7);
  }
  vec3 tk = c - f * len * 0.05 - s * r * 3.4;
  vec3 tm = tk + normalize(f - s * 0.8 - u * 0.4) * len * 0.4;
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

// 해골 하나 (q는 해골 중심, 앞 = +z)
float skull(vec3 q, float s) {
  float d = sdEllipsoid(q, vec3(0.1, 0.1, 0.115) * s);
  d = smin(d, sdEllipsoid(q - vec3(0.0, -0.06, 0.05) * s, vec3(0.065, 0.05, 0.06) * s), 0.03 * s);
  vec3 e = q;
  e.x = abs(e.x);
  d = smax(d, -sdSphere(e - vec3(0.038, 0.0, 0.1) * s, 0.03 * s), 0.01 * s);
  d = smax(d, -sdSphere(q - vec3(0.0, -0.045, 0.11) * s, 0.014 * s), 0.008 * s);
  return d;
}

// 넓적다리뼈 하나: 양 끝에 둥근 뼈머리 둘
float femur(vec3 p, vec3 a, vec3 b, float r) {
  float d = sdRoundCone(p, a, b, r, r * 0.85);
  vec3 ab = normalize(b - a);
  vec3 sd = normalize(cross(ab, vec3(0.3, 1.0, 0.2)));
  d = smin(d, sdSphere(p - (b + sd * r * 0.9), r * 1.5), r * 0.8);
  d = smin(d, sdSphere(p - (b - sd * r * 0.9), r * 1.35), r * 0.8);
  d = smin(d, sdSphere(p - (a + sd * r * 0.7), r * 1.4), r * 0.8);
  return d;
}

// 왕좌: 해골과 뼈를 쌓아 올린 무더기 + 사방으로 삐죽 솟은 넓적다리뼈
vec2 throne(vec3 p) {
  float bd = length(p - vec3(0.0, 0.8, -0.2)) - 2.6;
  if (bd > 0.2) return vec2(bd, 1.0);
  vec3 mq = p - vec3(0.0, -0.05, -0.15);
  float mound = sdEllipsoid(mq, vec3(1.5, 1.08, 1.2));
  mound += 0.22 * (fbm3(p * 1.8) - 0.5);
  // 두 겹의 엇갈린 격자에 해골 (크기·방향 제각각)
  float sk = 1e5;
  for (int k = 0; k < 2; k++) {
    vec3 off = vec3(float(k) * 0.15, float(k) * 0.11, float(k) * 0.13);
    vec3 g = p + off;
    vec3 cell = floor(g / 0.3);
    vec3 jit = vec3(hash31(cell + float(k) * 11.0), hash31(cell + 3.1), hash31(cell + 7.7)) - 0.5;
    vec3 c = (cell + 0.5) * 0.3 + jit * 0.025 - off;
    vec3 sq = p - c;
    sq.xz = rot((hash31(cell + 1.3) - 0.5) * 2.4) * sq.xz;
    sq.yz = rot((hash31(cell + 5.3) - 0.5) * 1.0) * sq.yz;
    // 해골 중심이 무더기 겉면 가까이에 있을 때만 놓는다 (잘리지 않게)
    float mc = sdEllipsoid(c - vec3(0.0, -0.05, -0.15), vec3(1.5, 1.08, 1.2)) + 0.22 * (fbm3(c * 1.8) - 0.5);
    float on = step(0.08, hash31(cell + 17.0 + float(k))) * step(abs(mc - 0.02), 0.17);
    sk = min(sk, skull(sq, 0.8 + 0.18 * hash31(cell + 9.0)) + (1.0 - on) * 0.3);
  }
  float fill = mound + 0.05;
  float d = sk;
  // 삐죽 솟은 넓적다리뼈들
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 0.78 + 0.4;
    vec3 dir = normalize(vec3(cos(a) * 1.1, 0.9 + 0.5 * hash11(fi * 3.1), sin(a) * 0.8 - 0.55));
    vec3 a0 = vec3(cos(a) * 0.7, 0.45, sin(a) * 0.55 - 0.3);
    float L = 0.9 + 0.7 * hash11(fi * 7.3);
    d = min(d, femur(p, a0, a0 + dir * L, 0.045));
  }
  // 무더기 위의 큰 해골 몇
  d = min(d, skull(p - vec3(-0.75, 1.05, 0.15), 1.7));
  d = min(d, skull(p - vec3(0.85, 0.95, 0.2), 1.6));
  d = min(d, skull(p - vec3(0.15, 0.55, 1.0), 1.5));
  return umin(vec2(d, 1.0), vec2(fill, 7.0));
}

vec2 sdf(vec3 p) {
  vec2 r = throne(p);

  // ── 구울 왕: 앞으로 웅크린 몸 ──
  float bb = length(p - vec3(0.0, 1.8, 0.4)) - 1.6;
  if (bb > 0.2) {
    r.x = min(r.x, bb);
  } else {
    // 쭈그려 앉은 몸: 엉덩이는 무더기 위, 어깨는 무릎보다 높이, 등은 활처럼 굽었다
    float body = sdEllipsoid(p - vec3(0.0, 1.38, -0.25), vec3(0.4, 0.28, 0.32));
    body = smin(body, sdEllipsoid(p - vec3(0.0, 1.78, -0.12), vec3(0.4, 0.34, 0.32)), 0.2);
    vec3 cq = p - vec3(0.0, 2.2, 0.12);
    cq.yz = rot(-0.75) * cq.yz;
    float chest = sdEllipsoid(cq, vec3(0.52, 0.36, 0.33));
    float ribG = abs(fract(cq.y * 9.0 + 0.2) - 0.5);
    chest -= 0.016 * smoothstep(0.2, 0.45, ribG) * smoothstep(0.12, 0.35, abs(cq.x));
    body = smin(body, chest, 0.18);
    for (int i = 0; i < 7; i++) {
      float t = float(i) / 6.0;
      vec3 sp = mix(vec3(0.0, 1.6, -0.5), vec3(0.0, 2.55, 0.0), t) + vec3(0.0, 0.12 * sin(t * 3.14), -0.12 * sin(t * 3.14));
      body = smin(body, sdSphere(p - sp, 0.065), 0.06);
    }
    body = smin(body, sdEllipsoid(p - vec3(0.5, 2.38, 0.18), vec3(0.2, 0.17, 0.19)), 0.12);
    body = smin(body, sdEllipsoid(p - vec3(-0.5, 2.38, 0.18), vec3(0.2, 0.17, 0.19)), 0.12);
    body = smin(body, sdRoundCone(p, vec3(0.0, 2.4, 0.25), HEADC + vec3(0.0, 0.05, -0.2), 0.16, 0.11), 0.08);
    // 다리: 무릎을 어깨 가까이 세우고 발로 무더기를 움켜쥔다
    float legs = limb(p, vec3(0.3, 1.3, -0.15), vec3(0.62, 1.95, 0.42), vec3(0.5, 1.12, 0.55), 0.19, 0.11, 0.075);
    legs = min(legs, limb(p, vec3(-0.3, 1.3, -0.15), vec3(-0.6, 1.92, 0.45), vec3(-0.48, 1.1, 0.58), 0.19, 0.11, 0.075));
    legs = min(legs, claw(p, vec3(0.52, 1.02, 0.7), vec3(0.1, -0.6, 0.8), vec3(0.0, 1.0, 0.0), 0.22, 1.0, 0.024));
    legs = min(legs, claw(p, vec3(-0.5, 1.0, 0.73), vec3(-0.1, -0.6, 0.8), vec3(0.0, 1.0, 0.0), 0.22, 1.0, 0.024));
    body = smin(body, legs, 0.08);
    // 팔: 오른팔은 앞의 해골을 움켜쥐고, 왼팔은 넓적다리뼈를 입으로
    float arms = limb(p, vec3(0.5, 2.36, 0.2), vec3(0.95, 1.65, 0.55), vec3(0.75, 0.88, 1.0), 0.13, 0.085, 0.06);
    arms = min(arms, limb(p, vec3(-0.5, 2.36, 0.2), vec3(-0.85, 1.75, 0.7), vec3(-0.45, 1.85, 1.15), 0.13, 0.085, 0.06));
    float hands = claw(p, vec3(0.72, 0.8, 1.1), vec3(0.0, -0.7, 0.6), vec3(1.0, 0.0, 0.0), 0.3, 1.1, 0.026);
    hands = min(hands, claw(p, vec3(-0.36, 1.86, 1.25), vec3(0.6, 0.1, 0.4), vec3(0.0, 1.0, 0.0), 0.24, 1.6, 0.026));
    body = smin(body, smin(arms, hands, 0.04), 0.07);
    body += 0.005 * (fbm3(p * 14.0) - 0.5) + 0.004 * ridge(p * vec3(5.0, 22.0, 5.0));
    r = umin(r, vec2(body, 2.0));

    // ── 머리: 개처럼 긴 주둥이, 뒤로 젖힌 귀, 벌린 턱 ──
    vec3 hq = p - HEADC;
    hq /= 1.3;
    hq.yz = rot(0.3) * hq.yz;
    hq.xz = rot(-0.15) * hq.xz;
    float head = sdEllipsoid(hq - vec3(0.0, 0.06, -0.06), vec3(0.17, 0.15, 0.2));
    head = smin(head, sdRoundCone(hq, vec3(0.0, 0.0, 0.1), vec3(0.0, -0.06, 0.4), 0.11, 0.06), 0.08);
    vec3 he = hq;
    he.x = abs(he.x);
    head = smin(head, sdEllipsoid(he - vec3(0.085, 0.07, 0.1), vec3(0.06, 0.025, 0.05)), 0.03);
    head = smax(head, -sdSphere(he - vec3(0.085, 0.035, 0.13), 0.035), 0.02);
    // 귀: 뾰족하게 뒤로
    head = smin(head, sdRoundCone(he, vec3(0.11, 0.12, -0.04), vec3(0.24, 0.26, -0.28), 0.045, 0.008), 0.04);
    // 아래턱 (벌어짐)
    vec3 jq = hq - vec3(0.0, -0.1, 0.05);
    jq.yz = rot(-0.4) * jq.yz;
    float jaw = sdRoundCone(jq, vec3(0.0, 0.0, 0.0), vec3(0.0, -0.02, 0.32), 0.08, 0.04);
    head = smin(head, jaw, 0.04);
    // 입 안 (어둠)
    float mouth = sdRoundCone(hq, vec3(0.0, -0.1, 0.12), vec3(0.0, -0.14, 0.36), 0.05, 0.03);
    head = smax(head, -mouth, 0.02);
    head += 0.004 * (fbm3(p * 20.0) - 0.5);
    r = umin(r, vec2(head * 1.3, 2.0));
    r = umin(r, vec2((mouth + 0.012) * 1.3, 99.0));
    // 이빨: 위턱과 아래턱의 긴 송곳니
    float teeth = 1e5;
    for (int i = 0; i < 5; i++) {
      float t = float(i) / 4.0;
      float zz = mix(0.14, 0.36, t);
      float xx = mix(0.065, 0.035, t);
      float L = mix(0.075, 0.035, t);
      vec3 ta = vec3(xx, -0.08 - 0.04 * t, zz);
      vec3 tb = ta + vec3(0.0, -L, 0.01);
      teeth = min(teeth, sdRoundCone(he, ta, tb, 0.012, 0.002));
      vec3 ja = vec3(xx * 0.9, 0.0, zz - 0.05);
      ja = vec3(ja.x, ja.y, ja.z);
      vec3 jb = ja + vec3(0.0, L * 0.8, 0.0);
      vec3 jqa = vec3(abs(jq.x), jq.y, jq.z);
      teeth = min(teeth, sdRoundCone(jqa, ja, jb, 0.011, 0.002));
    }
    r = umin(r, vec2(teeth * 1.3, 4.0));
    // 손가락뼈로 엮은 관
    vec3 kq = hq - vec3(0.0, 0.17, -0.06);
    float crown = length(vec2(length(kq.xz * vec2(1.0, 0.85)) - 0.15, kq.y)) - 0.018;
    vec3 sp = polarRep(kq, 9.0);
    crown = min(crown, sdRoundCone(sp, vec3(0.15, 0.0, 0.0), vec3(0.17, 0.13, 0.0), 0.016, 0.006));
    r = umin(r, vec2(crown * 1.3, 1.0));

    // 갉아먹는 다리뼈 (왼손에 쥠)
    float fem = femur(p, vec3(-0.55, 1.62, 1.42), vec3(0.08, 2.0, 1.4), 0.04);
    r = umin(r, vec2(fem, 5.0));
  }

  // ── 팔걸이 위 초 ──
  float cd = 1e5;
  for (int i = 0; i < 3; i++) {
    vec3 c = uP[i].xyz - vec3(0.0, 0.16, 0.0);
    float h = 0.07 + 0.04 * float(i);
    cd = min(cd, sdCylinder(p - c - vec3(0.0, h * 0.5 - 0.02, 0.0), h * 0.5, 0.03));
    cd = smin(cd, sdEllipsoid(p - c + vec3(0.0, 0.03, 0.0), vec3(0.07, 0.03, 0.07)), 0.03);
  }
  r = umin(r, vec2(cd, 6.0));

  // ── 바닥의 뼈 부스러기와 재 ──
  float ash = sdEllipsoid(p - vec3(0.0, -0.06, 0.4), vec3(1.9, 0.18, 1.5));
  ash += 0.1 * (fbm3(p * 3.5) - 0.5) + 0.03 * (noise(p * 16.0) - 0.5);
  r = umin(r, vec2(ash, 7.0));
  r = umin(r, vec2(skull(p - vec3(1.1, 0.12, 1.1), 1.2), 1.0));
  r = umin(r, vec2(sdCapsule(p, vec3(-1.3, 0.08, 1.0), vec3(-0.8, 0.07, 1.35), 0.03), 1.0));
  // 바닥 아래는 없다 (스프라이트에서 밑면이 보이지 않게)
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
    // 누렇게 바랜 뼈, 그을음과 흘러내린 밀랍
    float g = fbm3(p * 12.0);
    float soot = smoothstep(0.4, 0.8, fbm3(p * 3.0 + 2.0));
    vec3 alb = vec3(0.2, 0.17, 0.125) * (0.55 + 0.6 * g) * (1.0 - soot * 0.55);
    return Mat(alb, 0.6, 0.35, alb * cl * 1.2, 0.0, 0.25, 0.05);
  }
  if (id < 2.5) {
    // 고무 같은 잿빛 살갗, 젖은 광택, 검붉은 핏줄
    float bl = fbm3(p * 9.0);
    float vein = smoothstep(0.07, 0.0, ridge(p * 6.0)) * smoothstep(0.35, 0.7, noise(p * 2.2));
    vec3 alb = vec3(0.072, 0.078, 0.072) * (0.65 + 0.6 * bl);
    alb = mix(alb, vec3(0.08, 0.02, 0.018), vein * 0.7);
    // 입가와 손의 피
    float blood = smoothstep(0.35, 0.1, length(p - (HEADC + vec3(0.0, -0.22, 0.32)))) + smoothstep(0.25, 0.05, length(p - vec3(-0.3, 1.9, 1.3)));
    alb = mix(alb, vec3(0.035, 0.006, 0.004), clamp(blood, 0.0, 1.0) * 0.6);
    return Mat(alb, 0.42, 0.55, alb * cl, 0.04, 0.55, 0.35 + blood * 0.4);
  }
  if (id < 4.5) return Mat(vec3(0.2, 0.17, 0.12), 0.35, 0.6, vec3(0.0), 0.0, 0.3, 0.4);
  if (id < 5.5) {
    // 갉아먹힌 다리뼈: 뼈 + 붉은 살점
    float meat = smoothstep(0.5, 0.7, fbm3(p * 9.0)) * smoothstep(0.3, 0.0, length(p - vec3(0.0, 1.95, 1.4)));
    vec3 alb = mix(vec3(0.15, 0.125, 0.09), vec3(0.06, 0.008, 0.006), meat);
    return Mat(alb, 0.4, 0.6, alb * cl, 0.0, 0.4, 0.4 + meat * 0.4);
  }
  if (id < 6.5) return Mat(vec3(0.3, 0.26, 0.18), 0.45, 0.3, vec3(0.3, 0.26, 0.18) * cl * 1.5, 0.0, 0.85, 0.1);
  float g = fbm3(p * 9.0);
  vec3 alb = vec3(0.032, 0.031, 0.03) * (0.6 + 0.6 * g);
  return Mat(alb, 0.95, 0.03, alb * cl, 0.0, 0.0, 0.0);
}
`,
  };
}
