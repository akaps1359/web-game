// 해부된 썰매개 (3층 일반) — 탐사대의 허스키. 고대인이 정교하게 갈랐다가 다시 꿰맸다. 사람의 솜씨가 아니다.
// 등은 검회색, 배와 얼굴은 흰 털의 썰매개. 가까운 옆구리는 털이 자로 잰 듯 네모나게 깎였고,
// 앞다리 뒤에서 엉덩이까지 길게 갈린 자리를 촘촘하고 고른 검은 실밥이 꿰맸다. 목도 한 바퀴 꿰맨 자국.
// 머리를 낮추고 이를 드러냈다. 두 눈은 핏빛으로 빛난다. 등털엔 서리.
// 몸·다리·머리 구조는 1층 들개(dog.js)의 방식을 따랐다.
const YAW = 2.05;
function toWorld([x, y, z]) {
  const c = Math.cos(YAW);
  const s = Math.sin(YAW);
  return [c * x - s * z, y, s * x + c * z];
}
const H = [0.62, 0.47, 0.0];
const HS = 1.25;

export default function sledDog() {
  const eyeL = toWorld([H[0] + 0.068 * HS, H[1] + 0.026 * HS, -0.047 * HS]);
  const eyeR = toWorld([H[0] + 0.068 * HS, H[1] + 0.026 * HS, 0.047 * HS]);
  const cam = [1.15, 0.32, 3.1];
  const look = (e) => {
    const g = [cam[0] - e[0], cam[1] - e[1], cam[2] - e[2]];
    const l = Math.hypot(...g);
    return g.map((v) => v / l);
  };
  return {
    preset: 'act3',
    cam: { pos: cam, target: [0.0, 0.36, 0.0], fov: 1.9 },
    light: {
      key: [-0.35, 0.65, -0.68],
      rim: 2.2,
      fillCol: [0.06, 0.1, 0.11],
      amb: [0.018, 0.024, 0.032],
      eyeEmit: 1.8,
      glow: 0.07,
      exposure: 1.2,
      pt: toWorld([0.0, 0.25, -0.55]),
      ptCol: [0.22, 0.26, 0.3],
    },
    frame: { fill: 0.92 },
    arrays: {
      uE: [
        [...eyeL, 0.017],
        [...eyeR, 0.017],
      ],
      uG: [
        [...look(eyeL), 3],
        [...look(eyeR), 3],
      ],
    },
    glsl: /* glsl */ `
const float YAW = ${YAW};
const vec3 H = vec3(${H.join(', ')});
const float HS = ${HS};

float spineY(float x) {
  float t = (x + 0.1) / 0.5;
  return 0.64 + 0.03 * (1.0 - t * t);
}

float leg(vec3 q, vec3 a, vec3 b, vec3 c, vec3 d, float r0, float r1, float r2, float r3) {
  float l = sdRoundCone(q, a, b, r0, r1);
  l = min(l, sdRoundCone(q, b, c, r1 * 0.85, r2));
  l = min(l, sdRoundCone(q, c, d, r2 * 0.9, r3));
  l = smin(l, sdSphere(q - b, r1 * 1.02), 0.015);
  vec3 f = d + vec3(0.022, -0.012, 0.0);
  float paw = sdEllipsoid(q - f, vec3(0.036, 0.02, 0.03));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.014;
    paw = smin(paw, sdSphere(q - f - vec3(0.026 - abs(o) * 0.5, -0.004, o), 0.011), 0.006);
  }
  return smin(l, paw, 0.02);
}

/** 옆구리 절개선 (가까운 쪽 z<0): 앞다리 뒤에서 엉덩이까지. x를 따라 y가 완만히 휜다 */
float cutY(float x) { return 0.43 + 0.035 * sin((x + 0.3) * 5.0) - 0.04 * (x - 0.1); }
float cutLine(vec3 q) {
  if (q.z > 0.0 || q.x < -0.42 || q.x > 0.2) return 1.0;
  return abs(q.y - cutY(q.x));
}

/** 실밥: 절개선을 가로지르는 짧은 땀 (0~1) */
float stitch(vec3 q) {
  if (q.z > 0.0 || q.x < -0.41 || q.x > 0.19) return 0.0;
  float k = fract(q.x / 0.024 + 0.5) - 0.5;
  float across = smoothstep(0.016, 0.01, abs(q.y - cutY(q.x)));
  return smoothstep(0.14, 0.06, abs(k + (q.y - cutY(q.x)) * 6.0)) * across;
}
/** 깎인 털: 절개선 둘레의 네모난 맨살 */
float shaved(vec3 q) {
  if (q.z > 0.0) return 0.0;
  float bx = smoothstep(-0.47, -0.45, q.x) * smoothstep(0.25, 0.23, q.x);
  float by = smoothstep(0.08, 0.06, abs(q.y - cutY(q.x)) + 0.012 * (noise(q * 60.0) - 0.5));
  return bx * by * smoothstep(0.0, -0.03, q.z);
}
/** 목을 한 바퀴 꿰맨 자국 */
float neckSeam(vec3 q) {
  vec3 c = vec3(0.47, 0.51, 0.0);
  vec3 ax = normalize(vec3(1.0, -0.35, 0.0));
  return abs(dot(q - c, ax)) + step(0.17, length(q - c)) * 1.0;
}

vec2 sdf(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  float bound = sdBox(q - vec3(0.12, 0.4, 0.0), vec3(0.9, 0.48, 0.34));
  if (bound > 0.15) return vec2(bound, 1.0);

  // ── 몸통: 깊은 가슴, 단단한 허리
  float chest = sdEllipsoid(q - vec3(0.14, 0.47, 0.0), vec3(0.27, 0.19, 0.135));
  float waist = sdRoundCone(q, vec3(-0.02, 0.52, 0.0), vec3(-0.3, 0.55, 0.0), 0.105, 0.085);
  float hip = sdEllipsoid(q - vec3(-0.38, 0.53, 0.0), vec3(0.14, 0.12, 0.11));
  float body = smin(chest, waist, 0.08);
  body = smin(body, hip, 0.07);
  body = smin(body, sdEllipsoid(q - vec3(0.0, spineY(0.0) - 0.05, 0.0), vec3(0.42, 0.06, 0.08)), 0.08);

  // ── 목과 갈기
  float neck = sdRoundCone(q, vec3(0.28, 0.55, 0.0), vec3(H.x - 0.05, H.y + 0.01, 0.0), 0.12, 0.08);
  body = smin(body, neck, 0.07);

  // ── 다리 (가까운 쪽 z<0)
  float legs = leg(q, vec3(0.25, 0.47, -0.08), vec3(0.19, 0.29, -0.09), vec3(0.22, 0.1, -0.085), vec3(0.25, 0.035, -0.085), 0.055, 0.03, 0.021, 0.018);
  legs = min(legs, leg(q, vec3(0.25, 0.47, 0.08), vec3(0.25, 0.29, 0.095), vec3(0.32, 0.1, 0.1), vec3(0.36, 0.035, 0.1), 0.055, 0.03, 0.021, 0.018));
  legs = min(legs, leg(q, vec3(-0.38, 0.5, -0.08), vec3(-0.26, 0.31, -0.1), vec3(-0.43, 0.15, -0.095), vec3(-0.4, 0.035, -0.09), 0.075, 0.034, 0.022, 0.018));
  legs = min(legs, leg(q, vec3(-0.38, 0.5, 0.08), vec3(-0.31, 0.3, 0.1), vec3(-0.5, 0.16, 0.095), vec3(-0.48, 0.035, 0.09), 0.075, 0.034, 0.022, 0.018));
  body = smin(body, legs, 0.05);

  // ── 등 위로 말아 올린 꼬리 (털이 풍성하다)
  float tail = 1e5;
  for (int i = 0; i < 6; i++) {
    float t0 = float(i) / 6.0;
    float t1 = float(i + 1) / 6.0;
    vec3 a = vec3(-0.5 - 0.1 * sin(t0 * 2.6), 0.6 + 0.22 * sin(t0 * 2.2), 0.03 * t0);
    vec3 b = vec3(-0.5 - 0.1 * sin(t1 * 2.6), 0.6 + 0.22 * sin(t1 * 2.2), 0.03 * t1);
    a.x += 0.18 * t0 * t0;
    b.x += 0.18 * t1 * t1;
    tail = min(tail, sdRoundCone(q, a, b, mix(0.04, 0.03, t0), mix(0.04, 0.03, t1)));
  }
  body = smin(body, tail, 0.04);

  // ── 머리: 낮게 숙였고 입술이 말려 올라갔다, 곧게 선 귀
  vec3 hq = (q - H) / HS;
  float head = 1e5;
  if (length(hq) < 0.4) {
    float skull = sdEllipsoid(hq, vec3(0.088, 0.072, 0.07));
    vec3 aq = vec3(hq.x, hq.y, abs(hq.z));
    float brow = sdEllipsoid(aq - vec3(0.055, 0.035, 0.035), vec3(0.03, 0.02, 0.025));
    float cheek = sdEllipsoid(aq - vec3(0.02, -0.03, 0.045), vec3(0.045, 0.036, 0.024));
    // 눈두덩
    float sock = sdSphere(aq - vec3(0.068, 0.026, 0.047), 0.02);
    float snout = sdRoundCone(hq, vec3(0.07, -0.012, 0.0), vec3(0.195, -0.038, 0.0), 0.044, 0.026);
    snout -= 0.004 * smoothstep(0.3, 0.7, sin(hq.x * 160.0)) * smoothstep(0.08, 0.15, hq.x) * step(0.0, hq.y + 0.01);
    float jaw = sdRoundCone(hq, vec3(0.04, -0.075, 0.0), vec3(0.15, -0.115, 0.0), 0.032, 0.017);
    head = smin(skull, brow, 0.02);
    head = smin(head, cheek, 0.03);
    head = smin(head, snout, 0.035);
    vec3 mq = hq - vec3(0.11, -0.07, 0.0);
    mq.xy = rot(0.18) * mq.xy;
    float mouth = sdEllipsoid(mq, vec3(0.1, 0.011, 0.04));
    head = smax(head, -mouth, 0.01);
    head = smin(head, jaw, 0.018);
    head = smax(head, -mouth, 0.006);
    // 곧게 선 세모 귀
    vec3 eaq = aq - vec3(-0.03, 0.06, 0.045);
    float ear = sdRoundCone(aq, vec3(-0.03, 0.055, 0.045), vec3(-0.05, 0.14, 0.06), 0.03, 0.004);
    ear = max(ear, abs(dot(eaq, normalize(vec3(0.35, -0.1, 0.0)))) - 0.012);
    head = smin(head, ear, 0.015);
    head = smax(head, -sock, 0.008);
    head += 0.004 * (fbm3(q * 40.0) - 0.5);
    head *= HS;
  }
  body = smin(body, head, 0.05);

  // ── 털: 몸을 따라 흐르는 결, 목 갈기는 두껍게. 깎인 자리는 맨살
  float sh = shaved(q);
  float ruff = smoothstep(0.12, 0.0, length((q - vec3(0.36, 0.5, 0.0)) * vec3(1.0, 1.3, 0.8)) - 0.08);
  if (body < 0.05) {
    float strand = noise(q * vec3(25.0, 70.0, 70.0));
    float clump = fbm3(q * vec3(9.0, 16.0, 16.0));
    float tailZ = smoothstep(-0.4, -0.5, q.x) * smoothstep(0.58, 0.68, q.y);
    float furAmp = (0.012 + 0.02 * ruff + 0.02 * tailZ) * (1.0 - sh);
    body -= furAmp * (0.6 * clump + 0.4 * strand);
    // 절개 홈과 실밥
    float cl = cutLine(q);
    body += 0.006 * smoothstep(0.006, 0.0, cl);
    body -= 0.0035 * stitch(q);
    // 목 둘레 꿰맨 자국
    float ns = neckSeam(q);
    body += 0.006 * smoothstep(0.007, 0.0, ns);
  }
  vec2 r = vec2(body, 1.0);

  // ── 입 속 · 이빨
  if (length(hq - vec3(0.12, -0.07, 0.0)) < 0.17) {
    vec3 mq = hq - vec3(0.11, -0.07, 0.0);
    mq.xy = rot(0.18) * mq.xy;
    r = umin(r, vec2(sdEllipsoid(mq - vec3(-0.02, 0.0, 0.0), vec3(0.09, 0.011, 0.03)) * HS, 99.0));
    float teeth = 1e5;
    for (int i = 0; i < 9; i++) {
      float t = float(i) / 8.0;
      float hsh = fract(sin(float(i) * 12.9898) * 43758.55);
      float x = 0.05 + t * 0.12;
      float zr = mix(0.038, 0.02, t);
      float len = mix(0.012, 0.007, t) * (0.8 + 0.4 * hsh) + (i == 6 ? 0.01 : 0.0);
      for (int s = 0; s < 2; s++) {
        float z = s == 0 ? zr : -zr;
        vec3 a = vec3(x, -0.05 - t * 0.02, z);
        teeth = min(teeth, sdRoundCone(hq, a, a + normalize(vec3(0.0, -1.0, -z * 3.0)) * len, 0.005, 0.001));
        vec3 bb = vec3(x - 0.008, -0.083 - t * 0.03, z * 0.93);
        teeth = min(teeth, sdRoundCone(hq, bb, bb + normalize(vec3(0.0, 1.0, -z * 2.0)) * len * 0.8, 0.0045, 0.001));
      }
    }
    r = umin(r, vec2(teeth * HS, 2.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  if (id < 1.5) {
    // 썰매개 털: 등은 검회색 안장무늬, 배·다리·얼굴 가면은 흰색
    vec3 hq = (q - H) / HS;
    float saddle = smoothstep(0.42, 0.56, q.y + 0.06 * (fbm3(q * 6.0) - 0.5)) * smoothstep(0.55, 0.3, q.x);
    float mask = length(hq) < 0.3 ? smoothstep(0.0, -0.03, hq.y - 0.01 + 0.25 * hq.x) : 0.0;
    float capHead = length(hq) < 0.3 ? smoothstep(0.02, 0.05, hq.y + 0.1 * hq.x) * (1.0 - mask) : 0.0;
    float dark = clamp(max(saddle, capHead), 0.0, 1.0);
    float strand = 0.75 + 0.25 * noise(q * vec3(60.0, 220.0, 220.0));
    vec3 furC = mix(vec3(0.17, 0.165, 0.15), vec3(0.03, 0.03, 0.032), dark) * strand * (0.8 + 0.4 * fbm3(q * 4.0));
    // 서리 앉은 등털
    float frost = smoothstep(0.55, 0.9, n.y) * smoothstep(0.5, 0.75, fbm3(q * 12.0));
    furC = mix(furC, vec3(0.3, 0.34, 0.4), frost * 0.6);
    // 깎인 맨살: 창백하고 멍든 살갗
    float sh = shaved(q);
    float bruise = smoothstep(0.4, 0.7, fbm3(q * 14.0));
    vec3 skin = mix(vec3(0.1, 0.075, 0.075), vec3(0.06, 0.03, 0.045), bruise * 0.7);
    // 깎인 가장자리의 짧은 털 그루터기
    skin = mix(skin, vec3(0.04, 0.038, 0.036), smoothstep(0.6, 0.95, noise(q * 300.0)) * 0.6);
    // 절개선: 검붉은 핏자국, 실밥은 검은 실
    float cl = cutLine(q);
    float wound = smoothstep(0.012, 0.0, cl);
    float st = stitch(q);
    skin = mix(skin, vec3(0.09, 0.012, 0.01), wound);
    float ns = neckSeam(q);
    float nw = smoothstep(0.012, 0.0, ns);
    float nst = smoothstep(0.15, 0.05, abs(fract(atan(q.z, q.y - 0.51) * 7.0) - 0.5)) * smoothstep(0.016, 0.006, ns);
    vec3 alb = mix(furC, skin, max(sh, nw * 0.9));
    alb = mix(alb, vec3(0.09, 0.012, 0.01), nw * 0.7);
    alb = mix(alb, vec3(0.012, 0.01, 0.01), max(st, nst));
    // 입술·잇몸
    float gum = length(hq) < 0.3 ? smoothstep(0.03, 0.008, abs(hq.y + 0.063 + 0.26 * (hq.x - 0.11))) * smoothstep(0.03, 0.08, hq.x) * smoothstep(0.21, 0.16, hq.x) : 0.0;
    alb = mix(alb, vec3(0.09, 0.02, 0.022), gum);
    float nose = length(hq) < 0.3 ? smoothstep(0.03, 0.015, length(hq - vec3(0.195, -0.028, 0.0))) : 0.0;
    alb = mix(alb, vec3(0.008), nose);
    float wet = max(max(wound, gum * 0.9), max(nose, nw * 0.6));
    float skinMix = max(sh, nw);
    return Mat(alb, mix(mix(0.9, 0.5, skinMix), 0.25, wet), mix(mix(0.1, 0.35, skinMix), 0.9, wet) + st * 0.4, vec3(0.0), 0.0, 0.15 + skinMix * 0.45, wet);
  }
  return Mat(vec3(0.13, 0.11, 0.075), 0.35, 0.8, vec3(0.0), 0.0, 0.3, 0.5);
}
`,
  };
}
