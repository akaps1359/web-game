// 눈먼 펭귄 (3층 일반) — 사람 키만 한 흰 펭귄. 눈이 있어야 할 자리가 매끈한 살갗으로 덮였다.
// 수억 년 어둠 속에서 하얗게 바랜 몸, 누렇게 얼룩진 깃털. 소리 나는 쪽으로 목을 길게 빼고 고개를 비스듬히 꺾었다.
// 반쯤 벌린 긴 부리 안쪽엔 목구멍 쪽으로 누운 가시 돌기가 줄지어 있고, 부리 끝은 핏물로 검붉다.
// 늘어진 지느러미 날개, 갈고리 발톱이 달린 창백한 발.

export default function blindPenguin() {
  const head = [0.12, 1.9, 0.3];
  return {
    preset: 'act3',
    cam: { pos: [-1.2, 0.7, 6.4], target: [0.05, 1.0, 0.0], fov: 1.85 },
    light: {
      key: [0.5, 0.6, -0.65],
      rim: 2.6,
      fillCol: [0.035, 0.05, 0.06],
      amb: [0.014, 0.016, 0.022],
      exposure: 1.2,
      pt: [-0.7, 1.9, 1.3],
      ptCol: [0.22, 0.25, 0.3],
    },
    frame: { fill: 0.92 },
    glsl: /* glsl */ `
const vec3 HEAD = vec3(${head.join(', ')});

vec3 headLocal(vec3 p) {
  vec3 hq = p - HEAD;
  hq.xz = rot(-1.15) * hq.xz;   // 소리 나는 쪽(오른쪽)으로 돌린 고개
  hq.xy = rot(0.5) * hq.xy;     // 비스듬히 꺾은 고개
  hq.yz = rot(0.18) * hq.yz;
  return hq;
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  // 몸을 조금 앞으로 기울인다
  b.z -= 0.2 * max(b.y - 0.6, 0.0) * max(b.y - 0.6, 0.0);
  // ── 몸통: 아래가 무겁게 처진 물방울꼴
  float body = sdEllipsoid(b - vec3(0.0, 0.62, 0.0), vec3(0.33, 0.58, 0.31));
  body = smin(body, sdEllipsoid(b - vec3(0.0, 1.12, 0.0), vec3(0.24, 0.44, 0.23)), 0.2);
  // 처진 배
  body = smin(body, sdEllipsoid(b - vec3(0.0, 0.42, 0.07), vec3(0.33, 0.33, 0.31)), 0.12);
  // 길게 뺀 목
  vec3 nk = vec3(-0.02, 1.62, 0.02);
  float neck = sdRoundCone(p, vec3(0.0, 1.3, 0.06), nk, 0.17, 0.105);
  neck = smin(neck, sdRoundCone(p, nk, HEAD + vec3(-0.04, -0.07, -0.03), 0.105, 0.08), 0.06);
  // 목에서 곤두선 깃털
  neck += 0.012 * (fbm3(p * vec3(26.0, 9.0, 26.0)) - 0.5);
  body = smin(body, neck, 0.12);
  // 꼬리깃
  body = smin(body, sdRoundCone(b, vec3(0.0, 0.2, -0.22), vec3(0.0, 0.03, -0.4), 0.09, 0.03), 0.08);
  // 깃털 결: 비늘처럼 겹친 짧은 깃 + 아래로 흐르는 결, 엉겨 붙은 덩어리
  float clump = fbm3(b * vec3(18.0, 6.0, 18.0));
  body += 0.012 * (clump - 0.5) + 0.004 * (noise(b * vec3(60.0, 10.0, 60.0)) - 0.5) + 0.014 * (noise(b * 5.0) - 0.5);
  // 털갈이로 빠진 자리: 맨살이 드러나 살짝 꺼졌다
  float molt = smoothstep(0.62, 0.72, fbm3(b * 3.2 + 7.0));
  body += 0.006 * molt;

  // ── 머리: 눈이 있던 자리는 매끈하게 덮였다
  vec3 hq = headLocal(p);
  float hd = sdEllipsoid(hq, vec3(0.105, 0.105, 0.13));
  hd = smin(hd, sdEllipsoid(hq - vec3(0.0, -0.05, -0.02), vec3(0.09, 0.07, 0.11)), 0.05);
  vec3 eq = hq;
  eq.x = abs(eq.x);
  // 눈자리: 얕게 꺼졌다가 가운데가 살짝 부푼 흉터
  hd = smax(hd, -sdEllipsoid(eq - vec3(0.1, 0.018, 0.04), vec3(0.026, 0.032, 0.038)), 0.02);
  hd += 0.002 * sin(eq.y * 300.0 + eq.z * 120.0) * smoothstep(0.05, 0.0, length(eq - vec3(0.095, 0.018, 0.04)));
  body = smin(body, hd, 0.07);
  vec2 r = vec2(body, 1.0);
  float scar = sdEllipsoid(eq - vec3(0.09, 0.015, 0.04), vec3(0.024, 0.03, 0.036));
  if (scar < 0.004 && hd < 0.01) r.y = 2.0;

  // ── 부리: 위아래 부리가 벌어졌다. 아래로 살짝 휜 긴 부리
  float up = 1e5;
  float lo = 1e5;
  for (int i = 0; i < 5; i++) {
    float t0 = float(i) / 5.0;
    float t1 = float(i + 1) / 5.0;
    vec3 a0 = vec3(0.0, -0.005 - 0.07 * t0 * t0, 0.09 + 0.27 * t0);
    vec3 a1 = vec3(0.0, -0.005 - 0.07 * t1 * t1, 0.09 + 0.27 * t1);
    up = min(up, sdRoundCone(hq, a0, a1, mix(0.045, 0.006, t0), mix(0.045, 0.006, t1)));
    vec3 b0 = vec3(0.0, -0.055 - 0.08 * t0 - 0.02 * t0 * t0, 0.08 + 0.23 * t0);
    vec3 b1 = vec3(0.0, -0.055 - 0.08 * t1 - 0.02 * t1 * t1, 0.08 + 0.23 * t1);
    lo = min(lo, sdRoundCone(hq, b0, b1, mix(0.034, 0.005, t0), mix(0.034, 0.005, t1)));
  }
  up = max(up, -(hq.y + 0.035 + 0.06 * max(hq.z - 0.1, 0.0)));
  up *= 1.0;
  lo = max(lo, hq.y + 0.035 + 0.12 * max(hq.z - 0.1, 0.0) - 0.0);
  float beak = min(up, lo) * 0.9;
  r = umin(r, vec2(beak, 3.0));
  // 벌린 입 속: 어둠 + 목구멍 쪽으로 누운 가시 돌기
  float mouth = sdEllipsoid(hq - vec3(0.0, -0.05, 0.14), vec3(0.03, 0.022, 0.1));
  r = umin(r, vec2(mouth, 99.0));
  float spines = 1e5;
  for (int i = 0; i < 6; i++) {
    float z = 0.1 + float(i) * 0.03;
    for (int s = 0; s < 2; s++) {
      float sx = s == 0 ? 0.012 : -0.012;
      vec3 a = vec3(sx, -0.068 - 0.04 * (z - 0.08), z);
      spines = min(spines, sdRoundCone(hq, a, a + vec3(sx * 0.4, 0.016, -0.022), 0.0035, 0.0006));
      vec3 c = vec3(sx * 1.2, -0.03 - 0.03 * (z - 0.08), z);
      spines = min(spines, sdRoundCone(hq, c, c + vec3(sx * 0.4, -0.014, -0.02), 0.003, 0.0006));
    }
  }
  r = umin(r, vec2(spines, 4.0));

  // ── 지느러미 날개: 늘어지고 끝이 조금 벌어졌다
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? 1.0 : -1.0;
    vec3 sh = vec3(0.25 * sg, 1.2, 0.0);
    vec3 tp = vec3(0.5 * sg, 0.62, -0.22);
    vec3 ax = normalize(tp - sh);
    vec3 fq = p - sh;
    float t = clamp(dot(fq, ax) / length(tp - sh), 0.0, 1.0);
    vec3 cpt = sh + (tp - sh) * t;
    vec3 off = p - cpt;
    vec3 nrm = normalize(vec3(sg, 0.0, 0.25));
    float th = mix(0.028, 0.008, t);
    float wd = mix(0.045, 0.012, t * t) + 0.022 * sin(t * 3.14159);
    float fl = length(vec2(max(abs(dot(off, nrm)) - th, 0.0), max(length(off - nrm * dot(off, nrm)) - wd, 0.0))) - 0.01;
    fl = max(fl, -0.02 - dot(p - sh, ax));
    r.x = smin(r.x, fl, 0.05);
  }

  // ── 발: 창백한 물갈퀴 발, 검은 갈고리 발톱
  float feet = 1e5;
  float claws = 1e5;
  for (int s = 0; s < 2; s++) {
    float sg = s == 0 ? 1.0 : -1.0;
    vec3 f = vec3(0.13 * sg, 0.0, 0.14);
    feet = min(feet, sdEllipsoid(p - f - vec3(0.0, 0.035, 0.0), vec3(0.075, 0.035, 0.08)));
    for (int k = 0; k < 3; k++) {
      float a = (float(k) - 1.0) * 0.45 + sg * 0.1;
      vec3 d = vec3(sin(a), 0.0, cos(a));
      vec3 t0 = f + vec3(0.0, 0.03, 0.0) + d * 0.04;
      vec3 t1 = t0 + d * 0.1 + vec3(0.0, -0.012, 0.0);
      feet = smin(feet, sdRoundCone(p, t0, t1, 0.022, 0.014), 0.03);
      claws = min(claws, sdRoundCone(p, t1, t1 + d * 0.045 + vec3(0.0, -0.022, 0.0), 0.011, 0.002));
    }
  }
  r = umin(r, vec2(feet, 5.0));
  r = umin(r, vec2(claws, 6.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 바랜 흰 깃털: 누런 얼룩, 아랫배와 부리 밑은 핏물·때로 검다
    float v = fbm3(p * 6.0);
    float streak = fbm3(p * vec3(30.0, 4.0, 30.0));
    vec3 alb = vec3(0.3, 0.3, 0.28) * (0.8 + 0.3 * v) * (0.85 + 0.25 * streak);
    alb = mix(alb, vec3(0.2, 0.17, 0.11), smoothstep(0.45, 0.75, fbm3(p * 3.0 + 4.0)) * 0.6);
    alb = mix(alb, vec3(0.08, 0.06, 0.045), smoothstep(0.35, 0.0, p.y) * 0.7);
    // 가슴의 검붉은 핏자국 (먹이를 쪼아 먹은)
    vec3 hq = headLocal(p);
    float blood = smoothstep(0.45, 0.7, fbm3(p * 9.0)) * smoothstep(0.55, 0.0, length((p - vec3(0.1, 1.45, 0.25)) * vec3(1.4, 0.8, 1.0)));
    alb = mix(alb, vec3(0.07, 0.012, 0.01), blood);
    // 부리에서 흘러내린 핏물 줄기
    float drip = smoothstep(0.75, 0.95, noise(vec3(p.x * 40.0, p.y * 2.0, p.z * 40.0))) * smoothstep(0.7, 1.5, p.y) * step(0.0, p.z + p.x * 0.3);
    alb = mix(alb, vec3(0.08, 0.015, 0.012), drip * 0.8);
    blood = max(blood, drip * 0.6);
    float frost = smoothstep(0.65, 0.95, n.y);
    alb = mix(alb, vec3(0.34, 0.38, 0.44), frost * 0.5);
    vec3 bb = p;
    bb.z -= 0.2 * max(bb.y - 0.6, 0.0) * max(bb.y - 0.6, 0.0);
    float molt = smoothstep(0.62, 0.7, fbm3(bb * 3.2 + 7.0));
    float goose = 0.8 + 0.2 * noise(p * 120.0);
    alb = mix(alb, vec3(0.2, 0.13, 0.13) * goose, molt);
    return Mat(alb, mix(0.8 - blood * 0.5, 0.45, molt), 0.15 + blood * 0.8 + molt * 0.4, vec3(0.0), 0.0, 0.25 + molt * 0.5, blood * 0.8 + molt * 0.3);
  }
  if (id < 2.5) {
    // 눈자리를 덮은 맨살: 창백한 분홍빛 회색, 번들거린다
    return Mat(vec3(0.12, 0.09, 0.1) * (0.7 + 0.5 * noise(p * 200.0)), 0.35, 0.7, vec3(0.0), 0.0, 0.6, 0.7);
  }
  if (id < 3.5) {
    // 부리: 검은 각질, 끝은 핏물에 젖었다
    vec3 hq = headLocal(p);
    float tip = smoothstep(0.2, 0.33, hq.z);
    vec3 alb = mix(vec3(0.035, 0.032, 0.03), vec3(0.12, 0.02, 0.012), tip * 0.8);
    alb = mix(alb, vec3(0.16, 0.13, 0.09), smoothstep(0.14, 0.09, hq.z) * 0.6);
    return Mat(alb, 0.3, 0.9, vec3(0.0), 0.0, 0.0, 0.5 + tip * 0.5);
  }
  if (id < 4.5) return Mat(vec3(0.2, 0.08, 0.08), 0.4, 0.5, vec3(0.0), 0.0, 0.6, 0.8);
  if (id < 5.5) {
    // 창백한 발: 갈라진 살갗
    float crack = smoothstep(0.06, 0.0, ridge(p * 40.0));
    return Mat(vec3(0.2, 0.15, 0.14) * (1.0 - crack * 0.4), 0.55, 0.4, vec3(0.0), 0.0, 0.6, 0.3);
  }
  return Mat(vec3(0.02), 0.25, 1.0, vec3(0.0), 0.0, 0.0, 0.6);
}
`,
  };
}
