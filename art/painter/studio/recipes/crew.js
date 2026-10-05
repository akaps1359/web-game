// 밀수 조직원 (1층, 두목의 하수인) — 한쪽 무릎을 꿇고 긴 화승총을 겨눈 엄호 사수.
// 깊은 두건과 젖은 유포 망토, 가슴엔 탄약 띠. 두건 속엔 겨누는 눈빛 한 점, 총의 화승 끝에서 불씨가 타며
// 손과 총신을 아래에서 붉게 비춘다.
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const BUTT = [0.17, 1.02, 0.02];
const GX = norm([-0.42, 0.03, 0.9]);
const GY = norm([-GX[0] * GX[1], 1 - GX[1] * GX[1], -GX[2] * GX[1]]);
const GZ = [GX[1] * GY[2] - GX[2] * GY[1], GX[2] * GY[0] - GX[0] * GY[2], GX[0] * GY[1] - GX[1] * GY[0]];
/** 총 국소 좌표 (x: 옆, y: 위, z: 총구 쪽) → 세계 */
const gun = (x, y, z) => [0, 1, 2].map((i) => BUTT[i] + GZ[i] * x + GY[i] * y + GX[i] * z);

export default function crew() {
  const head = [0.03, 1.2, 0.2];
  const match = gun(-0.03, 0.045, 0.37);
  const grip = gun(0.0, -0.04, 0.24);
  const support = gun(0.0, -0.03, 0.62);
  return {
    preset: 'act1',
    cam: { pos: [0.95, 0.62, 3.8], target: [0.0, 0.66, 0.15], fov: 1.8 },
    light: { pt: [match[0], match[1] + 0.02, match[2] + 0.04], ptCol: [0.45, 0.17, 0.05], rim: 2.0, fillCol: [0.22, 0.14, 0.075], amb: [0.022, 0.03, 0.032] },
    frame: { fill: 0.92 },
    arrays: {
      uL: [
        [match[0], match[1], match[2], 0.012],
        [head[0] + 0.035, head[1] - 0.005, head[2] + 0.1, 0.006],
        [head[0] - 0.04, head[1] + 0.0, head[2] + 0.095, 0.004],
      ],
      uLC: [
        [1.0, 0.42, 0.1, 1.5],
        [0.7, 0.85, 1.0, 0.9],
        [0.7, 0.85, 1.0, 0.4],
      ],
    },
    glsl: /* glsl */ `
const vec3 HEAD = vec3(${head.join(', ')});
const vec3 MATCH = vec3(${match.join(', ')});
const vec3 BUTT = vec3(${BUTT.join(', ')});
const vec3 GDIR = vec3(${GX.join(', ')});
const vec3 GRIP = vec3(${grip.join(', ')});
const vec3 SUPPORT = vec3(${support.join(', ')});

vec2 sdf(vec3 p) {
  // ── 몸통: 앞으로 숙여 겨눈다
  vec3 b = p;
  float lean = max(b.y - 0.6, 0.0);
  b.z -= 0.22 * lean;
  float torso = sdEllipsoid(b - vec3(0.0, 0.9, 0.0), vec3(0.2, 0.24, 0.14));
  torso = smin(torso, sdEllipsoid(b - vec3(0.0, 0.62, -0.02), vec3(0.19, 0.12, 0.15)), 0.08);
  torso = smin(torso, min(sdSphere(b - vec3(-0.19, 1.05, 0.0), 0.075), sdSphere(b - vec3(0.19, 1.05, 0.0), 0.075)), 0.06);
  // 팔
  vec3 shR = vec3(0.19, 1.05, 0.22 * 0.45);
  vec3 elR = vec3(0.3, 0.86, 0.17);
  vec3 shL = vec3(-0.19, 1.05, 0.22 * 0.45);
  vec3 elL = vec3(-0.19, 0.85, 0.4);
  float arms = sdRoundCone(p, shR, elR, 0.07, 0.055);
  arms = min(arms, sdRoundCone(p, elR, GRIP + vec3(0.02, -0.02, -0.06), 0.055, 0.045));
  arms = min(arms, sdRoundCone(p, shL, elL, 0.07, 0.055));
  arms = min(arms, sdRoundCone(p, elL, SUPPORT + vec3(0.0, -0.04, -0.06), 0.055, 0.045));
  torso = smin(torso, arms, 0.05);
  // ── 다리: 왼무릎 세우고 오른무릎 꿇음
  float legs = sdRoundCone(p, vec3(-0.1, 0.56, 0.0), vec3(-0.15, 0.52, 0.36), 0.1, 0.075);
  legs = min(legs, sdRoundCone(p, vec3(-0.15, 0.52, 0.36), vec3(-0.16, 0.09, 0.38), 0.075, 0.055));
  legs = min(legs, sdRoundBox(p - vec3(-0.16, 0.05, 0.44), vec3(0.055, 0.05, 0.12), 0.04));
  legs = min(legs, sdRoundCone(p, vec3(0.11, 0.55, 0.0), vec3(0.15, 0.08, 0.08), 0.1, 0.075));
  legs = min(legs, sdRoundCone(p, vec3(0.15, 0.08, 0.08), vec3(0.17, 0.08, -0.3), 0.075, 0.055));
  legs = min(legs, sdRoundBox(p - vec3(0.17, 0.07, -0.37), vec3(0.05, 0.06, 0.1), 0.04));
  legs += 0.004 * (fbm3(p * 16.0) - 0.5);
  vec2 r = vec2(smin(torso, legs, 0.05), 3.0);

  // ── 망토: 어깨에서 등 뒤로 바닥까지 늘어진다 (앞은 트임)
  vec3 cq = b - vec3(0.0, 0.0, -0.04);
  float yy = cq.y;
  float cr = mix(0.4, 0.22, smoothstep(0.15, 1.08, yy));
  float ang = atan(cq.z, cq.x);
  cr += 0.025 * sin(ang * 8.0 + yy * 5.0) * (1.0 - smoothstep(0.3, 1.0, yy));
  float cape = (length(cq.xz * vec2(1.0, 1.2)) - cr) * 0.7;
  cape = max(cape, max(0.12 + 0.12 * fbm3(vec3(cq.x * 6.0, 0.0, cq.z * 6.0)) - yy, yy - 1.1));
  // 앞이 열려 팔과 총이 나온다
  cape = max(cape, -(cq.z - 0.02 + 0.25 * (1.1 - yy)));
  cape = abs(cape + 0.015) - 0.015;
  cape = smin(cape, sdEllipsoid(b - vec3(0.0, 1.05, -0.01), vec3(0.27, 0.07, 0.17)), 0.06);
  cape += 0.003 * (fbm3(p * 24.0) - 0.5);
  r = umin(r, vec2(cape, 1.0));

  // ── 두건과 목도리: 얼굴은 어둠
  vec3 hq = p - HEAD;
  hq.yz = rot(0.3) * hq.yz;
  hq.xy = rot(-0.12) * hq.xy;
  // 깊은 두건: 앞으로 길게 나온 챙, 얼굴 자리는 깊이 파였다
  float hood = sdEllipsoid(hq - vec3(0.0, 0.01, -0.01), vec3(0.15, 0.17, 0.16));
  hood = smin(hood, sdRoundCone(hq, vec3(0.0, 0.08, -0.05), vec3(0.0, 0.19, -0.16), 0.1, 0.03), 0.05);
  float face = sdEllipsoid(hq - vec3(0.0, -0.03, 0.15), vec3(0.095, 0.13, 0.16));
  hood = max(hood, -face);
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.02, 0.02), vec3(0.12, 0.14, 0.13)));
  // 목도리: 코 아래를 감아 얼굴 아래쪽을 가렸다
  float scarf = sdEllipsoid(hq - vec3(0.0, -0.1, 0.03), vec3(0.125, 0.065, 0.13));
  scarf = smin(scarf, sdEllipsoid(hq - vec3(0.0, -0.16, 0.0), vec3(0.14, 0.06, 0.13)), 0.04);
  if (scarf < 0.03) scarf += 0.005 * sin(hq.y * 120.0 + 3.0 * noise(hq * 20.0));
  if (hood < 0.03) hood += 0.003 * (fbm3(p * 25.0) - 0.5);
  r = umin(r, vec2(hood, 1.0));
  r = umin(r, vec2(scarf, 9.0));
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, 0.0, -0.035), vec3(0.1, 0.12, 0.1)), 99.0));

  // ── 탄약 띠: 오른 어깨에서 왼 옆구리로
  vec3 bq = b - vec3(0.0, 0.88, 0.0);
  bq.xy = rot(0.75) * bq.xy;
  float band = max(abs(length(bq.xz * vec2(1.0, 1.35)) - 0.215) - 0.01, abs(bq.y) - 0.035);
  vec3 pq = bq;
  pq.x = mod(pq.x + 0.03, 0.06) - 0.03;
  float pouch = sdRoundBox(pq - vec3(0.0, 0.0, 0.0), vec3(0.018, 0.03, 0.2), 0.006);
  pouch = max(pouch, abs(length(bq.xz * vec2(1.0, 1.35)) - 0.225) - 0.018);
  pouch = max(pouch, bq.z);
  r = umin(r, vec2(min(band, pouch), 4.0));

  // ── 화승총: 개머리판은 어깨에, 긴 총신은 앞으로
  vec3 gx = GDIR;
  vec3 gy = normalize(vec3(0.0, 1.0, 0.0) - gx * gx.y);
  vec3 gz = vec3(${GZ.join(', ')});
  vec3 gq = p - BUTT;
  vec3 lq = vec3(dot(gq, gz), dot(gq, gy), dot(gq, gx));
  float stock = sdRoundBox(lq - vec3(0.0, -0.025, 0.13), vec3(0.022, 0.045 - 0.02 * smoothstep(0.0, 0.3, lq.z), 0.14), 0.012);
  stock = smin(stock, sdRoundBox(lq - vec3(0.0, -0.008, 0.42), vec3(0.018, 0.02, 0.16), 0.008), 0.02);
  float barrel = sdCapsule(lq, vec3(0.0, 0.012, 0.25), vec3(0.0, 0.012, 1.02), 0.013);
  barrel = min(barrel, sdCapsule(lq, vec3(0.0, 0.012, 0.98), vec3(0.0, 0.012, 1.03), 0.018));
  float lock = sdRoundBox(lq - vec3(-0.024, 0.0, 0.3), vec3(0.008, 0.02, 0.04), 0.004);
  float serp = sdRoundCone(lq, vec3(-0.03, -0.01, 0.32), vec3(-0.03, 0.037, 0.365), 0.006, 0.005);
  r = umin(r, vec2(stock, 5.0));
  r = umin(r, vec2(min(barrel, min(lock, serp)), 6.0));
  // 불씨
  r = umin(r, vec2(sdSphere(p - MATCH, 0.008), 8.0));
  // 장갑 낀 손
  float hands = sdEllipsoid(p - GRIP, vec3(0.045, 0.05, 0.055));
  hands = min(hands, sdEllipsoid(p - SUPPORT, vec3(0.045, 0.04, 0.055)));
  r = umin(r, vec2(hands, 7.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    float salt = smoothstep(0.62, 0.8, fbm3(p * 9.0));
    vec3 alb = mix(vec3(0.028, 0.034, 0.042), vec3(0.08, 0.085, 0.09), salt * 0.6) * (0.75 + 0.5 * fbm3(p * 3.0));
    return Mat(alb * 0.8, 0.78, 0.15, vec3(0.0), 0.0, 0.0, 0.15);
  }
  if (id < 3.5) return Mat(vec3(0.028, 0.026, 0.024) * (0.7 + 0.6 * fbm3(p * 6.0)), 0.88, 0.1, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 4.5) return Mat(vec3(0.05, 0.032, 0.02), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 5.5) return Mat(vec3(0.06, 0.03, 0.016) * (0.8 + 0.4 * noise(p * vec3(30.0, 30.0, 200.0))), 0.4, 0.7, vec3(0.0), 0.0, 0.0, 0.2);
  if (id < 6.5) return Mat(vec3(0.06, 0.062, 0.066), 0.25, 1.4, vec3(0.0), 0.0, 0.0, 0.4);
  if (id < 7.5) return Mat(vec3(0.025, 0.02, 0.017), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 8.5) return Mat(vec3(0.0), 0.5, 0.2, vec3(3.0, 0.9, 0.2), 0.0, 0.0, 0.0);
  float knit = 0.8 + 0.2 * sin(p.y * 260.0);
  return Mat(vec3(0.045, 0.028, 0.024) * knit, 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.05);
}
`,
  };
}
