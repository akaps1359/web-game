// 굶주린 들개 (1층) — 갈비뼈와 등뼈, 골반이 가죽을 뚫을 듯 드러난 들개. 머리를 등보다 낮게 숙이고
// 입술이 말려 올라가 지나치게 많은, 삐뚤빼뚤한 이빨이 드러났다. 털이 빠진 자리엔 딱지 앉은 맨살.
// 한쪽 눈은 백태가 끼었고 한쪽은 핏빛.
const YAW = 1.95;
function toWorld([x, y, z]) {
  const c = Math.cos(YAW);
  const s = Math.sin(YAW);
  return [c * x - s * z, y, s * x + c * z];
}
const H = [0.6, 0.45, 0.0];
const HS = 1.15; // 머리 배율

export default function dog() {
  const eyeL = toWorld([H[0] + 0.062 * HS, H[1] + 0.022 * HS, -0.043 * HS]);
  const eyeR = toWorld([H[0] + 0.062 * HS, H[1] + 0.022 * HS, 0.043 * HS]);
  const cam = [0.95, 0.36, 2.85];
  const look = (e) => {
    const g = [cam[0] - e[0], cam[1] - e[1], cam[2] - e[2]];
    const l = Math.hypot(...g);
    return g.map((v) => v / l);
  };
  return {
    preset: 'act1',
    cam: { pos: cam, target: [0.02, 0.34, 0.0], fov: 1.9 },
    light: { rim: 2.0, fillCol: [0.22, 0.14, 0.075], amb: [0.022, 0.03, 0.032], eyeEmit: 1.5, glow: 0.06 },
    frame: { fill: 0.92 },
    arrays: {
      uE: [
        [...eyeL, 0.019],
        [...eyeR, 0.019],
      ],
      uG: [
        [...look(eyeL), 12],
        [...look(eyeR), 3],
      ],
    },
    glsl: /* glsl */ `
const float YAW = ${YAW};
const vec3 H = vec3(${H.join(', ')});
const float HS = ${HS};

float spineY(float x) {
  float t = (x + 0.1) / 0.5;
  return 0.62 + 0.05 * (1.0 - t * t);
}

/** 다리 한 짝: 관절 4개를 잇는다 */
float leg(vec3 q, vec3 a, vec3 b, vec3 c, vec3 d, float r0, float r1, float r2, float r3) {
  float l = sdRoundCone(q, a, b, r0, r1);
  l = min(l, sdRoundCone(q, b, c, r1 * 0.85, r2));
  l = min(l, sdRoundCone(q, c, d, r2 * 0.9, r3));
  l = smin(l, sdSphere(q - b, r1 * 1.05), 0.015);
  l = smin(l, sdSphere(q - c, r2 * 1.15), 0.01);
  // 발: 발가락 넷
  vec3 f = d + vec3(0.02, -0.012, 0.0);
  float paw = sdEllipsoid(q - f, vec3(0.03, 0.017, 0.024));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.012;
    paw = smin(paw, sdSphere(q - f - vec3(0.022 - abs(o) * 0.5, -0.004, o), 0.0095), 0.006);
  }
  return smin(l, paw, 0.02);
}

vec2 sdf(vec3 p) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  float bound = sdBox(q - vec3(0.1, 0.36, 0.0), vec3(0.82, 0.42, 0.3));
  if (bound > 0.15) return vec2(bound, 1.0);

  // ── 몸통: 깊고 좁은 가슴, 말라붙어 치켜 올라간 배, 튀어나온 골반
  float chest = sdEllipsoid(q - vec3(0.13, 0.46, 0.0), vec3(0.25, 0.165, 0.11));
  // 갈비뼈: 옆구리에 줄지어 솟았다 (뼈 사이는 움푹)
  float rx = q.x + 0.42 * (q.y - 0.4);
  float rb = 0.5 + 0.5 * cos(rx * 88.0);
  float side = smoothstep(0.02, 0.08, abs(q.z));
  float ribZone = smoothstep(0.31, 0.38, q.y) * smoothstep(0.6, 0.52, q.y) * smoothstep(-0.12, -0.04, q.x) * smoothstep(0.32, 0.22, q.x);
  chest += 0.011 * (1.0 - pow(rb, 1.5)) * side * ribZone;
  float waist = sdRoundCone(q, vec3(-0.06, 0.5, 0.0), vec3(-0.32, 0.555, 0.0), 0.088, 0.064);
  float pelvis = sdEllipsoid(q - vec3(-0.4, 0.56, 0.0), vec3(0.12, 0.085, 0.085));
  float body = smin(chest, waist, 0.07);
  body = smin(body, pelvis, 0.06);
  // 등뼈 마디
  for (int i = 0; i < 14; i++) {
    float x = -0.48 + float(i) * 0.06;
    body = smin(body, sdSphere(q - vec3(x, spineY(x) - 0.04, 0.0), 0.02), 0.03);
  }
  vec3 qz = vec3(q.x, q.y, abs(q.z));
  // 엉덩뼈 날개, 좌골, 어깨뼈
  body = smin(body, sdSphere(qz - vec3(-0.35, 0.625, 0.058), 0.03), 0.035);
  body = smin(body, sdSphere(qz - vec3(-0.5, 0.56, 0.05), 0.026), 0.03);
  vec3 sq = qz - vec3(0.22, 0.56, 0.075);
  sq.xy = rot(-0.65) * sq.xy;
  body = smin(body, sdEllipsoid(sq, vec3(0.085, 0.04, 0.02)), 0.035);

  // ── 목: 등보다 낮게, 곤두선 털
  float neck = sdRoundCone(q, vec3(0.28, 0.55, 0.0), vec3(H.x - 0.04, H.y + 0.0, 0.0), 0.085, 0.062);
  if (neck < 0.05) {
    float hackle = smoothstep(-0.02, 0.06, q.y - 0.5 + 0.3 * (q.x - 0.3)) * smoothstep(0.62, 0.25, q.x);
    neck -= 0.016 * hackle * smoothstep(0.4, 0.8, noise(q * vec3(40.0, 10.0, 40.0)));
  }
  body = smin(body, neck, 0.06);

  // ── 다리: 가늘고 길며 관절이 혹처럼 불거졌다 (가까운 쪽 z<0)
  float legs = leg(q, vec3(0.25, 0.47, -0.075), vec3(0.17, 0.3, -0.085), vec3(0.2, 0.09, -0.08), vec3(0.22, 0.03, -0.08), 0.045, 0.026, 0.018, 0.016);
  legs = min(legs, leg(q, vec3(0.25, 0.47, 0.075), vec3(0.22, 0.3, 0.09), vec3(0.3, 0.1, 0.095), vec3(0.34, 0.03, 0.095), 0.045, 0.026, 0.018, 0.016));
  // 뒷다리: 허벅지 → 무릎(앞) → 뒤꿈치(뒤로 꺾임) → 발
  legs = min(legs, leg(q, vec3(-0.4, 0.52, -0.075), vec3(-0.27, 0.33, -0.095), vec3(-0.45, 0.15, -0.09), vec3(-0.42, 0.03, -0.085), 0.06, 0.03, 0.02, 0.016));
  legs = min(legs, leg(q, vec3(-0.4, 0.52, 0.075), vec3(-0.33, 0.32, 0.095), vec3(-0.53, 0.16, 0.09), vec3(-0.51, 0.03, 0.085), 0.06, 0.03, 0.02, 0.016));
  body = smin(body, legs, 0.04);

  // ── 꼬리: 털 빠진 채 다리 사이로 말려 들어갔다
  float tail = sdRoundCone(q, vec3(-0.5, 0.58, 0.0), vec3(-0.6, 0.47, 0.01), 0.026, 0.018);
  tail = min(tail, sdRoundCone(q, vec3(-0.6, 0.47, 0.01), vec3(-0.6, 0.33, 0.03), 0.018, 0.011));
  tail = min(tail, sdRoundCone(q, vec3(-0.6, 0.33, 0.03), vec3(-0.54, 0.23, 0.05), 0.011, 0.005));
  body = smin(body, tail, 0.025);

  // ── 머리: 낮게 숙였고, 이마에 주름, 입술이 말려 올라갔다
  vec3 hq = (q - H) / HS;
  float head = 1e5;
  if (length(hq) < 0.4) {
    float skull = sdEllipsoid(hq, vec3(0.085, 0.07, 0.066));
    float crest = sdEllipsoid(hq - vec3(-0.03, 0.04, 0.0), vec3(0.06, 0.035, 0.03));
    vec3 aq = vec3(hq.x, hq.y, abs(hq.z));
    float brow = sdEllipsoid(aq - vec3(0.055, 0.035, 0.035), vec3(0.03, 0.02, 0.025));
    float cheek = sdEllipsoid(aq - vec3(0.03, -0.025, 0.045), vec3(0.045, 0.035, 0.022));
    // 주둥이: 위턱은 들리고 콧등에 주름
    float snout = sdRoundCone(hq, vec3(0.07, -0.01, 0.0), vec3(0.19, -0.03, 0.0), 0.046, 0.028);
    snout -= 0.004 * smoothstep(0.3, 0.7, sin(hq.x * 160.0)) * smoothstep(0.08, 0.15, hq.x) * step(0.0, hq.y + 0.01);
    float jaw = sdRoundCone(hq, vec3(0.04, -0.075, 0.0), vec3(0.16, -0.125, 0.0), 0.03, 0.016);
    head = smin(skull, crest, 0.03);
    head = smin(head, brow, 0.02);
    head = smin(head, cheek, 0.03);
    head = smin(head, snout, 0.035);
    // 입: 위아래 턱 사이 + 말려 올라간 입술 (뒤쪽까지 찢어졌다)
    vec3 mq = hq - vec3(0.11, -0.07, 0.0);
    mq.xy = rot(0.2) * mq.xy;
    float mouth = sdEllipsoid(mq, vec3(0.11, 0.012, 0.04));
    head = smax(head, -mouth, 0.01);
    head = smin(head, jaw, 0.018);
    head = smax(head, -mouth, 0.006);
    // 귀: 뒤로 젖혀졌고 한쪽은 찢겼다
    float ear = sdRoundCone(aq, vec3(-0.025, 0.05, 0.042), vec3(-0.1, 0.125, 0.07), 0.027, 0.005);
    ear = max(ear, abs(dot(aq - vec3(-0.06, 0.08, 0.05), normalize(vec3(0.2, -0.3, 1.0)))) - 0.008);
    ear = max(ear, -sdSphere(aq - vec3(-0.09, 0.13, 0.068), 0.024 * step(0.0, q.z)));
    head = smin(head, ear, 0.015);
    head += 0.0025 * (fbm3(q * 50.0) - 0.5);
    head *= HS;
  }
  body = smin(body, head, 0.05);
  if (body < 0.03) body += 0.004 * (fbm3(q * 30.0) - 0.5);
  vec2 r = vec2(body, 1.0);

  // ── 입 속 · 이빨 · 침
  if (length(hq - vec3(0.12, -0.07, 0.0)) < 0.17) {
    vec3 mq = hq - vec3(0.11, -0.07, 0.0);
    mq.xy = rot(0.2) * mq.xy;
    r = umin(r, vec2(sdEllipsoid(mq - vec3(-0.02, 0.0, 0.0), vec3(0.095, 0.011, 0.03)) * HS, 99.0));
    float teeth = 1e5;
    for (int i = 0; i < 11; i++) {
      float t = float(i) / 10.0;
      float hsh = fract(sin(float(i) * 12.9898) * 43758.55);
      float hsh2 = fract(sin(float(i) * 78.233) * 12543.31);
      float x = 0.05 + t * 0.13;
      float zr = mix(0.04, 0.02, t);
      float len = mix(0.022, 0.012, t) * (0.7 + 0.8 * hsh) + (i == 3 ? 0.03 : 0.0);
      for (int s = 0; s < 2; s++) {
        float z = (s == 0 ? zr : -zr) + (hsh2 - 0.5) * 0.008;
        vec3 a = vec3(x, -0.05 - t * 0.02, z);
        vec3 tilt = vec3((hsh - 0.5) * 0.4, -1.0, -z * 3.0 + (hsh2 - 0.5) * 0.5);
        teeth = min(teeth, sdRoundCone(hq, a, a + normalize(tilt) * len, 0.0055, 0.001));
        vec3 bb = vec3(x - 0.008, -0.084 - t * 0.035, z * 0.93);
        vec3 tilt2 = vec3((hsh2 - 0.5) * 0.4, 1.0, -z * 2.0);
        teeth = min(teeth, sdRoundCone(hq, bb, bb + normalize(tilt2) * len * 0.85, 0.005, 0.001));
      }
    }
    r = umin(r, vec2(teeth * HS, 2.0));
    float drool = sdCapsule(hq, vec3(0.13, -0.1, -0.03), vec3(0.128, -0.2, -0.034), 0.0028);
    drool = smin(drool, sdSphere(hq - vec3(0.128, -0.203, -0.034), 0.0055), 0.008);
    r = umin(r, vec2(drool * HS, 4.0));
  }
  // 발톱
  float claws = 1e5;
  for (int i = 0; i < 2; i++) {
    vec3 f = i == 0 ? vec3(0.262, 0.018, -0.08) : vec3(0.382, 0.018, 0.095);
    for (int k = 0; k < 4; k++) {
      float o = (float(k) - 1.5) * 0.015;
      claws = min(claws, sdRoundCone(q, f + vec3(0.012, 0.0, o * 0.8), f + vec3(0.035, -0.012, o), 0.005, 0.0012));
    }
  }
  r = umin(r, vec2(claws, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 q = p;
  q.xz = rot(YAW) * q.xz;
  if (id < 1.5) {
    // 옴 오른 털가죽: 털이 빠진 자리엔 딱지 앉은 맨살
    float mange = smoothstep(0.5, 0.6, fbm3(q * 7.0 + 2.0));
    float fur = 0.7 + 0.3 * noise(q * vec3(90.0, 260.0, 90.0));
    vec3 furC = vec3(0.045, 0.038, 0.032) * fur * (0.7 + 0.6 * fbm3(q * 3.0));
    float scab = smoothstep(0.5, 0.75, noise(q * 40.0));
    vec3 skin = mix(vec3(0.1, 0.055, 0.048), vec3(0.045, 0.014, 0.01), scab);
    vec3 hq = (q - H) / HS;
    float gum = smoothstep(0.03, 0.008, abs(hq.y + 0.063 + 0.28 * (hq.x - 0.11))) * smoothstep(0.03, 0.08, hq.x) * smoothstep(0.22, 0.17, hq.x);
    vec3 alb = mix(furC, skin, mange);
    alb = mix(alb, vec3(0.1, 0.02, 0.022), gum);
    float wet = max(mange * 0.35, gum * 0.9);
    // 코: 젖은 검정
    float nose = smoothstep(0.03, 0.015, length(hq - vec3(0.205, -0.025, 0.0)));
    alb = mix(alb, vec3(0.01), nose);
    wet = max(wet, nose);
    return Mat(alb, mix(0.85, 0.3, wet), mix(0.12, 0.8, wet), vec3(0.0), 0.0, 0.2 + mange * 0.3, wet);
  }
  if (id < 2.5) return Mat(vec3(0.26, 0.22, 0.13), 0.35, 0.9, vec3(0.0), 0.0, 0.3, 0.5);
  if (id < 3.5) return Mat(vec3(0.03, 0.025, 0.02), 0.4, 0.6, vec3(0.0), 0.0, 0.0, 0.2);
  return Mat(vec3(0.08, 0.08, 0.07), 0.1, 1.5, vec3(0.0), 0.0, 0.2, 1.0);
}
`,
  };
}
