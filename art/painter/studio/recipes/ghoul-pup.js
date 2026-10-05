// 구울 새끼 (2층 하수인) — 납골당 바닥을 네 발로 기는 어린 구울.
// 털 없는 잿빛 살갗에 갈비뼈와 등뼈가 드러났고, 배만 볼록하게 부풀었다. 엉덩이를 치켜들고 고개를 낮춰 으르렁댄다.
// 몸에 비해 너무 큰 손이 바닥을 짚었고, 입술이 말려 올라가 이빨이 드러났다. 작은 눈은 병든 황록색.
const YAW = -0.6;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const rv = (a, x, y) => [Math.cos(a) * x + Math.sin(a) * y, -Math.sin(a) * x + Math.cos(a) * y];

export default function ghoulPup() {
  const head = [0.0, 0.3, 0.33];
  const PITCH = 0.25;
  const fromHead = ([x, y, z]) => {
    const [y2, z2] = rv(-PITCH, y, z);
    return [head[0] + x, head[1] + y2, head[2] + z2];
  };
  const cam = [0.0, 0.42, 2.6];
  const eyes = [fromHead([-0.034, 0.024, 0.06]), fromHead([0.034, 0.024, 0.06])].map(toWorld);
  const look = (e) => {
    const g = [cam[0] - e[0], cam[1] - e[1], cam[2] - e[2]];
    const l = Math.hypot(...g);
    return g.map((v) => v / l);
  };
  return {
    preset: 'act2',
    cam: { pos: cam, target: [0.0, 0.24, 0.0], fov: 1.9 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.35,
      fillCol: [0.2, 0.12, 0.05],
      pt: toWorld([0.25, 0.15, 0.55]),
      ptCol: [0.8, 0.45, 0.16],
      eyeEmit: 1.6,
      glow: 0.06,
      exposure: 1.2,
    },
    frame: { fill: 0.92 },
    arrays: {
      uE: eyes.map((e) => [...e, 0.0078]),
      uG: eyes.map((e) => [...look(e), 0]),
    },
    glsl: /* glsl */ `
const float YAW = ${YAW.toFixed(4)};
const vec3 HEAD = ${v3(head)};
const float PITCH = ${PITCH.toFixed(4)};

float claw(vec3 p, vec3 w, vec3 f, vec3 u, float s, float curl, out float nail) {
  nail = 1e5;
  float bd = length(p - w);
  if (bd > 0.32 * s) return bd - 0.24 * s;
  f = normalize(f);
  u = normalize(u - f * dot(u, f));
  vec3 sd = cross(f, u);
  vec3 pc = w + f * 0.05 * s;
  vec3 q = p - pc;
  float d = sdEllipsoid(vec3(dot(q, sd), dot(q, u), dot(q, f)), vec3(0.045, 0.018, 0.055) * s);
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    vec3 a = pc + f * 0.045 * s + sd * fi * 0.022 * s;
    vec3 dd = normalize(f + sd * fi * 0.35);
    float len = 0.06 * s;
    float r = 0.011 * s;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.8), 0.004 * s);
      d = min(d, sdSphere(p - a, r * 1.15));
      a = b;
      r *= 0.82;
      len *= 0.85;
      dd = normalize(dd - u * curl);
    }
    nail = min(nail, sdRoundCone(p, a - dd * 0.004, a + normalize(dd - u * 0.6) * 0.035 * s, r, 0.001));
  }
  vec3 ta = pc + sd * 0.04 * s - f * 0.01 * s;
  vec3 tb = ta + normalize(f + sd * 0.8 - u * 0.4) * 0.06 * s;
  d = smin(d, sdRoundCone(p, ta, tb, 0.013 * s, 0.009 * s), 0.008);
  nail = min(nail, sdRoundCone(p, tb, tb + normalize(f - u) * 0.03 * s, 0.008 * s, 0.001));
  return d;
}

vec3 headSpace(vec3 p) {
  vec3 q = p - HEAD;
  q.yz = rot(PITCH) * q.yz;
  return q;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  float bound = sdBox(p - vec3(0.0, 0.25, 0.0), vec3(0.45, 0.32, 0.6));
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 몸통: 치켜든 엉덩이, 휜 등, 부푼 배, 갈비뼈
  float chest = sdEllipsoid(p - vec3(0.0, 0.33, 0.1), vec3(0.1, 0.1, 0.12));
  float belly = sdEllipsoid(p - vec3(0.0, 0.29, -0.08), vec3(0.1, 0.1, 0.12));
  float pelvis = sdEllipsoid(p - vec3(0.0, 0.42, -0.26), vec3(0.085, 0.07, 0.08));
  float body = smin(chest, belly, 0.06);
  body = smin(body, pelvis, 0.08);
  for (int i = 0; i < 11; i++) {
    float t = float(i) / 10.0;
    vec3 c = vec3(0.0, mix(0.47, 0.41, t) + 0.025 * sin(t * 3.1416), mix(-0.28, 0.14, t));
    body = smin(body, sdSphere(p - c, 0.014 + 0.004 * sin(t * 3.1416)), 0.02);
  }
  float rib = 0.5 + 0.5 * cos(p.z * 120.0);
  float ribZone = smoothstep(0.03, 0.06, abs(p.x)) * smoothstep(-0.02, 0.05, p.z) * smoothstep(0.2, 0.12, p.z) * smoothstep(0.24, 0.3, p.y);
  body -= 0.005 * pow(rib, 2.0) * ribZone;
  // 목·머리
  body = smin(body, sdRoundCone(p, vec3(0.0, 0.36, 0.16), HEAD + vec3(0.0, 0.0, -0.05), 0.06, 0.045), 0.04);
  vec3 hq = headSpace(p);
  float skull = sdEllipsoid(hq - vec3(0.0, 0.015, -0.015), vec3(0.06, 0.055, 0.068));
  vec3 hqa = vec3(abs(hq.x), hq.y, hq.z);
  skull = smin(skull, sdEllipsoid(hqa - vec3(0.032, 0.035, 0.035), vec3(0.028, 0.014, 0.025)), 0.02);
  float snout = sdRoundCone(hq, vec3(0.0, 0.0, 0.03), vec3(0.0, -0.025, 0.14), 0.042, 0.024);
  float jaw = sdRoundCone(hq, vec3(0.0, -0.04, 0.015), vec3(0.0, -0.075, 0.12), 0.034, 0.017);
  float hd = smin(skull, snout, 0.04);
  vec3 mq = hq - vec3(0.0, -0.045, 0.085);
  mq.yz = rot(0.3) * mq.yz;
  float mouth = sdEllipsoid(mq, vec3(0.032, 0.016, 0.075));
  hd = smax(hd, -mouth, 0.008);
  hd = smin(hd, jaw, 0.015);
  hd = smax(hd, -mouth, 0.006);
  // 너무 큰 귀 (뒤로 젖혀졌다)
  float ear = sdRoundCone(hqa, vec3(0.04, 0.035, -0.03), vec3(0.09, 0.07, -0.12), 0.026, 0.004);
  ear = max(ear, -sdRoundCone(hqa - vec3(0.004, 0.006, 0.006), vec3(0.04, 0.035, -0.03), vec3(0.09, 0.07, -0.12), 0.02, 0.002));
  hd = smin(hd, ear, 0.015);
  body = smin(body, hd, 0.03);
  // ── 뒷다리
  float legs = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 hip = vec3(sx * 0.08, 0.42, -0.25);
    vec3 kn = vec3(sx * 0.14, 0.25, -0.1);
    vec3 hk = vec3(sx * 0.12, 0.12, -0.32);
    vec3 ft = vec3(sx * 0.12, 0.02, -0.2);
    float lg = sdRoundCone(p, hip, kn, 0.06, 0.03);
    lg = smin(lg, sdRoundCone(p, kn, hk, 0.03, 0.018), 0.02);
    lg = smin(lg, sdRoundCone(p, hk, ft, 0.018, 0.014), 0.015);
    for (int t = 0; t < 3; t++) {
      float tx = (float(t) - 1.0) * 0.02;
      lg = smin(lg, sdRoundCone(p, ft + vec3(tx, 0.0, 0.0), ft + vec3(tx * 1.4, -0.01, 0.055), 0.009, 0.006), 0.008);
    }
    legs = min(legs, lg);
  }
  // ── 앞팔: 팔꿈치를 벌리고 큰 손으로 바닥을 짚었다
  float nails = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 sh = vec3(sx * 0.09, 0.34, 0.1);
    vec3 el = vec3(sx * 0.19, 0.22, 0.08);
    vec3 wr = vec3(sx * 0.15, 0.05, 0.25);
    float ar = smin(sdRoundCone(p, sh, el, 0.04, 0.024), sdRoundCone(p, el, wr, 0.024, 0.02), 0.015);
    float nl;
    float hnd = claw(p, wr, vec3(sx * 0.3, -0.25, 1.0), vec3(0.0, 1.0, 0.1), 0.9, 0.35, nl);
    nails = min(nails, nl);
    legs = min(legs, smin(ar, hnd, 0.015));
  }
  body = smin(body, legs, 0.035);
  body += 0.002 * (fbm3(p * 40.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(sdEllipsoid(mq - vec3(0.0, 0.0, -0.008), vec3(0.025, 0.011, 0.065)), 99.0));
  // 이빨
  float teeth = 1e5;
  for (int i = 0; i < 5; i++) {
    float t = float(i) / 4.0;
    float z = 0.07 + t * 0.07;
    float x = mix(0.028, 0.012, t);
    float len = (i == 3 ? 0.026 : 0.014);
    for (int s = 0; s < 2; s++) {
      float xx = s == 0 ? x : -x;
      vec3 a = vec3(xx, -0.035 - t * 0.02, z);
      teeth = min(teeth, sdRoundCone(hq, a, a + vec3(0.0, -len, 0.003), 0.004, 0.0008));
      vec3 b = vec3(xx * 0.9, -0.065 - t * 0.022, z - 0.008);
      teeth = min(teeth, sdRoundCone(hq, b, b + vec3(0.0, len * 0.8, 0.003), 0.0037, 0.0008));
    }
  }
  r = umin(r, vec2(teeth, 2.0));
  r = umin(r, vec2(nails, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  if (id < 1.5) {
    float blot = fbm3(lp * 22.0);
    float mould = smoothstep(0.45, 0.8, fbm3(lp * 6.0 + 3.0));
    vec3 alb = vec3(0.075, 0.075, 0.062) * (0.7 + 0.5 * blot);
    alb = mix(alb, vec3(0.1, 0.105, 0.08), mould * 0.45);
    // 잇몸·입술: 검붉다
    vec3 hq = headSpace(lp);
    float gum = smoothstep(0.03, 0.006, abs(hq.y + 0.05 + 0.2 * (hq.z - 0.08))) * smoothstep(0.04, 0.08, hq.z);
    alb = mix(alb, vec3(0.1, 0.02, 0.02), gum);
    float ash = smoothstep(0.3, 0.9, n.y + 0.4 * (fbm3(lp * 9.0) - 0.5));
    alb = mix(alb, vec3(0.1, 0.098, 0.092), ash * 0.4);
    return Mat(alb, mix(0.5, 0.3, gum), 0.5, vec3(0.0), 0.05, 0.45, 0.3 + gum * 0.5);
  }
  if (id < 2.5) return Mat(vec3(0.22, 0.18, 0.11), 0.35, 0.8, vec3(0.0), 0.0, 0.3, 0.5);
  return Mat(vec3(0.02, 0.018, 0.015), 0.3, 1.0, vec3(0.0), 0.0, 0.0, 0.3);
}
`,
  };
}
