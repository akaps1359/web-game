// 성수반의 손 (2층) — 세례반엔 재와 피를 갠 검은 것이 고여 있다. 그 속에서 손들이 뻗어 나와 세례받을 자를 더듬는다.
// 금 간 팔각 돌 세례반. 넘칠 듯 고인 검붉은 액체가 번들거리고, 그 아래에서 핏빛이 희미하게 비친다.
// 깡마른 잿빛 팔들이 액체 속에서 솟아 가장자리 너머로 손을 뻗는다. 팔에선 검은 것이 흘러내린다.
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const add = (a, b) => a.map((v, i) => v + b[i]);

export default function fontHands() {
  // 팔: [뿌리(액면 아래), 팔꿈치, 손목, 손가락 방향, 손등 방향, 굽힘]
  const arms = [
    [[0.05, 0.8, 0.0], [0.12, 1.22, 0.04], [0.22, 1.4, 0.3], [0.15, -0.35, 1.0], [0.0, 1.0, 0.3], 1.0],
    [[-0.12, 0.8, 0.05], [-0.36, 1.06, 0.14], [-0.5, 0.94, 0.38], [-0.35, -0.6, 1.0], [0.0, 1.0, 0.5], 0.75],
    [[0.15, 0.8, -0.05], [0.4, 1.02, 0.04], [0.55, 0.88, 0.24], [0.35, -0.7, 1.0], [0.0, 1.0, 0.5], 0.7],
    [[0.0, 0.8, 0.14], [0.02, 0.99, 0.34], [-0.02, 0.92, 0.49], [0.0, -1.0, 0.35], [0.0, 0.3, -1.0], 0.85],
    [[-0.08, 0.8, -0.1], [-0.24, 1.28, -0.06], [-0.14, 1.56, 0.12], [0.1, 0.6, 1.0], [0.0, 0.6, -0.8], 0.25],
    [[0.2, 0.8, 0.15], [0.33, 0.93, 0.33], [0.4, 0.96, 0.47], [0.2, -0.2, 1.0], [0.0, 1.0, 0.2], 1.25],
  ];
  return {
    preset: 'act2',
    cam: { pos: [0.4, 1.2, 4.2], target: [0.0, 0.85, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.3,
      fillCol: [0.2, 0.1, 0.05],
      pt: [0.0, 0.92, 0.1],
      ptCol: [1.3, 0.18, 0.08],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: {
      uA: arms.flatMap(([r, e, w, f, u, c]) => [[...r, c], [...e, 0], [...w, 0], [...f, 0], [...u, 0]]),
    },
    glsl: /* glsl */ `
const float LIQ = 0.84;

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
    float len = (0.056 - abs(fi + 0.4) * 0.007) * s;
    float r = 0.0082 * s;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.8), 0.003 * s);
      d = min(d, sdSphere(p - a, r * 1.13));
      a = b;
      r *= 0.84;
      len *= 0.82;
      dd = normalize(dd - u * cu * 0.8);
    }
  }
  vec3 ta = pc - f * 0.02 * s + sd * 0.03 * s - u * 0.006 * s;
  vec3 tb = ta + normalize(f * 0.6 + sd * 0.7 - u * 0.3) * 0.04 * s;
  vec3 tc3 = tb + normalize(f * 0.9 - sd * tc * 0.6 - u * tc * 0.5) * 0.032 * s;
  d = smin(d, sdRoundCone(p, ta, tb, 0.0105 * s, 0.0085 * s), 0.008 * s);
  d = smin(d, sdRoundCone(p, tb, tc3, 0.0085 * s, 0.0065 * s), 0.004 * s);
  return d;
}

/** 팔각 기둥 단면 거리 */
float oct(vec2 q, float r) {
  q = abs(q);
  return max(max(q.x, q.y), (q.x + q.y) * 0.7071) - r;
}

float arm(vec3 p, vec4 r0, vec4 e, vec4 w, vec4 f, vec4 u) {
  float d = sdRoundCone(p, r0.xyz, e.xyz, 0.048, 0.034);
  d = smin(d, sdRoundCone(p, e.xyz, w.xyz, 0.034, 0.024), 0.02);
  d = smin(d, sdEllipsoid(p - mix(e.xyz, w.xyz, 0.3), vec3(0.036)), 0.03);
  d = smin(d, sdSphere(p - e.xyz, 0.037), 0.02);
  float cu = r0.w;
  d = smin(d, sdHand(p, w.xyz, f.xyz, u.xyz, 1.3, vec4(cu, cu * 1.05, cu * 1.1, cu * 1.15), 0.2, 1.0, cu * 0.6), 0.015);
  return d;
}

vec2 sdf(vec3 p) {
  float bound = sdBox(p - vec3(0.0, 0.85, 0.1), vec3(0.75, 0.9, 0.7));
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 팔각 세례반: 받침·기둥·대야
  float plinth = max(oct(p.xz, 0.3), abs(p.y - 0.05) - 0.05);
  plinth = min(plinth, max(oct(p.xz, 0.24), abs(p.y - 0.13) - 0.03));
  float column = max(oct(p.xz, 0.15), abs(p.y - 0.4) - 0.3);
  float yb = clamp((p.y - 0.62) / 0.28, 0.0, 1.0);
  float bowlR = mix(0.26, 0.45, sqrt(yb));
  float bowl = max(oct(p.xz, bowlR), abs(p.y - 0.76) - 0.14);
  float inner = max(oct(p.xz, bowlR - 0.06), -(p.y - 0.7));
  bowl = max(bowl, -inner);
  // 가장자리 띠와 깨진 이
  bowl = min(bowl, max(abs(oct(p.xz, 0.455)) - 0.012, abs(p.y - 0.88) - 0.025));
  float stone = min(min(plinth, column), bowl);
  // 금: 바깥 면을 가르는 갈라진 틈
  stone += 0.012 * smoothstep(0.04, 0.0, ridge(p * vec3(6.0, 3.0, 6.0))) * smoothstep(0.2, 0.6, p.y);
  stone += 0.006 * (fbm3(p * 14.0) - 0.5);
  vec2 r = vec2(stone, 1.0);
  // ── 검붉은 액체: 대야를 채우고 가장자리로 흘러넘쳤다
  float ripple = 0.006 * sin(length(p.xz) * 60.0 - 2.0) * smoothstep(0.4, 0.1, length(p.xz));
  float liquid = max(p.y - LIQ - ripple, oct(p.xz, bowlR - 0.055));
  liquid = max(liquid, -(p.y - 0.7));
  // 넘쳐 흐른 줄기
  for (int i = 0; i < 6; i++) {
    float a = float(i) * 1.05 + 0.4;
    vec3 d0 = vec3(cos(a) * 0.46, 0.9, sin(a) * 0.46);
    float len = 0.2 + 0.25 * fract(sin(float(i) * 7.7) * 437.0);
    vec3 d1 = vec3(cos(a) * (0.38 - len * 0.2), 0.9 - len, sin(a) * (0.38 - len * 0.2));
    liquid = smin(liquid, sdRoundCone(p, d0, d1, 0.016, 0.009), 0.015);
  }
  r = umin(r, vec2(liquid, 2.0));
  // ── 액체 속에서 솟은 팔들
  float arms = 1e5;
  for (int i = 0; i < 6; i++) {
    int k = i * 5;
    arms = min(arms, arm(p, uA[k], uA[k + 1], uA[k + 2], uA[k + 3], uA[k + 4]));
  }
  arms += 0.0015 * (fbm3(p * 60.0) - 0.5);
  r = umin(r, vec2(arms, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float ash = smoothstep(0.3, 0.9, n.y + 0.4 * (fbm3(p * 9.0) - 0.5));
  if (id < 1.5) {
    // 그을린 회색 돌, 흘러내린 검붉은 얼룩
    vec3 alb = vec3(0.075, 0.07, 0.065) * (0.6 + 0.6 * fbm3(p * 12.0));
    float stain = smoothstep(0.5, 0.75, noise(vec3(p.x * 30.0, p.y * 3.0, p.z * 30.0))) * smoothstep(0.92, 0.5, p.y);
    alb = mix(alb, vec3(0.03, 0.006, 0.005), stain * 0.8);
    alb = mix(alb, vec3(0.11, 0.105, 0.1), ash * 0.5);
    return Mat(alb, 0.85, 0.12, vec3(0.0), 0.0, 0.0, stain * 0.3);
  }
  if (id < 2.5) {
    // 재와 피를 갠 검은 것: 번들거리고, 표면 아래로 핏빛이 비친다
    float glow = smoothstep(0.35, 0.8, fbm3(p * 9.0 + vec3(0.0, 0.0, 2.0))) * smoothstep(0.82, 0.86, p.y);
    vec3 emi = vec3(0.9, 0.06, 0.03) * glow * 0.6;
    return Mat(vec3(0.02, 0.004, 0.004), 0.08, 1.6, emi, 0.15, 0.0, 1.0);
  }
  // 잿빛 팔: 액면 근처는 검은 것에 젖었다
  float wet = smoothstep(1.05, 0.85, p.y) + smoothstep(0.55, 0.8, noise(vec3(p.x * 40.0, p.y * 6.0, p.z * 40.0))) * smoothstep(1.4, 1.0, p.y);
  wet = clamp(wet, 0.0, 1.0);
  vec3 alb = vec3(0.12, 0.115, 0.11) * (0.7 + 0.5 * fbm3(p * 25.0));
  alb = mix(alb, vec3(0.025, 0.005, 0.005), wet);
  return Mat(alb, mix(0.6, 0.12, wet), mix(0.3, 1.4, wet), vec3(0.0), 0.0, 0.5 * (1.0 - wet), wet);
}
`,
  };
}
