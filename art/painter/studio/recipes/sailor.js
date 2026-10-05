// 술 취한 선원 (1층) — 술에 부푼 거구가 한쪽으로 기우뚱 쓰러질 듯 버틴다. 털모자를 눈썹까지 눌러쓰고,
// 엉킨 수염 속 이가 빠진 입을 벌려 고함친다. 치켜든 손엔 깨진 술병(들쭉날쭉한 유리 날), 다른 팔은 중심을
// 잡으려 허우적. 벌어진 피코트 사이로 때 묻은 줄무늬 셔츠, 핏발 선 눈.
export default function sailor() {
  const head = [-0.06, 1.6, 0.34];
  return {
    preset: 'act1',
    cam: { pos: [1.2, 0.6, 4.9], target: [0.0, 1.05, 0.1], fov: 1.85 },
    light: { rim: 2.2, fillCol: [0.24, 0.15, 0.08], amb: [0.024, 0.03, 0.032] },
    frame: { fill: 0.92 },
    arrays: {
      uL: [
        [head[0] - 0.038, head[1] + 0.012, head[2] + 0.108, 0.0045],
        [head[0] + 0.04, head[1] + 0.004, head[2] + 0.108, 0.0045],
      ],
      uLC: [
        [1.0, 0.25, 0.12, 0.7],
        [1.0, 0.25, 0.12, 0.7],
      ],
    },
    glsl: /* glsl */ `
const vec3 HEAD = vec3(${head.join(', ')});
const vec3 SH_R = vec3(0.24, 1.46, 0.14);
const vec3 EL_R = vec3(0.47, 1.56, 0.02);
const vec3 HAND_R = vec3(0.44, 1.86, -0.02);
const vec3 SH_L = vec3(-0.25, 1.42, 0.2);
const vec3 EL_L = vec3(-0.38, 1.24, 0.45);
const vec3 HAND_L = vec3(-0.3, 1.2, 0.7);
const vec3 BOTTLE_DIR = normalize(vec3(0.25, 0.8, -0.45));

// 기우뚱: 위로 갈수록 화면 왼쪽·앞으로 쏠린다
vec3 toBody(vec3 p) {
  float h = max(p.y - 0.55, 0.0);
  return vec3(p.x + 0.08 * h * h, p.y, p.z - 0.3 * h * h);
}

float folds(vec3 q, float freq, float amp) {
  float a = atan(q.z, q.x);
  return amp * (sin(a * freq + 2.5 * noise(q * 3.0)) * 0.6 + sin(a * freq * 2.3 + 1.7 + 3.0 * noise(q * 5.0)) * 0.4);
}

vec2 sdf(vec3 p) {
  vec3 b = toBody(p);
  // ── 몸통: 술배, 둥근 어깨
  float body = sdEllipsoid(b - vec3(0.0, 1.06, 0.06), vec3(0.25, 0.25, 0.24));
  body = smin(body, sdEllipsoid(b - vec3(0.0, 1.34, 0.0), vec3(0.25, 0.21, 0.17)), 0.12);
  body = smin(body, sdSphere(b - vec3(-0.22, 1.42, 0.0), 0.09), 0.08);
  body = smin(body, sdSphere(b - vec3(0.22, 1.43, 0.0), 0.09), 0.08);
  // 피코트 자락: 엉덩이 아래까지, 주름
  float yy = b.y;
  float sr = mix(0.3, 0.255, smoothstep(0.62, 1.05, yy));
  float sk0 = (length(b.xz * vec2(1.0, 1.15) - vec2(0.0, 0.04)) - sr) * 0.75;
  if (sk0 < 0.08) sr += folds(b, 7.0, 0.018 * smoothstep(1.0, 0.6, yy));
  float skirt = (length(b.xz * vec2(1.0, 1.15) - vec2(0.0, 0.04)) - sr) * 0.75;
  skirt = max(skirt, max(0.6 + 0.05 * fbm3(b * 7.0) - yy, yy - 1.15));
  skirt = max(skirt, -sdBox(b - vec3(0.0, 0.8, 0.3), vec3(0.04 + 0.06 * smoothstep(1.1, 0.6, yy), 0.25, 0.14)));
  body = smin(body, skirt, 0.07);
  // 깃
  vec3 nq = b - vec3(0.0, 1.55, 0.02);
  float collar = abs(length(nq.xz * vec2(1.0, 1.12)) - 0.135) - 0.026;
  collar = max(collar, abs(nq.y) - 0.065);
  collar = max(collar, nq.z - 0.03);
  body = smin(body, collar, 0.03);
  // 소매
  float arms = sdRoundCone(p, SH_R, EL_R, 0.075, 0.06);
  arms = min(arms, sdRoundCone(p, EL_R, HAND_R + vec3(0.0, -0.08, -0.01), 0.06, 0.052));
  arms = min(arms, sdRoundCone(p, SH_L, EL_L, 0.075, 0.06));
  arms = min(arms, sdRoundCone(p, EL_L, HAND_L + vec3(0.0, 0.0, -0.07), 0.06, 0.05));
  if (arms < 0.04) arms += 0.006 * sin(dot(p, vec3(40.0, 60.0, 20.0)) + 3.0 * noise(p * 8.0)) * smoothstep(0.14, 0.0, min(length(p - EL_R), length(p - EL_L)));
  body = smin(body, arms, 0.06);
  if (body < 0.03) body += 0.004 * (fbm3(p * 22.0) - 0.5);
  vec2 r = vec2(body, 1.0);

  // ── 다리: 넓게 벌려 버티고, 한쪽 무릎이 꺾인다
  float legs = sdRoundCone(p, vec3(-0.12, 0.85, 0.02), vec3(-0.25, 0.47, 0.12), 0.1, 0.078);
  legs = min(legs, sdRoundCone(p, vec3(-0.25, 0.47, 0.12), vec3(-0.3, 0.1, 0.06), 0.078, 0.06));
  legs = min(legs, sdRoundCone(p, vec3(0.13, 0.85, 0.02), vec3(0.2, 0.46, 0.18), 0.1, 0.078));
  legs = min(legs, sdRoundCone(p, vec3(0.2, 0.46, 0.18), vec3(0.27, 0.1, 0.02), 0.078, 0.06));
  if (legs < 0.03) legs += 0.008 * (noise(p * vec3(14.0, 34.0, 14.0)) - 0.5);
  r = umin(r, vec2(legs, 3.0));
  float boots = 1e5;
  for (int i = 0; i < 2; i++) {
    vec3 an = i == 0 ? vec3(-0.3, 0.1, 0.06) : vec3(0.27, 0.1, 0.02);
    vec3 bq = p - vec3(an.x, 0.0, an.z + 0.06);
    float shaft = sdCappedCone(p - an - vec3(0.0, 0.05, -0.005), 0.1, 0.07, 0.072);
    float foot = sdRoundBox(bq - vec3(0.0, 0.05, 0.0), vec3(0.055, 0.04, 0.13), 0.035);
    foot = smin(foot, sdEllipsoid(bq - vec3(0.0, 0.055, 0.09), vec3(0.058, 0.045, 0.06)), 0.03);
    float sole = sdRoundBox(bq - vec3(0.0, 0.012, 0.005), vec3(0.06, 0.012, 0.15), 0.008);
    boots = min(boots, min(smin(shaft, foot, 0.05), sole));
  }
  r = umin(r, vec2(boots, 6.0));

  // ── 머리: 부은 얼굴, 털모자, 엉킨 수염과 고함치는 입
  vec3 hq = p - HEAD;
  if (length(hq) < 0.34) {
    hq.xy = rot(0.16) * hq.xy;
    hq.yz = rot(-0.12) * hq.yz;
    float skull = sdEllipsoid(hq, vec3(0.11, 0.125, 0.12));
    vec3 aq = vec3(abs(hq.x), hq.y, hq.z);
    float cheeks = sdEllipsoid(aq - vec3(0.05, -0.03, 0.065), vec3(0.042, 0.04, 0.04));
    float nose = sdRoundCone(hq, vec3(0.0, 0.02, 0.105), vec3(0.006, -0.03, 0.13), 0.014, 0.02);
    float brow = sdEllipsoid(hq - vec3(0.0, 0.032, 0.095), vec3(0.09, 0.024, 0.032));
    float face = smin(smin(skull, cheeks, 0.035), smin(nose, brow, 0.02), 0.02);
    face = smax(face, -sdSphere(aq - vec3(0.04, 0.012, 0.115), 0.019), 0.01);
    // 수염: 턱 아래로 무성하게, 콧수염이 입을 덮는다
    vec3 bq = hq - vec3(0.0, -0.11, 0.045);
    float beard = sdEllipsoid(bq, vec3(0.125, 0.13, 0.105));
    beard = smin(beard, sdEllipsoid(hq - vec3(0.0, -0.05, 0.1), vec3(0.07, 0.022, 0.035)), 0.02);
    if (beard < 0.04) beard += 0.024 * (fbm3(hq * vec3(28.0, 7.0, 28.0)) - 0.5);
    // 고함치는 입 (가로로 벌어졌다)
    float mouth = sdEllipsoid(hq - vec3(0.0, -0.088, 0.125), vec3(0.04, 0.02, 0.05));
    face = smin(face, beard, 0.035);
    face = smax(face, -mouth, 0.01);
    float neck = sdRoundCone(p, vec3(-0.03, 1.45, 0.22), HEAD + vec3(0.0, -0.09, -0.06), 0.11, 0.09);
    r = umin(r, vec2(smin(face, neck, 0.05), 2.0));
    r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.088, 0.105), vec3(0.034, 0.016, 0.035)), 99.0));
    // 썩은 이 몇 개
    float teeth = 1e5;
    for (int i = 0; i < 5; i++) {
      float x = -0.03 + float(i) * 0.015;
      if (i == 2) continue;
      teeth = min(teeth, sdRoundBox(hq - vec3(x, -0.072, 0.128 - abs(x) * 0.5), vec3(0.0055, 0.008, 0.004), 0.002));
    }
    r = umin(r, vec2(teeth, 7.0));
    // 털모자: 접어 올린 단
    vec3 cq = hq - vec3(0.0, 0.05, 0.0);
    cq.yz = rot(0.3) * cq.yz;
    float cap = sdEllipsoid(cq, vec3(0.128, 0.105, 0.135));
    cap = max(cap, -(cq.y + 0.0));
    float cuff = sdCappedCone(cq - vec3(0.0, 0.012, 0.0), 0.026, 0.136, 0.13) - 0.008;
    cap = min(cap, cuff);
    cap += 0.0018 * sin(atan(cq.z, cq.x) * 60.0);
    r = umin(r, vec2(cap, 4.0));
  } else {
    r = umin(r, vec2(length(hq) - 0.26, 2.0));
  }

  // ── 손: 병을 쥔 주먹 / 허우적대는 손
  float hands = sdEllipsoid(p - HAND_R, vec3(0.05, 0.06, 0.052));
  vec3 lh = HAND_L;
  float hl = sdEllipsoid(p - lh, vec3(0.05, 0.04, 0.055));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.024;
    vec3 a = lh + vec3(o, 0.0, 0.04);
    vec3 m = a + vec3(o * 0.4, 0.01, 0.06);
    vec3 e = m + vec3(o * 0.2, -0.05, 0.03);
    hl = smin(hl, sdRoundCone(p, a, m, 0.015, 0.012), 0.012);
    hl = smin(hl, sdRoundCone(p, m, e, 0.012, 0.008), 0.008);
  }
  hl = smin(hl, sdRoundCone(p, lh + vec3(0.04, -0.01, 0.01), lh + vec3(0.06, -0.04, 0.07), 0.015, 0.01), 0.012);
  r = umin(r, vec2(min(hands, hl), 2.0));

  // ── 깨진 술병: 병목을 쥐고, 깨진 몸통이 머리 위 뒤로 젖혀졌다
  vec3 bd = BOTTLE_DIR;
  vec3 bs = normalize(cross(bd, vec3(0.0, 0.0, 1.0)));
  vec3 bu = cross(bs, bd);
  vec3 lq = p - HAND_R;
  lq = vec3(dot(lq, bs), dot(lq, bd), dot(lq, bu));
  if (length(lq) < 0.4) {
    // 병목(손잡이) → 어깨 → 몸통, 끝은 깨져 날이 섰다
    float bneck = sdCappedCone(lq - vec3(0.0, 0.06, 0.0), 0.1, 0.019, 0.015);
    float lip = sdTorus(lq - vec3(0.0, -0.04, 0.0), vec2(0.016, 0.006));
    float shoulder = sdCappedCone(lq - vec3(0.0, 0.19, 0.0), 0.035, 0.044, 0.018);
    float bbody = sdCylinder(lq - vec3(0.0, 0.32, 0.0), 0.1, 0.044) - 0.004;
    float glass = min(min(bneck, lip), smin(shoulder, bbody, 0.02));
    glass = max(glass, -sdCylinder(lq - vec3(0.0, 0.32, 0.0), 0.2, 0.038));
    float ang = atan(lq.z, lq.x);
    float jag = 0.34 + 0.06 * abs(sin(ang * 3.0)) + 0.04 * sin(ang * 7.0 + 1.0);
    glass = max(glass, lq.y - jag);
    r = umin(r, vec2(glass, 5.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    vec3 b = toBody(p);
    // 벌어진 앞섶 사이 줄무늬 셔츠
    float open = step(abs(b.x - 0.01), 0.05 + 0.07 * smoothstep(1.52, 1.1, b.y)) * step(0.0, n.z) * step(0.95, b.y) * step(b.y, 1.55);
    float stripe = step(0.5, fract(b.y * 24.0));
    vec3 shirt = mix(vec3(0.015, 0.017, 0.024), vec3(0.075, 0.07, 0.06), stripe) * (0.7 + 0.5 * fbm3(p * 8.0));
    float dirt = fbm3(p * 4.5);
    vec3 wool = vec3(0.028, 0.03, 0.038) * (0.55 + 0.8 * dirt);
    float wetTop = smoothstep(0.3, 0.9, n.y);
    if (open > 0.5) return Mat(shirt, 0.85, 0.1, vec3(0.0), 0.0, 0.1, 0.1);
    return Mat(wool, 0.85 - wetTop * 0.3, 0.12 + wetTop * 0.3, vec3(0.0), 0.0, 0.0, 0.1 + wetTop * 0.3);
  }
  if (id < 2.5) {
    // 술독 오른 붉은 살갗 / 수염은 거칠고 어둡다
    vec3 hq = p - HEAD;
    float beard = smoothstep(-0.035, -0.06, hq.y) * smoothstep(-0.03, 0.02, hq.z + 0.06);
    vec3 skin = vec3(0.085, 0.048, 0.038) * (0.7 + 0.5 * fbm3(p * 9.0));
    vec3 hair = vec3(0.03, 0.025, 0.02) * (0.6 + 0.6 * noise(p * vec3(80.0, 20.0, 80.0)));
    if (beard > 0.5) return Mat(hair, 0.85, 0.15, vec3(0.0), 0.0, 0.0, 0.2);
    return Mat(skin, 0.5, 0.4, vec3(0.0), 0.0, 0.45, 0.25);
  }
  if (id < 3.5) return Mat(vec3(0.026, 0.023, 0.02) * (0.7 + 0.6 * fbm3(p * 6.0)), 0.9, 0.08, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 4.5) return Mat(vec3(0.045, 0.02, 0.016) * (0.8 + 0.3 * noise(p * 140.0)), 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.15);
  if (id < 5.5) return Mat(vec3(0.006, 0.02, 0.01), 0.04, 2.0, vec3(0.0), 0.0, 0.3, 1.0);
  if (id < 6.5) return Mat(vec3(0.018, 0.015, 0.012), 0.35, 0.8, vec3(0.0), 0.0, 0.0, 0.6);
  return Mat(vec3(0.16, 0.13, 0.07), 0.4, 0.6, vec3(0.0), 0.0, 0.2, 0.4);
}
`,
  };
}
