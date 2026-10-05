// 결박된 제물 (2층 하수인) — 대사제가 아래의 목소리에게 바치려고 묶어 둔 사람. "살려 주세요…"
// 거친 나무 말뚝 앞에 무릎을 꿇었고, 두 손목은 등 뒤 말뚝에 밧줄과 쇠고랑으로 묶였다.
// 머리엔 목에서 끈으로 조인 삼베 자루(얼굴이 없다). 얇은 흰 삼베옷엔 재로 그린 표식. 앞에는 몽당 촛불들.
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const YAW = 0.22;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];

export default function offering() {
  const candles = [
    [-0.28, 0.0, 0.36, 0.06],
    [0.24, 0.0, 0.4, 0.085],
    [0.36, 0.0, 0.22, 0.045],
  ];
  const flames = candles.map(([x, , z, h]) => toWorld([x, h + 0.035, z]));
  return {
    preset: 'act2',
    cam: { pos: [0.5, 0.65, 3.6], target: [0.0, 0.58, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.3,
      fillCol: [0.2, 0.12, 0.05],
      pt: toWorld([0.0, 0.25, 0.55]),
      ptCol: [1.0, 0.62, 0.26],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uP: candles,
      uL: flames.map((f) => [...f, 0.011]),
      uLC: flames.map(() => [1.0, 0.75, 0.38, 1.3]),
    },
    glsl: /* glsl */ `
const float YAW = ${YAW.toFixed(4)};
const vec3 HEAD = vec3(0.0, 1.0, 0.16);
const vec3 POST = vec3(0.0, 0.0, -0.3);
const vec3 WRIST = vec3(0.0, 0.62, -0.25);

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  float bound = sdBox(p - vec3(0.0, 0.65, 0.0), vec3(0.6, 0.75, 0.6));
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 무릎 꿇은 몸: 정강이는 바닥, 허벅지는 곧추, 몸통은 앞으로 조금 숙였다
  float legs = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 hip = vec3(sx * 0.09, 0.5, -0.02);
    vec3 kn = vec3(sx * 0.11, 0.07, 0.12);
    vec3 ft = vec3(sx * 0.1, 0.05, -0.3);
    legs = min(legs, smin(sdRoundCone(p, hip, kn, 0.068, 0.042), sdRoundCone(p, kn, ft, 0.04, 0.026), 0.02));
    legs = smin(legs, sdSphere(p - kn - vec3(0.0, 0.01, 0.02), 0.042), 0.02);
    // 발바닥이 위로 (맨발)
    legs = smin(legs, sdRoundCone(p, ft, ft + vec3(0.0, 0.07, -0.05), 0.035, 0.03), 0.02);
  }
  // 몸통
  vec3 tq = p;
  tq.x *= 1.25;
  float torso = sdRoundCone(tq, vec3(0.0, 0.52, -0.02), vec3(0.0, 0.84, 0.08), 0.11, 0.13) * 0.8;
  torso = smin(torso, sdEllipsoid(p - vec3(0.0, 0.84, 0.07), vec3(0.15, 0.09, 0.09)), 0.05);
  // 어깨가 뒤로 젖혀지고 팔이 등 뒤로 묶였다
  float arms = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 sh = vec3(sx * 0.15, 0.87, 0.04);
    vec3 el = vec3(sx * 0.19, 0.68, -0.12);
    vec3 wr = WRIST + vec3(sx * 0.035, 0.0, 0.0);
    arms = min(arms, smin(sdRoundCone(p, sh, el, 0.042, 0.028), sdRoundCone(p, el, wr, 0.028, 0.022), 0.015));
    arms = smin(arms, sdSphere(p - el, 0.03), 0.015);
  }
  float body = smin(torso, legs, 0.05);
  // 얇은 민소매 삼베옷: 어깨끈에서 늘어져 허벅지까지, 세로 주름이 진다
  float fold = (sin(atan(p.z - 0.02, p.x) * 9.0 + p.y * 4.0) * 0.5 + 0.5) * smoothstep(0.85, 0.35, p.y);
  float shift = body - 0.01 - 0.012 * fold;
  // 무릎 아래로 바닥에 퍼진 치맛자락
  float gy = clamp(p.y / 0.55, 0.0, 1.0);
  float ga = atan(p.z + 0.05, p.x);
  float gr = mix(0.3, 0.16, pow(gy, 0.7)) + 0.025 * (1.0 - gy) * sin(ga * 8.0 + gy * 3.0);
  float gown = (length((p.xz - vec2(0.0, -0.05)) * vec2(1.0, 0.9)) - gr) * 0.7;
  gown = max(gown, p.y - 0.55);
  shift = smin(shift, gown, 0.08);
  shift = max(shift, p.y - 0.92);
  shift = max(shift, -(p.y - 0.008 - 0.03 * fbm3(p * vec3(10.0, 0.0, 10.0))));
  shift += 0.003 * (fbm3(p * 30.0) - 0.5);
  vec2 r = vec2(shift, 1.0);
  // 드러난 맨살 (목·팔·정강이·발)
  float skin = sdRoundCone(p, vec3(0.0, 0.86, 0.07), HEAD + vec3(0.0, -0.1, -0.02), 0.045, 0.04);
  skin = smin(skin, sdEllipsoid(p - vec3(0.0, 0.86, 0.06), vec3(0.14, 0.05, 0.07)), 0.03);
  skin = min(skin, arms);
  skin = min(skin, legs);
  skin += 0.0015 * (fbm3(p * 60.0) - 0.5);
  r = umin(r, vec2(skin, 2.0));
  r = umin(r, vec2(shift, 1.0));
  // ── 삼베 자루: 머리를 덮고 목에서 끈으로 조였다
  vec3 hq = p - HEAD;
  hq.yz = rot(0.6) * hq.yz;
  float sack = sdEllipsoid(hq - vec3(0.0, 0.02, 0.0), vec3(0.1, 0.125, 0.11));
  // 자루 위쪽은 접혀 옆으로 늘어졌다
  sack = smin(sack, sdEllipsoid(hq - vec3(-0.05, 0.12, -0.03), vec3(0.08, 0.035, 0.07)), 0.04);
  // 주름: 끈 쪽으로 모인다
  float ang = atan(hq.z, hq.x);
  sack += 0.008 * sin(ang * 11.0 + hq.y * 10.0) * smoothstep(0.0, -0.12, hq.y);
  // 숨 쉬는 입 자리가 살짝 빨려 들어갔다
  sack += 0.006 * smoothstep(0.05, 0.0, length(hq.xy - vec2(0.0, -0.045))) * step(0.0, hq.z);
  sack = max(sack, -hq.y - 0.13);
  sack += 0.003 * (fbm3(p * 40.0) - 0.5);
  r = umin(r, vec2(sack, 3.0));
  // 목의 끈
  vec3 nq = hq - vec3(0.0, -0.115, 0.0);
  float tie = length(vec2(length(nq.xz) - 0.055, nq.y)) - 0.009;
  tie = min(tie, sdCapsule(nq, vec3(0.04, 0.0, 0.04), vec3(0.06, -0.12, 0.08), 0.007));
  tie = min(tie, sdCapsule(nq, vec3(0.045, 0.0, 0.035), vec3(0.09, -0.09, 0.03), 0.007));
  r = umin(r, vec2(tie, 4.0));
  // ── 나무 말뚝 + 손목을 감은 밧줄 + 쇠고랑과 사슬
  vec3 pq = p - POST;
  float post = sdBox(pq - vec3(0.0, 0.7, 0.0), vec3(0.055, 0.7, 0.05)) - 0.01;
  post += 0.006 * (fbm3(p * vec3(20.0, 4.0, 20.0)) - 0.5);
  post = max(post, p.y - 1.36 - 0.06 * fbm3(vec3(p.x * 20.0, 0.0, 1.0)));
  r = umin(r, vec2(post, 5.0));
  float rope = 1e5;
  for (int i = 0; i < 4; i++) {
    float yy = 0.585 + float(i) * 0.024;
    vec3 rq = p - vec3(0.0, yy, -0.27);
    rope = min(rope, length(vec2(length(rq.xz * vec2(0.85, 1.0)) - 0.07, rq.y)) - 0.009);
  }
  r = umin(r, vec2(rope, 4.0));
  float iron = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 mq = p - WRIST - vec3(sx * 0.04, -0.03, 0.0);
    iron = min(iron, length(vec2(length(mq.yz) - 0.034, mq.x)) - 0.009);
  }
  // 바닥으로 늘어진 사슬
  vec3 ca = WRIST + vec3(0.0, -0.05, 0.0);
  vec3 cb = vec3(0.12, 0.01, -0.45);
  vec3 ba = cb - ca;
  float h = clamp(dot(p - ca, ba) / dot(ba, ba), 0.0, 1.0);
  vec3 cp = ca + ba * h - vec3(0.0, 0.12 * sin(h * 3.1416), 0.0);
  iron = min(iron, length(p - cp) - (0.006 + 0.004 * abs(sin(h * 70.0))));
  r = umin(r, vec2(iron, 6.0));
  // ── 몽당 촛불
  for (int i = 0; i < 3; i++) {
    vec4 c = uP[i];
    vec3 cq = p - c.xyz;
    float cd = sdCappedCone(cq - vec3(0.0, c.w * 0.5, 0.0), c.w * 0.5, 0.024, 0.02);
    cd = smin(cd, sdEllipsoid(cq, vec3(0.045, 0.014, 0.04)), 0.02);
    r = umin(r, vec2(cd, 7.0));
    r = umin(r, vec2(sdCapsule(cq, vec3(0.0, c.w, 0.0), vec3(0.0, c.w + 0.015, 0.0), 0.002), 8.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = smoothstep(0.3, 0.9, n.y + 0.4 * (fbm3(lp * 9.0) - 0.5));
  if (id < 1.5) {
    // 얇은 흰 삼베옷: 재 얼룩, 가슴엔 재로 그린 표식 (원 + 세로 금)
    float weave = 0.82 + 0.18 * noise(lp * vec3(260.0, 260.0, 260.0));
    vec3 alb = vec3(0.16, 0.152, 0.138) * weave * (0.7 + 0.4 * fbm3(lp * 6.0));
    float dirt = smoothstep(0.45, 0.8, fbm3(lp * 5.0 + 1.0)) + smoothstep(0.3, 0.0, lp.y) * 0.6;
    alb = mix(alb, vec3(0.07, 0.065, 0.06), clamp(dirt, 0.0, 1.0) * 0.7);
    vec2 sg = lp.xy - vec2(0.0, 0.7);
    sg += 0.012 * (vec2(noise(lp * 40.0), noise(lp * 40.0 + 3.0)) - 0.5);
    float circ = smoothstep(0.014, 0.0, abs(length(sg) - 0.06));
    float bar = smoothstep(0.012, 0.0, abs(sg.x + 0.1 * sg.y)) * step(abs(sg.y), 0.09);
    float smear = smoothstep(0.4, 0.8, noise(lp * 25.0));
    float sigil = max(circ, bar) * step(0.0, lp.z) * (0.5 + 0.5 * smear);
    alb = mix(alb, vec3(0.035, 0.032, 0.03), sigil * 0.8);
    return Mat(alb, 0.9, 0.08, vec3(0.0), 0.0, 0.45, 0.0);
  }
  if (id < 2.5) {
    vec3 alb = vec3(0.15, 0.125, 0.105) * (0.75 + 0.35 * fbm3(lp * 20.0));
    alb = mix(alb, vec3(0.09, 0.085, 0.08), ash * 0.5 + smoothstep(0.15, 0.0, lp.y) * 0.4);
    // 손목의 쓸린 자국
    float raw = smoothstep(0.07, 0.03, length(lp - WRIST));
    alb = mix(alb, vec3(0.1, 0.03, 0.025), raw * 0.7);
    return Mat(alb, 0.6, 0.3, vec3(0.0), 0.0, 0.55, 0.1);
  }
  if (id < 3.5) {
    // 삼베 자루: 성긴 올, 입 자리에 축축한 얼룩
    vec2 g = vec2(sin(lp.x * 520.0 + lp.z * 300.0), sin(lp.y * 520.0));
    float weave = 0.75 + 0.25 * g.x * g.y;
    vec3 alb = vec3(0.11, 0.09, 0.06) * weave * (0.7 + 0.4 * fbm3(lp * 12.0));
    vec3 hq = lp - HEAD;
    hq.yz = rot(0.6) * hq.yz;
    float damp = smoothstep(0.05, 0.02, length(hq.xy - vec2(0.0, -0.045))) * step(0.0, hq.z);
    alb = mix(alb, vec3(0.04, 0.025, 0.02), damp * 0.8);
    alb = mix(alb, vec3(0.1, 0.095, 0.09), ash * 0.4);
    return Mat(alb, 0.95, 0.05, vec3(0.0), 0.0, 0.0, damp * 0.4);
  }
  if (id < 4.5) {
    float tw = 0.7 + 0.3 * sin(dot(lp, vec3(150.0, 190.0, 120.0)));
    return Mat(vec3(0.08, 0.065, 0.045) * tw, 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 5.5) {
    float grain = 0.7 + 0.3 * noise(lp * vec3(40.0, 300.0, 40.0));
    vec3 alb = vec3(0.06, 0.045, 0.03) * grain;
    alb = mix(alb, vec3(0.1, 0.095, 0.09), ash * 0.6);
    return Mat(alb, 0.85, 0.1, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 6.5) return Mat(vec3(0.03, 0.026, 0.024), 0.45, 0.8, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 7.5) return Mat(vec3(0.2, 0.17, 0.12), 0.35, 0.5, vec3(0.0), 0.0, 0.85, 0.3);
  return Mat(vec3(0.01), 0.9, 0.0, vec3(0.3, 0.12, 0.03), 0.0, 0.0, 0.0);
}
`,
  };
}
