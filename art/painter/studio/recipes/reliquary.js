// 살아있는 성유물함 (2층 정예) — 성인의 유골을 모신 함. 수백 년의 기도를 받아먹고 눈을 떴다.
// 박공지붕 모양의 금박 유골함. 지붕 뚜껑이 턱처럼 벌어졌고, 안쪽엔 손가락뼈 이빨이 두 줄로 늘어섰다.
// 어둠 속엔 성인의 두개골이 한쪽 눈만 빛내고, 보석이 박혀 있던 자리마다 진짜 눈이 떴다.
// 함 밑에서 성인의 팔뼈들이 거미 다리처럼 뻗어 나와 바닥을 짚는다.

export default function reliquary() {
  // 보석 자리의 눈 (앞면 아치 사이와 옆면)
  const eyes = [
    [-0.47, 1.16, 0.44, 0.05],
    [0.0, 1.16, 0.44, 0.058],
    [0.47, 1.16, 0.44, 0.05],
    [-0.24, 0.76, 0.44, 0.038],
    [0.24, 0.76, 0.44, 0.038],
    [0.8, 1.02, 0.18, 0.045],
    [0.8, 0.96, -0.16, 0.038],
    [0.135, 1.36, 0.1, 0.03],
  ];
  const gaze = eyes.map((e, i) => [0.15 * (i % 3 - 1), -0.1, 1, i === 1 ? 5 : i > 4 ? 1 : 5]);
  gaze[5] = [1, -0.1, 0.4, 1];
  gaze[6] = [1, -0.1, 0.2, 1];
  gaze[7] = [0.3, 0.5, 1, 15];
  return {
    preset: 'act2',
    cam: { pos: [2.4, 1.9, 5.9], target: [0.05, 0.85, 0.0], fov: 1.55 },
    light: {
      key: [-0.45, 0.65, -0.6],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.22, 0.12, 0.05],
      amb: [0.022, 0.018, 0.016],
      rim: 1.3,
      pt: [0.0, 1.5, 0.2],
      ptCol: [1.4, 1.0, 0.5],
      exposure: 1.2,
      eyeEmit: 2.2,
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: {
      uE: eyes,
      uG: gaze,
      uL: [
        [0.08, 1.48, -0.05, 0.03],
        [-0.7, 1.52, 0.32, 0.026],
        [0.72, 1.5, 0.3, 0.026],
      ],
      uLC: [
        [1.0, 0.85, 0.5, 1.2],
        [1.0, 0.7, 0.3, 1.1],
        [1.0, 0.7, 0.3, 1.1],
      ],
    },
    glsl: /* glsl */ `
const vec3 BOXC = vec3(0.0, 0.98, 0.0);
const vec3 BOXS = vec3(0.8, 0.36, 0.44);
const float OPEN = 0.95;   // 뚜껑이 벌어진 각도

// 박공지붕 (q: 뚜껑 경첩 기준, 앞 = +z)
float roof(vec3 q) {
  // 지붕 단면: 삼각형 (밑변 z∈[0, 0.9], 높이 0.38) — 경첩은 뒤쪽 아래 모서리
  vec3 c = q - vec3(0.0, 0.0, 0.45);
  float tri = max(abs(c.z) * 0.85 + c.y * 1.0 - 0.38, -c.y);
  float d = max(tri, abs(c.x) - BOXS.x - 0.04);
  // 처마 테두리
  d = min(d, sdBox(c - vec3(0.0, 0.015, 0.0), vec3(BOXS.x + 0.06, 0.02, 0.48)));
  // 용마루 장식: 작은 가시 꽃잎들
  vec3 rq = c - vec3(0.0, 0.38, 0.0);
  float crest = sdBox(rq, vec3(BOXS.x + 0.02, 0.025, 0.025));
  vec3 rr = rq;
  rr.x = mod(rr.x + 0.08, 0.16) - 0.08;
  crest = min(crest, max(sdRoundCone(rr, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.11, 0.0), 0.035, 0.008), abs(rq.x) - BOXS.x));
  d = min(d, crest);
  return d;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  // ── 함 몸체: 금박 상자, 앞면엔 아치 셋 ──
  vec3 bq = p - BOXC;
  float box = sdRoundBox(bq, BOXS, 0.03);
  // 위가 열려 속이 비었다
  box = max(box, -sdBox(bq - vec3(0.0, 0.2, 0.0), BOXS - vec3(0.06, 0.0, 0.06)));
  // 앞면 아치 (오목하게 판 칸)
  vec3 aq = bq - vec3(0.0, -0.05, BOXS.z);
  aq.x = mod(aq.x + 0.24, 0.48) - 0.24;
  float arch = max(sdBox(aq - vec3(0.0, -0.06, 0.0), vec3(0.15, 0.16, 0.03)), -(0.0));
  arch = min(arch, sdCylinder((aq - vec3(0.0, 0.1, 0.0)).xzy, 0.03, 0.15));
  arch = max(arch, abs(bq.x) - 0.7);
  box = max(box, -arch);
  // 아치 속 성인 부조 (가늘고 긴 형체)
  vec3 sq = aq - vec3(0.0, -0.02, -0.02);
  float saint = sdRoundCone(sq, vec3(0.0, -0.18, 0.0), vec3(0.0, 0.1, 0.0), 0.05, 0.03);
  saint = min(saint, sdSphere(sq - vec3(0.0, 0.16, 0.0), 0.035));
  saint = max(saint, abs(bq.x) - 0.7);
  box = min(box, saint);
  // 테두리 띠와 모서리 기둥
  box = min(box, sdBox(bq - vec3(0.0, -BOXS.y + 0.02, 0.0), BOXS + vec3(0.03, -BOXS.y + 0.03, 0.03)));
  box = min(box, max(sdBox(bq - vec3(0.0, BOXS.y - 0.02, 0.0), vec3(BOXS.x + 0.03, 0.03, BOXS.z + 0.03)), -sdBox(bq - vec3(0.0, BOXS.y, 0.0), vec3(BOXS.x - 0.06, 0.1, BOXS.z - 0.06))));
  vec3 cq = bq;
  cq.xz = abs(cq.xz) - BOXS.xz;
  box = min(box, sdCylinder(cq, BOXS.y + 0.05, 0.04));
  box += 0.003 * (fbm3(p * 30.0) - 0.5);
  r = vec2(box, 1.0);

  // ── 뚜껑: 뒤쪽 위 모서리를 경첩 삼아 턱처럼 벌어짐 ──
  vec3 hq = p - (BOXC + vec3(0.0, BOXS.y, -BOXS.z));
  hq.yz = rot(-OPEN) * hq.yz;
  hq.z = hq.z;
  float lid = roof(hq);
  lid += 0.003 * (fbm3(p * 30.0) - 0.5);
  // 뚜껑 안쪽: 검붉은 비단 안감 (입천장처럼)
  float lining = max(sdBox(hq - vec3(0.0, -0.005, 0.45), vec3(BOXS.x + 0.02, 0.012, 0.44)), -hq.y - 0.03);
  r = umin(r, vec2(lid, 1.0));
  r = umin(r, vec2(lining, 4.0));

  // ── 이빨: 손가락뼈 두 줄 (상자 테두리 위로, 뚜껑 처마 아래로) ──
  float teeth = 1e5;
  for (int i = 0; i < 9; i++) {
    float x = (float(i) - 4.0) * 0.17;
    float L = 0.13 + 0.05 * hash11(float(i) * 3.3);
    vec3 a = BOXC + vec3(x, BOXS.y + 0.01, BOXS.z - 0.04);
    teeth = min(teeth, sdRoundCone(p, a, a + vec3(0.0, L, 0.02), 0.022, 0.01));
    teeth = min(teeth, sdSphere(p - (a + vec3(0.0, L * 0.5, 0.01)), 0.024));
    // 뚜껑 쪽 이빨: 뚜껑 좌표에서 아래로
    vec3 b = vec3(x + 0.085, 0.0, 0.9);
    vec3 tq = hq - b;
    teeth = min(teeth, sdRoundCone(tq, vec3(0.0, 0.0, 0.0), vec3(0.0, -L, -0.03), 0.022, 0.01));
  }
  r = umin(r, vec2(teeth, 2.0));

  // ── 함 속: 어둠과 성인의 두개골 ──
  float inner = sdBox(p - BOXC - vec3(0.0, -0.08, 0.0), vec3(BOXS.x - 0.07, 0.28, BOXS.z - 0.07));
  r = umin(r, vec2(inner, 99.0));
  vec3 kq = p - vec3(0.08, 1.3, -0.04);
  kq.yz = rot(-0.35) * kq.yz;
  float skull = sdEllipsoid(kq, vec3(0.14, 0.15, 0.16));
  skull = smin(skull, sdEllipsoid(kq - vec3(0.0, -0.08, 0.08), vec3(0.09, 0.07, 0.08)), 0.04);
  vec3 ke = kq;
  ke.x = abs(ke.x);
  skull = smax(skull, -sdSphere(ke - vec3(0.055, 0.0, 0.13), 0.04), 0.01);
  r = umin(r, vec2(skull, 2.0));

  // ── 다리: 함 밑에서 뻗은 성인의 팔뼈 여섯, 끝은 뼈 손 ──
  float legs = 1e5;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float sx = mod(fi, 2.0) < 0.5 ? -1.0 : 1.0;
    float zz = (floor(fi / 2.0) - 1.0) * 0.32;
    vec3 a = vec3(sx * 0.55, 0.66, zz * 0.9);
    vec3 k = vec3(sx * 1.0, 1.08 + 0.1 * hash11(fi), zz * 1.4 + 0.05);
    vec3 e = vec3(sx * 1.3, 0.08, zz * 1.8 + 0.12);
    legs = min(legs, sdRoundCone(p, a, k, 0.04, 0.03));
    legs = smin(legs, sdSphere(p - k, 0.05), 0.02);
    legs = smin(legs, sdSphere(p - a, 0.05), 0.02);
    legs = min(legs, sdRoundCone(p, k + vec3(0.0, 0.0, 0.018), e + vec3(0.0, 0.0, 0.015), 0.02, 0.016));
    legs = min(legs, sdRoundCone(p, k - vec3(0.0, 0.0, 0.018), e - vec3(0.0, 0.0, 0.015), 0.018, 0.014));
    legs = smin(legs, sdSphere(p - e, 0.035), 0.02);
    // 뼈 손가락
    for (int j = 0; j < 3; j++) {
      float o = (float(j) - 1.0) * 0.045;
      vec3 f0 = e + vec3(0.0, -0.02, o);
      legs = min(legs, sdRoundCone(p, f0, f0 + vec3(sx * 0.1, -0.03, o * 0.8), 0.014, 0.007));
    }
  }
  r = umin(r, vec2(legs, 2.0));
  // ── 귀퉁이 초 ──
  float cd = min(sdCylinder(p - vec3(-0.7, 1.43, 0.32), 0.07, 0.03), sdCylinder(p - vec3(0.72, 1.42, 0.3), 0.06, 0.03));
  r = umin(r, vec2(cd, 3.0));
  r.x = max(r.x, -p.y);
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 그을린 금박: 무늬가 닳아 바탕 나무가 비치고, 홈엔 검붉은 법랑
    float tarn = fbm3(p * 5.0);
    float worn = smoothstep(0.74, 0.9, fbm3(p * 12.0 + 3.0));
    float pat = smoothstep(0.35, 0.65, noise(p * 45.0));
    vec3 gold = vec3(0.44, 0.33, 0.12) * (0.7 + 0.3 * tarn) * (0.85 + 0.2 * pat);
    vec3 enamel = vec3(0.05, 0.01, 0.012);
    float rec = smoothstep(0.3, -0.2, n.z) * 0.0;
    vec3 alb = mix(gold, vec3(0.04, 0.025, 0.015), worn);
    alb = mix(alb, enamel, smoothstep(0.68, 0.78, noise(p * 9.0)) * 0.3);
    float soot = smoothstep(0.5, 0.0, p.y - 0.6) * 0.5;
    alb *= 1.0 - soot;
    return Mat(alb, mix(0.22, 0.7, worn), mix(1.8, 0.3, worn), vec3(0.0), 0.04, 0.0, mix(0.7, 0.1, worn));
  }
  if (id < 2.5) {
    // 누렇게 바랜 뼈
    float g = fbm3(p * 14.0);
    vec3 alb = vec3(0.19, 0.16, 0.115) * (0.55 + 0.6 * g);
    return Mat(alb, 0.55, 0.4, vec3(0.0), 0.0, 0.3, 0.05);
  }
  if (id < 3.5) return Mat(vec3(0.3, 0.26, 0.18), 0.45, 0.3, vec3(0.0), 0.0, 0.85, 0.1);
  // 검붉은 비단 안감, 젖은 듯 번들거림
  float fold = 0.7 + 0.3 * sin(p.x * 40.0 + 3.0 * noise(p * 6.0));
  return Mat(vec3(0.09, 0.008, 0.012) * fold, 0.35, 0.8, vec3(0.0), 0.0, 0.4, 0.6);
}
`,
  };
}
