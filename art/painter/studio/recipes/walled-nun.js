// 벽에 갇힌 수녀 (2층) — 수도원이 바쳐지던 밤, 그들은 스스로를 벽 속에 쌓아 넣었다. 회벽 너머의 기도는 아직 끝나지 않았다.
// 무너진 회랑 벽 조각. 떨어져 나간 회벽 자리에서 벽돌에 반쯤 묻힌 수녀의 얼굴이 밀고 나온다 — 잿빛 데스마스크 같은 얼굴,
// 더러워진 흰 두건과 검은 베일. 벽돌 틈으로 모은 두 손이 비어져 나왔고, 다른 틈들에선 또 다른 손들이 더듬는다. 벽 밑엔 몽당 촛불.
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function walledNun() {
  const candles = [
    [-0.32, 0.0, 0.32, 0.07],
    [-0.2, 0.0, 0.38, 0.045],
    [0.28, 0.0, 0.34, 0.06],
  ];
  const flames = candles.map(([x, , z, h]) => [x, h + 0.035, z]);
  return {
    preset: 'act2',
    cam: { pos: [0.75, 0.75, 4.1], target: [0.0, 0.82, 0.0], fov: 1.85 },
    light: {
      key: [-0.5, 0.65, -0.55],
      rim: 1.2,
      fillCol: [0.2, 0.13, 0.06],
      pt: [0.02, 0.62, 0.5],
      ptCol: [1.0, 0.6, 0.25],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uP: candles,
      uL: flames.map((f) => [...f, 0.012]).concat([[0.0, 0.2, 0.45, 0.1]]),
      uLC: flames.map(() => [1.0, 0.75, 0.38, 1.3]).concat([[1.0, 0.6, 0.25, 0.12]]),
    },
    glsl: /* glsl */ `
const vec3 FACE = vec3(0.02, 1.12, 0.095);

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

/** 벽돌 무늬: x = 줄눈까지 거리 */
float brickGap(vec3 p) {
  float row = floor(p.y / 0.13);
  float off = mod(row, 2.0) * 0.14 + hash11(row) * 0.1;
  float bx = abs(fract((p.x + off) / 0.28) - 0.5) * 0.28;
  float by = abs(fract(p.y / 0.13) - 0.5) * 0.13;
  return min(0.14 - bx, 0.065 - by);
}
/** 돌 한 덩이마다 다른 값 */
float brickId(vec3 p) {
  float row = floor(p.y / 0.13);
  float off = mod(row, 2.0) * 0.14 + hash11(row) * 0.1;
  return hash11(floor((p.x + off) / 0.28) * 17.0 + row * 3.1);
}

vec3 faceSpace(vec3 p) {
  vec3 q = p - FACE;
  q.yz = rot(-0.18) * q.yz;
  q.xy = rot(0.1) * q.xy;
  return q;
}

vec2 sdf(vec3 p) {
  float bound = sdBox(p - vec3(0.0, 0.8, 0.05), vec3(0.75, 0.95, 0.5));
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 무너진 벽 조각: 들쭉날쭉 부서진 윤곽
  vec3 wq = p - vec3(0.0, 0.8, -0.08);
  float wall = sdBox(wq, vec3(0.52, 0.8, 0.15));
  float top = 1.5 + 0.12 * fbm3(vec3(p.x * 4.0, 0.0, 1.0)) - 0.2 * smoothstep(0.1, 0.5, p.x) + 0.08 * smoothstep(-0.2, -0.5, p.x);
  wall = max(wall, p.y - top);
  wall = max(wall, abs(p.x) - 0.42 - 0.12 * fbm3(vec3(0.0, p.y * 5.0, 2.0)));
  // 벽돌 줄눈과 깨진 모서리
  float gap = brickGap(p);
  float bid = brickId(p);
  wall += 0.012 * smoothstep(0.016, 0.0, gap) + 0.02 * (bid - 0.5) * step(0.016, gap);
  wall += 0.012 * (fbm3(p * 9.0) - 0.5) + 0.004 * (fbm3(p * 40.0) - 0.5);
  // 회벽: 앞면을 덮었다가 군데군데 떨어져 나갔다
  float plaster = max(wall - 0.018, -wall - 0.02);
  float peel = fbm3(p * 3.5 + 1.0);
  plaster = max(plaster, 0.62 - peel - 0.12 * smoothstep(0.35, 0.1, length((p.xy - FACE.xy) * vec2(1.3, 0.8))));
  plaster = max(plaster, -p.z - 0.06);
  // 수녀가 묻힌 자리: 벽 앞면에 파인 구멍
  float hole = sdEllipsoid(p - vec3(0.02, 1.0, 0.12), vec3(0.19, 0.3, 0.1)) + 0.09 * (fbm3(p * 7.0) - 0.3) + 0.03 * step(0.0, -brickGap(p) + 0.02);
  wall = max(wall, -hole);
  plaster = max(plaster, -hole);
  vec2 r = vec2(wall, 1.0);
  r = umin(r, vec2(plaster, 2.0));

  // ── 수녀: 두건과 베일이 벽돌 속으로 이어진다, 얼굴은 데스마스크처럼
  vec3 fq = faceSpace(p);
  float face = sdEllipsoid(fq - vec3(0.0, 0.0, 0.0), vec3(0.058, 0.075, 0.055));
  vec3 fa = vec3(abs(fq.x), fq.y, fq.z);
  face = smax(face, -sdEllipsoid(fa - vec3(0.024, 0.016, 0.05), vec3(0.018, 0.011, 0.014)), 0.008);
  face = smin(face, sdRoundCone(fq, vec3(0.0, 0.018, 0.052), vec3(0.0, -0.012, 0.064), 0.007, 0.009), 0.008);
  face = smin(face, sdEllipsoid(fa - vec3(0.03, -0.012, 0.04), vec3(0.017, 0.012, 0.015)), 0.012);
  face = smax(face, -sdEllipsoid(fq - vec3(0.0, -0.042, 0.052), vec3(0.011, 0.006, 0.012)), 0.003);
  // 감은 눈꺼풀
  face = smin(face, sdEllipsoid(fa - vec3(0.024, 0.014, 0.047), vec3(0.015, 0.008, 0.008)), 0.004);
  r = umin(r, vec2(face, 3.0));
  r = umin(r, vec2(sdEllipsoid(fq - vec3(0.0, -0.042, 0.045), vec3(0.009, 0.005, 0.008)), 99.0));
  // 흰 두건(윔플): 얼굴을 둘러싸고 목을 덮는다
  float wimple = sdEllipsoid(fq - vec3(0.0, -0.005, -0.02), vec3(0.085, 0.105, 0.07));
  wimple = max(wimple, -sdEllipsoid(fq - vec3(0.0, 0.0, 0.045), vec3(0.06, 0.078, 0.06)));
  // 가슴을 덮는 넓적한 턱받이 (반쯤 벽돌에 묻혔다)
  vec3 bq = fq - vec3(0.0, -0.13, -0.03);
  float bib = sdEllipsoid(bq, vec3(0.13, 0.07, 0.035));
  bib = max(bib, -(fq.z + 0.06));
  wimple = smin(wimple, bib, 0.03);
  // 검은 베일: 이마 위로 덮여 뒤쪽 벽돌 속으로
  float veil = sdEllipsoid(fq - vec3(0.0, 0.03, -0.035), vec3(0.12, 0.12, 0.09));
  veil = max(veil, -sdEllipsoid(fq - vec3(0.0, -0.01, 0.04), vec3(0.075, 0.095, 0.075)));
  veil = max(veil, -(fq.y + 0.04));
  r = umin(r, vec2(wimple, 4.0));
  r = umin(r, vec2(veil, 5.0));

  // ── 벽돌 틈으로 모은 두 손 (기도)
  vec3 hc = vec3(0.03, 0.8, 0.12);
  float hp = sdHand(p, hc + vec3(-0.018, -0.08, -0.03), vec3(0.05, 1.0, 0.25), vec3(-1.0, 0.0, 0.0), 1.1, vec4(0.15, 0.15, 0.18, 0.2), 0.02, 1.0, 0.2);
  hp = min(hp, sdHand(p, hc + vec3(0.018, -0.08, -0.03), vec3(-0.05, 1.0, 0.25), vec3(1.0, 0.0, 0.0), 1.1, vec4(0.15, 0.15, 0.18, 0.2), 0.02, -1.0, 0.2));
  hp = smin(hp, sdRoundCone(p, hc + vec3(0.0, -0.12, -0.1), hc + vec3(0.0, -0.08, -0.03), 0.04, 0.03), 0.02);
  // 다른 틈들에서 뻗어 나온 손: 왼쪽 아래, 오른쪽 위
  float h2 = sdHand(p, vec3(-0.3, 0.52, 0.1), vec3(-0.3, -0.5, 1.0), vec3(0.0, 1.0, 0.3), 1.1, vec4(0.7, 0.8, 0.9, 1.0), 0.15, 1.0, 0.6);
  h2 = smin(h2, sdRoundCone(p, vec3(-0.25, 0.56, -0.05), vec3(-0.3, 0.52, 0.1), 0.035, 0.025), 0.015);
  float h3 = sdHand(p, vec3(0.31, 1.24, 0.1), vec3(0.5, 0.4, 1.0), vec3(0.0, 1.0, -0.3), 1.05, vec4(1.0, 1.1, 1.2, 1.3), 0.12, -1.0, 0.8);
  h3 = smin(h3, sdRoundCone(p, vec3(0.27, 1.2, -0.05), vec3(0.31, 1.24, 0.1), 0.033, 0.024), 0.015);
  float h4 = sdHand(p, vec3(-0.12, 1.36, 0.09), vec3(-0.2, 0.9, 0.6), vec3(0.0, 0.3, 1.0), 0.95, vec4(1.3, 1.35, 1.4, 1.45), 0.1, 1.0, 1.0);
  r = umin(r, vec2(min(min(hp, h2), min(h3, h4)), 3.0));

  // ── 몽당 촛불
  for (int i = 0; i < 3; i++) {
    vec4 c = uP[i];
    vec3 cq = p - c.xyz;
    float cd = sdCappedCone(cq - vec3(0.0, c.w * 0.5, 0.0), c.w * 0.5, 0.026, 0.022);
    cd = smin(cd, sdEllipsoid(cq, vec3(0.05, 0.015, 0.045)), 0.02);
    r = umin(r, vec2(cd, 6.0));
    r = umin(r, vec2(sdCapsule(cq, vec3(0.0, c.w, 0.0), vec3(0.0, c.w + 0.016, 0.0), 0.002), 7.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float ash = smoothstep(0.3, 0.9, n.y + 0.4 * (fbm3(p * 9.0) - 0.5));
  if (id < 1.5) {
    // 그을린 돌벽돌, 줄눈은 더 어둡다
    float gap = brickGap(p);
    float tone = brickId(p);
    vec3 alb = vec3(0.06, 0.056, 0.052) * (0.6 + 0.6 * tone) * (0.65 + 0.55 * fbm3(p * 20.0));
    alb = mix(alb, vec3(0.03, 0.026, 0.022), smoothstep(0.01, 0.0, gap));
    alb = mix(alb, vec3(0.11, 0.105, 0.1), ash * 0.6);
    // 구멍 안쪽은 더 어둡게 (그을음)
    alb *= 0.6 + 0.4 * smoothstep(0.1, 0.35, length((p.xy - vec2(0.02, 1.0)) * vec2(1.4, 0.9)));
    return Mat(alb, 0.92, 0.08, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 갈라진 회벽: 잿빛 흰색, 금, 핏물이 번진 얼룩
    float crack = smoothstep(0.05, 0.0, ridge(p * 12.0)) * 0.7;
    vec3 alb = vec3(0.15, 0.142, 0.13) * (0.75 + 0.35 * fbm3(p * 14.0));
    alb *= 1.0 - crack;
    float stain = smoothstep(0.55, 0.8, fbm3(p * 5.0 + 2.0)) * smoothstep(0.2, 1.2, p.y);
    alb = mix(alb, vec3(0.09, 0.04, 0.03), stain * 0.6);
    return Mat(alb, 0.95, 0.06, vec3(0.0), 0.0, 0.1, 0.0);
  }
  if (id < 3.5) {
    // 잿빛 데스마스크 같은 살갗 (회벽 가루가 묻었다)
    vec3 alb = vec3(0.13, 0.135, 0.14) * (0.8 + 0.3 * fbm3(p * 30.0));
    vec3 sq = faceSpace(p);
    float sock = smoothstep(0.03, 0.01, length(vec2(abs(sq.x) - 0.024, sq.y - 0.015)));
    alb *= 1.0 - 0.6 * sock;
    float dirt = smoothstep(0.5, 0.8, fbm3(p * 12.0));
    alb = mix(alb, vec3(0.08, 0.075, 0.07), dirt * 0.5);
    vec3 fq = faceSpace(p);
    float tear = smoothstep(0.005, 0.0, abs(abs(fq.x) - 0.024 - 0.003 * sin(fq.y * 80.0))) * step(fq.y, 0.008) * smoothstep(-0.075, -0.02, fq.y) * step(0.02, fq.z);
    alb = mix(alb, vec3(0.04, 0.025, 0.022), tear * 0.7);
    return Mat(alb, 0.65, 0.3, vec3(0.0), 0.0, 0.55, 0.05);
  }
  if (id < 4.5) {
    // 더러워진 흰 두건
    vec3 alb = vec3(0.24, 0.235, 0.22) * (0.75 + 0.35 * fbm3(p * 18.0));
    return Mat(alb, 0.9, 0.08, vec3(0.0), 0.0, 0.35, 0.0);
  }
  if (id < 5.5) return Mat(vec3(0.02, 0.018, 0.02) * (0.7 + 0.5 * fbm3(p * 20.0)), 0.8, 0.15, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 6.5) return Mat(vec3(0.2, 0.17, 0.12), 0.35, 0.5, vec3(0.0), 0.0, 0.85, 0.3);
  return Mat(vec3(0.01), 0.9, 0.0, vec3(0.3, 0.12, 0.03), 0.0, 0.0, 0.0);
}
`,
  };
}
