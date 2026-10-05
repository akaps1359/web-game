// 달짐승 (5층) — 달의 뒷면에서 온, 눈 없는 두꺼비 같은 회백색 몸뚱이. 주둥이 끝에서 짧은 촉수 다발이 꿈틀댄다.
// 노예를 부리고 고문을 즐긴다. 미끈하게 젖은 회백색 살덩이가 앞으로 무겁게 숙인 채 반쯤 일어섰다.
// 목도 눈도 없이 넓적한 머리가 그대로 뭉툭한 주둥이로 이어지고, 머리를 가로지르는 입술 없는 아가리가 살짝 벌어졌다.
// 주둥이 끝엔 별코두더지처럼 검붉은 짧은 촉수들이 고리로 돋아 떨고, 턱 밑 부푼 울음주머니와 처진 뱃살 위로 점액이 흐른다.
// 한 손엔 끝이 미늘진 고문 갈고리를 꽂은 녹슨 장대, 다른 손은 앞으로 늘어뜨렸다.

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

export default function moonbeast() {
  // ── 몸 타원체 (uA: [중심, k], [반지름, 0]) ──
  const ell = [];
  const E = (c, r, k = 0.25) => ell.push([...c, k], [...r, 0]);
  // 앞으로 엎드려 앞발로 땅을 짚었다: 엉덩이는 높이 뒤로, 머리는 낮게 앞으로
  E([0, 1.05, -0.55], [0.6, 0.55, 0.55], 0.3); // 엉덩이
  E([0, 0.72, -0.2], [0.5, 0.4, 0.5], 0.3); // 처진 뱃살
  E([0, 1.22, 0.12], [0.58, 0.5, 0.5], 0.3); // 가슴
  E([0, 1.55, -0.2], [0.52, 0.36, 0.5], 0.3); // 굽은 등
  E([0, 1.25, 0.66], [0.5, 0.28, 0.42], 0.2); // 넓적한 머리
  E([0, 1.13, 1.02], [0.27, 0.2, 0.28], 0.14); // 뭉툭한 주둥이
  E([0, 0.86, 0.6], [0.34, 0.28, 0.3], 0.16); // 울음주머니
  E([0.6, 0.72, -0.55], [0.3, 0.42, 0.45], 0.2); // 허벅지
  E([-0.6, 0.72, -0.55], [0.3, 0.42, 0.45], 0.2);
  E([0.52, 1.3, 0.3], [0.25, 0.23, 0.25], 0.2); // 어깨
  E([-0.52, 1.3, 0.3], [0.25, 0.23, 0.25], 0.2);
  const nBody = ell.length;
  // ── 사슬 (uB): 팔·다리 (살) → 점액 실 → 장대 ──
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 뒷다리: 두꺼비처럼 접혔다
  for (const sx of [1, -1]) {
    path([[sx * 0.66, 0.7, -0.5], [sx * 0.92, 0.42, -0.05], [sx * 0.85, 0.1, -0.35], [sx * 0.95, 0.05, -0.0]], (t) => 0.2 - 0.14 * t);
    for (let f = 0; f < 3; f++) {
      const a = (f - 1) * 0.5 + (sx > 0 ? 0.3 : -0.3);
      path([[sx * 0.95, 0.05, 0.0], [sx * 0.95 + Math.sin(a) * 0.32, 0.03, 0.0 + Math.cos(a) * 0.32]], (t) => 0.05 - 0.032 * t);
    }
  }
  // 앞팔: 왼쪽은 땅을 짚고, 오른쪽은 장대를 쥐었다
  const handR = [0.86, 1.05, 0.95];
  const handL = [-0.78, 0.07, 0.95];
  path([[0.55, 1.3, 0.3], [0.98, 0.95, 0.5], handR], (t) => 0.16 - 0.08 * t);
  path([[-0.55, 1.3, 0.3], [-0.92, 0.75, 0.5], handL], (t) => 0.16 - 0.08 * t);
  for (const [h, sx, down] of [[handR, 1, 0.2], [handL, -1, 0.1]]) {
    for (let f = 0; f < 3; f++) {
      const a = (f - 1) * 0.55;
      const d = norm([sx * 0.15 + Math.sin(a) * 0.6, -down, 0.75]);
      path([h, add(h, d, 0.17), add(add(h, d, 0.32), [0, -0.06, 0.02])], (t) => 0.048 - 0.042 * t);
    }
  }
  const nSkin = ch.length;
  // 점액 실
  const drips = [
    [0.04, 0.92, 1.2, 0.55],
    [-0.12, 0.95, 1.14, 0.4],
    [0.18, 0.62, 0.72, 0.3],
    [-0.22, 0.6, 0.7, 0.4],
  ];
  for (const [x, y, z, l] of drips) {
    path([[x, y, z], [x + 0.01, y - l * 0.5, z + 0.015], [x, y - l, z + 0.03]], (t) => 0.014 - 0.009 * t);
    ch.push([x, y - l - 0.008, z + 0.03, 0.013], [x, y - l - 0.014, z + 0.03, 0.01]);
    brk();
  }
  const nDrip = ch.length;
  // 녹슨 장대와 미늘 갈고리
  const pole0 = [0.95, 0.0, 1.05];
  const pole1 = [0.75, 2.75, 0.8];
  path([pole0, pole1], () => 0.036);
  const hk = pole1;
  path([add(hk, [0, -0.02, 0]), add(hk, [0.08, 0.18, 0.04]), add(hk, [0.26, 0.22, 0.08]), add(hk, [0.36, 0.06, 0.1]), add(hk, [0.3, -0.1, 0.08])], (t) => 0.034 - 0.028 * t);
  path([add(hk, [0.36, 0.06, 0.1]), add(hk, [0.44, 0.0, 0.1])], (t) => 0.016 - 0.013 * t);
  path([add(hk, [0.05, -0.32, 0.02]), add(hk, [0.17, -0.46, 0.04])], (t) => 0.022 - 0.019 * t);
  path([add(hk, [-0.03, -0.48, -0.01]), add(hk, [-0.14, -0.6, -0.02])], (t) => 0.02 - 0.017 * t);
  const nPole = ch.length;

  return {
    preset: 'act5',
    cam: { pos: [3.5, 0.35, 7.6], target: [0.05, 1.2, 0.2], fov: 1.7 },
    light: {
      key: [-0.6, 0.6, -0.5],
      keyCol: [1.05, 0.95, 1.15],
      fillCol: [0.05, 0.09, 0.12],
      amb: [0.012, 0.012, 0.018],
      rimCol: [0.95, 0.85, 1.15],
      rim: 1.6,
      exposure: 1.15,
      glow: 0.05,
      pt: [0.6, 0.25, 2.0],
      ptCol: [0.9, 0.85, 1.0],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uA: ell, uB: ch, uP: [[nBody, nSkin, nDrip, nPole]] },
    glsl: /* glsl */ `
#define HAS_BG

const vec3 NOSE = vec3(0.0, 1.11, 1.3);

float ellR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = smin(d, sdEllipsoid(p - uA[i].xyz, uA[i + 1].xyz), uA[i].w);
  return d;
}
float chainR(vec3 p, int a, int b, float k) {
  float d = 1e5;
  for (int i = a; i < b - 1; i++) {
    vec4 s0 = uB[i];
    vec4 s1 = uB[i + 1];
    if (s0.w <= 0.0 || s1.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, s0.xyz, s1.xyz, s0.w, s1.w), k);
  }
  return d;
}
// 주둥이 끝 촉수 다발: 뭉툭한 끝 둘레와 그 아래에서 짧고 굵은 것들이 수염처럼 늘어져 꿈틀댄다
float noseTent(vec3 p) {
  vec3 q = p - NOSE;
  if (length(q - vec3(0.0, -0.15, 0.0)) > 0.6) return length(q - vec3(0.0, -0.15, 0.0)) - 0.5;
  float d = 1e5;
  for (int i = 0; i < 26; i++) {
    float fi = float(i);
    float h1 = hash11(fi * 3.7);
    float h2 = hash11(fi * 1.3);
    float h3 = hash11(fi * 5.1);
    float a = fi * 2.39996;
    float rr = 0.05 + 0.11 * sqrt(h1);
    vec3 base = vec3(cos(a) * rr, sin(a) * rr * 0.75 - 0.03, -0.04 - 0.05 * h1);
    vec3 dir = normalize(vec3(cos(a) * 0.5 + (h3 - 0.5) * 0.4, -0.9 + sin(a) * 0.35, 0.55));
    float len = 0.14 + 0.16 * h2;
    vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(0.0, 0.001, 0.0));
    float tw = (h3 - 0.5) * 2.0;
    vec3 m = base + dir * len * 0.5 + side * tw * 0.035;
    vec3 e = base + dir * len - side * tw * 0.05 + vec3(0.0, 0.0, 0.03 * tw);
    d = smin(d, min(sdRoundCone(q, base, m, 0.03, 0.02), sdRoundCone(q, m, e, 0.02, 0.006)), 0.02);
  }
  return d;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.2, 1.3, 0.3)) - 2.4;
  if (bb > 0.5) return vec2(bb, 1.0);
  float body = ellR(p, 0, int(uP[0].x));
  body = smin(body, chainR(p, 0, int(uP[0].y), 0.04), 0.12);
  // 머리를 가로지르는 입술 없는 아가리 (살짝 벌어졌다)
  vec3 mq = p - vec3(0.0, 1.1, 0.86);
  float bodyRaw = body;
  float mcurve = -0.12 * mq.x * mq.x;
  float mouth = max(abs(mq.y - mcurve) - 0.022 * smoothstep(0.5, 0.0, abs(mq.x)), max(abs(mq.x) - 0.48, -mq.z - 0.05));
  body = smax(body, -mouth, 0.02);
  if (body < 0.1) {
    // 늘어진 살 주름과 핏줄, 등에만 드문 혹
    float roll = sin(p.y * 15.0 + 2.5 * noise(p * 2.5) + p.x * 1.5);
    body -= 0.016 * smoothstep(0.4, 1.0, roll) * smoothstep(1.2, 0.3, p.y) * smoothstep(-0.6, 0.1, p.z);
    vec3 g = p * 6.0;
    vec3 c = floor(g);
    vec3 f = fract(g) - 0.5 - (vec3(hash31(c), hash31(c + 3.1), hash31(c + 7.7)) - 0.5) * 0.5;
    float wart = smoothstep(0.35, 0.0, length(f)) * step(0.6, hash31(c + 1.3)) * smoothstep(0.1, -0.3, p.z);
    body -= 0.03 * wart;
    body += 0.008 * (fbm3(p * 6.0) - 0.5);
  }
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(max(max(abs(mq.y - mcurve) - 0.012, max(abs(mq.x) - 0.42, -mq.z + 0.05)), bodyRaw + 0.005), 99.0));
  // 촉수
  float tent = noseTent(p);
  r = umin(r, vec2(smin(tent, body + 0.01, 0.04), 2.0));
  // 점액
  r = umin(r, vec2(chainR(p, int(uP[0].y), int(uP[0].z), 0.01), 3.0));
  // 장대
  r = umin(r, vec2(chainR(p, int(uP[0].z), int(uP[0].w), 0.004), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 회백색 미끈한 살: 잿빛 얼룩, 배와 울음주머니는 더 희고 핏줄이 비친다, 등은 검게 멍들었다
    float m = fbm3(p * 3.0);
    float blotch = smoothstep(0.48, 0.68, fbm3(p * 4.0 + 4.0));
    vec3 alb = mix(vec3(0.17, 0.16, 0.155), vec3(0.27, 0.255, 0.245), m);
    alb = mix(alb, vec3(0.08, 0.075, 0.08), blotch * 0.6);
    float pale = smoothstep(0.0, 0.6, n.z) * smoothstep(1.6, 0.9, p.y);
    float vein = 0.0;
    alb = mix(alb, vec3(0.24, 0.22, 0.22), pale * 0.35);
    alb = mix(alb, vec3(0.16, 0.06, 0.08), vein * 0.6);
    alb *= mix(1.0, 0.55, smoothstep(0.0, -0.6, n.z));
    float snout = smoothstep(0.3, 0.05, length(p - NOSE));
    alb = mix(alb, vec3(0.12, 0.035, 0.045), snout * 0.8);
    return Mat(alb, 0.16, 1.2, vec3(0.0), 0.06, 0.25, 0.95);
  }
  if (id < 2.5) {
    // 검붉은 촉수: 젖었고, 끝은 분홍빛으로 희미하게 빛난다
    float tip = smoothstep(0.12, 0.3, length(p - NOSE));
    vec3 alb = mix(vec3(0.07, 0.015, 0.022), vec3(0.17, 0.045, 0.06), tip);
    return Mat(alb, 0.18, 1.3, vec3(0.3, 0.06, 0.1) * tip * 0.15, 0.0, 0.5, 1.0);
  }
  if (id < 3.5) return Mat(vec3(0.22, 0.21, 0.2), 0.05, 1.8, vec3(0.0), 0.15, 0.8, 1.0);
  // 녹슨 쇠 장대
  float rust = fbm3(p * 18.0);
  return Mat(mix(vec3(0.05, 0.035, 0.025), vec3(0.13, 0.05, 0.02), rust), 0.6, 0.6, vec3(0.0), 0.0, 0.0, 0.1);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.012);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.2, 0.07, 0.26) * pow(fbm3(rd * 3.0), 3.0) * 0.8 + vec3(0.03, 0.08, 0.1) * pow(fbm3(rd * 2.0 + 5.0), 3.0);
  return col;
}
`,
  };
}
