// 납골당 구울 (2층) — 개를 닮은 얼굴로 납골당의 뼈를 갉는 것.
// 뼈 무더기 위에 웅크렸다. 고무 같은 잿빛·녹회색 살갗엔 곰팡이 얼룩, 굽은 등엔 등뼈 마디가 솟았다.
// 길쭉한 개 주둥이로 사람 넓적다리뼈를 갉고, 작은 눈은 병든 황록색으로 빛난다. 뼈 사이에 꽂힌 촛농 덩이가 아래에서 비춘다.
import { rng } from '../../lib.js';

const YAW = 0.55;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function cryptGhoul({ seed = 1 } = {}) {
  const R = rng(seed * 53 + 11);
  // 뼈 무더기: 긴 뼈 (uB 사슬: 두 점씩 끊어서) + 두개골 (uA)
  const bones = [];
  const skulls = [];
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.15 + Math.sqrt(R()) * 0.42;
    const cx = Math.cos(a) * rr;
    const cz = Math.sin(a) * rr * 0.8 - 0.02;
    const len = 0.16 + R() * 0.16;
    const ang = R() * Math.PI;
    const yy = 0.03 + R() * 0.07 * (1 - rr);
    bones.push([cx - Math.cos(ang) * len * 0.5, yy, cz - Math.sin(ang) * len * 0.5, 0.017]);
    bones.push([cx + Math.cos(ang) * len * 0.5, yy + (R() - 0.5) * 0.05, cz + Math.sin(ang) * len * 0.5, 0.015]);
    bones.push([0, 0, 0, 0]);
  }
  const skullPos = [
    [-0.36, 0.07, 0.22, 0.075, 0.6],
    [0.4, 0.06, 0.12, 0.07, -0.9],
    [0.18, 0.06, 0.38, 0.065, 0.2],
    [-0.12, 0.09, -0.32, 0.075, 2.5],
  ];
  for (const s of skullPos) skulls.push(s);
  const candle = [-0.24, 0.1, 0.38];
  const flame = [candle[0], candle[1] + 0.12, candle[2]];
  const head = [0.0, 0.76, 0.31];
  const cam = [0.3, 0.6, 4.0];
  const rv = (a, x, y) => [Math.cos(a) * x + Math.sin(a) * y, -Math.sin(a) * x + Math.cos(a) * y];
  const fromHead = ([x, y, z]) => {
    const [x1, y1] = rv(-0.1, x, y);
    const [y2, z2] = rv(-0.42, y1, z);
    return [head[0] + x1, head[1] + y2, head[2] + z2];
  };
  const eyesL = [fromHead([-0.043, 0.026, 0.075]), fromHead([0.043, 0.026, 0.075])];
  const eyes = eyesL.map(toWorld);
  const look = (e) => {
    const g = [cam[0] - e[0], cam[1] - e[1], cam[2] - e[2]];
    const l = Math.hypot(...g);
    return g.map((v) => v / l);
  };
  return {
    preset: 'act2',
    cam: { pos: cam, target: [0.0, 0.45, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.65, -0.7],
      rim: 1.3,
      fillCol: [0.18, 0.12, 0.05],
      pt: toWorld([flame[0] + 0.05, flame[1] + 0.03, flame[2] + 0.05]),
      ptCol: [1.4, 0.8, 0.3],
      eyeEmit: 1.6,
      glow: 0.07,
      exposure: 1.2,
    },
    frame: { fill: 0.92 },
    arrays: {
      uB: bones,
      uP: skulls,
      uE: eyes.map((e) => [...e, 0.0115]),
      uG: eyes.map((e) => [...look(e), 0]),
      uL: [[...toWorld(flame), 0.014], [...toWorld([flame[0], flame[1] + 0.02, flame[2]]), 0.06]],
      uLC: [[1.0, 0.72, 0.3, 1.3], [1.0, 0.6, 0.22, 0.15]],
    },
    glsl: /* glsl */ `
const float YAW = ${YAW.toFixed(4)};
const vec3 HEAD = ${v3(head)};
const vec3 CANDLE = ${v3(candle)};
const vec3 BONE_A = vec3(0.01, 0.64, 0.43);
const vec3 BONE_B = vec3(-0.1, 0.4, 0.56);

/** 갈고리 손: 길고 마디진 손가락 + 검은 발톱 */
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
    vec3 dd = normalize(f + sd * fi * 0.25);
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
    nail = min(nail, sdRoundCone(p, a - dd * 0.004, a + normalize(dd - u * 0.6) * 0.035 * s, r * 1.0, 0.001));
  }
  vec3 ta = pc + sd * 0.04 * s - f * 0.01 * s;
  vec3 tb = ta + normalize(f + sd * 0.8 - u * 0.4) * 0.06 * s;
  d = smin(d, sdRoundCone(p, ta, tb, 0.013 * s, 0.009 * s), 0.008);
  nail = min(nail, sdRoundCone(p, tb, tb + normalize(f - u) * 0.03 * s, 0.008 * s, 0.001));
  return d;
}

vec3 headSpace(vec3 p) {
  vec3 q = p - HEAD;
  q.yz = rot(0.42) * q.yz;
  q.xy = rot(0.1) * q.xy;
  return q;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  float bound = sdBox(p - vec3(0.0, 0.45, 0.05), vec3(0.75, 0.55, 0.7));
  if (bound > 0.3) return vec2(bound, 1.0);

  // ── 몸통: 낮게 쭈그려 앉았다. 굽은 등, 꺼진 배, 등뼈 마디
  float chest = sdEllipsoid(p - vec3(0.0, 0.66, 0.09), vec3(0.15, 0.16, 0.15));
  float back = sdEllipsoid(p - vec3(0.0, 0.62, -0.06), vec3(0.15, 0.18, 0.15));
  float belly = sdEllipsoid(p - vec3(0.0, 0.47, -0.05), vec3(0.11, 0.12, 0.11));
  float pelvis = sdEllipsoid(p - vec3(0.0, 0.38, -0.14), vec3(0.14, 0.1, 0.12));
  float body = smin(chest, back, 0.1);
  body = smin(body, belly, 0.08);
  body = smin(body, pelvis, 0.08);
  for (int i = 0; i < 10; i++) {
    float t = float(i) / 9.0;
    vec3 c = vec3(0.0, mix(0.42, 0.8, t) + 0.06 * sin(t * 3.1416), mix(-0.25, 0.1, t) - 0.12 * sin(t * 3.1416));
    body = smin(body, sdSphere(p - c, 0.024 + 0.01 * sin(t * 3.1416)), 0.035);
  }
  vec3 pa = vec3(abs(p.x), p.y, p.z);
  body = smin(body, sdEllipsoid(pa - vec3(0.1, 0.74, -0.02), vec3(0.06, 0.08, 0.03)), 0.04);
  body = smin(body, sdRoundCone(p, vec3(0.0, 0.76, 0.1), HEAD + vec3(0.0, 0.0, -0.06), 0.08, 0.06), 0.05);

  // ── 뒷다리: 무릎이 가슴 옆까지 올라왔고, 뒤꿈치는 짐승처럼 꺾였다
  float legs = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 hip = vec3(sx * 0.12, 0.38, -0.11);
    vec3 kn = vec3(sx * 0.2, 0.52, 0.17);
    vec3 hk = vec3(sx * 0.17, 0.13, -0.08);
    vec3 ft = vec3(sx * 0.17, 0.03, 0.07);
    float lg = sdRoundCone(p, hip, kn, 0.09, 0.05);
    lg = smin(lg, sdEllipsoid(p - mix(hip, kn, 0.4), vec3(0.075, 0.07, 0.11)), 0.04);
    lg = smin(lg, sdRoundCone(p, kn, hk, 0.048, 0.028), 0.03);
    lg = smin(lg, sdEllipsoid(p - mix(kn, hk, 0.3) - vec3(0.0, 0.0, -0.02), vec3(0.04, 0.08, 0.04)), 0.03);
    lg = smin(lg, sdRoundCone(p, hk, ft, 0.028, 0.022), 0.02);
    for (int t = 0; t < 3; t++) {
      float tx = (float(t) - 1.0) * 0.03;
      lg = smin(lg, sdRoundCone(p, ft + vec3(tx, 0.0, 0.0), ft + vec3(tx * 1.4, -0.015, 0.075), 0.013, 0.008), 0.012);
    }
    legs = min(legs, lg);
  }
  body = smin(body, legs, 0.05);
  // ── 팔: 무릎 위로 팔꿈치를 벌리고, 뼈를 입으로 가져간다
  vec3 shL = vec3(-0.15, 0.76, 0.1);
  vec3 elL = vec3(-0.28, 0.5, 0.24);
  vec3 wrL = BONE_B + vec3(0.03, 0.05, -0.08);
  vec3 shR = vec3(0.15, 0.76, 0.1);
  vec3 elR = vec3(0.27, 0.5, 0.22);
  vec3 wrR = mix(BONE_A, BONE_B, 0.45) + vec3(0.06, -0.02, -0.07);
  float arms = smin(sdRoundCone(p, shL, elL, 0.052, 0.034), sdRoundCone(p, elL, wrL, 0.034, 0.024), 0.02);
  arms = min(arms, smin(sdRoundCone(p, shR, elR, 0.052, 0.034), sdRoundCone(p, elR, wrR, 0.034, 0.024), 0.02));
  arms = smin(arms, sdEllipsoid(p - mix(elL, wrL, 0.3), vec3(0.035, 0.035, 0.035)), 0.03);
  arms = smin(arms, sdEllipsoid(p - mix(elR, wrR, 0.3), vec3(0.035, 0.035, 0.035)), 0.03);
  body = smin(body, arms, 0.04);
  float nl;
  float nr;
  float hL = claw(p, wrL, vec3(0.4, 0.2, 0.5), vec3(-0.6, 0.6, -0.2), 1.0, 0.55, nl);
  float hR = claw(p, wrR, vec3(-0.5, 0.2, 0.5), vec3(0.6, 0.6, -0.2), 1.0, 0.55, nr);
  body = smin(body, min(hL, hR), 0.02);

  // ── 머리: 길쭉한 개 주둥이, 뒤로 붙인 귀, 위아래로 엇갈린 이빨
  vec3 hq = headSpace(p);
  float skull = sdEllipsoid(hq - vec3(0.0, 0.02, -0.02), vec3(0.075, 0.07, 0.085));
  vec3 hqa = vec3(abs(hq.x), hq.y, hq.z);
  float brow = sdEllipsoid(hqa - vec3(0.04, 0.045, 0.04), vec3(0.035, 0.018, 0.03));
  float snout = sdRoundCone(hq, vec3(0.0, 0.0, 0.04), vec3(0.0, -0.035, 0.2), 0.055, 0.03);
  float jaw = sdRoundCone(hq, vec3(0.0, -0.05, 0.02), vec3(0.0, -0.09, 0.17), 0.045, 0.022);
  float hd = smin(skull, brow, 0.03);
  hd = smin(hd, snout, 0.05);
  vec3 mq = hq - vec3(0.0, -0.06, 0.12);
  mq.yz = rot(0.2) * mq.yz;
  float mouth = sdEllipsoid(mq, vec3(0.04, 0.018, 0.1));
  hd = smax(hd, -mouth, 0.01);
  hd = smin(hd, jaw, 0.02);
  hd = smax(hd, -mouth, 0.008);
  float ear = sdRoundCone(hqa, vec3(0.05, 0.05, -0.04), vec3(0.08, 0.1, -0.14), 0.025, 0.004);
  hd = smin(hd, ear, 0.02);
  // 콧구멍
  hd = smax(hd, -sdSphere(hqa - vec3(0.012, -0.012, 0.225), 0.008), 0.004);
  hd += 0.002 * (fbm3(hq * 50.0) - 0.5);
  body = smin(body, hd, 0.04);
  body += 0.004 * (fbm3(p * 25.0) - 0.5) - 0.003 * smoothstep(0.3, 0.8, fbm3(p * 9.0)) + 0.0008 * smoothstep(0.1, 0.0, ridge(p * vec3(70.0, 140.0, 70.0)));
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(sdEllipsoid(mq - vec3(0.0, 0.0, -0.01), vec3(0.032, 0.012, 0.085)), 99.0));
  // 이빨
  float teeth = 1e5;
  if (length(hq - vec3(0.0, -0.06, 0.12)) < 0.15) {
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      float z = 0.1 + t * 0.1;
      float x = mix(0.036, 0.016, t);
      float len = (i == 4 ? 0.034 : 0.018) * mix(0.8, 1.0, t);
      for (int s = 0; s < 2; s++) {
        float xx = s == 0 ? x : -x;
        vec3 a = vec3(xx, -0.045 - t * 0.025, z);
        teeth = min(teeth, sdRoundCone(hq, a, a + vec3(0.0, -len, 0.004), 0.0055, 0.001));
        vec3 b = vec3(xx * 0.9, -0.085 - t * 0.03, z - 0.01);
        teeth = min(teeth, sdRoundCone(hq, b, b + vec3(0.0, len * 0.8, 0.004), 0.005, 0.001));
      }
    }
  }
  r = umin(r, vec2(teeth, 2.0));
  r = umin(r, vec2(min(nl, nr), 3.0));
  // ── 갉고 있는 넓적다리뼈 (끝이 갉혀 부러졌다)
  float femur = sdRoundCone(p, BONE_A, BONE_B, 0.016, 0.018);
  femur = smin(femur, sdSphere(p - BONE_B - vec3(0.012, -0.015, 0.0), 0.028), 0.01);
  femur = smin(femur, sdSphere(p - BONE_B - vec3(-0.015, -0.005, 0.01), 0.022), 0.01);
  femur += 0.004 * (noise(p * 120.0) - 0.5) * smoothstep(0.06, 0.0, length(p - BONE_A));
  r = umin(r, vec2(femur, 4.0));

  // ── 뼈 무더기
  float pile = chains(p, 0.02);
  for (int i = 0; i < 4; i++) {
    vec4 s = uP[i];
    vec3 q = p - s.xyz;
    q.xz = rot(s.w * 3.0) * q.xz;
    float sk = sdEllipsoid(q - vec3(0.0, 0.01, -0.01), vec3(0.06, 0.055, 0.07) * s.w / 0.07);
    vec3 qq = vec3(abs(q.x), q.y, q.z);
    sk = smax(sk, -sdEllipsoid(qq - vec3(0.024, 0.005, 0.055) * s.w / 0.07, vec3(0.017, 0.015, 0.02) * s.w / 0.07), 0.006);
    sk = smin(sk, sdEllipsoid(q - vec3(0.0, -0.03, 0.04) * s.w / 0.07, vec3(0.035, 0.022, 0.03) * s.w / 0.07), 0.015);
    pile = min(pile, sk);
  }
  r = umin(r, vec2(pile, 4.0));
  // 촛농 덩이와 초
  vec3 cq = p - CANDLE;
  float wax = sdEllipsoid(cq, vec3(0.05, 0.035, 0.05));
  wax = smin(wax, sdCappedCone(cq - vec3(0.0, 0.06, 0.0), 0.045, 0.022, 0.018), 0.02);
  r = umin(r, vec2(wax, 5.0));
  r = umin(r, vec2(sdCapsule(cq, vec3(0.0, 0.1, 0.0), vec3(0.0, 0.115, 0.0), 0.002), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  if (id < 1.5) {
    // 고무 같은 잿빛 녹회색 살갗, 곰팡이 얼룩, 입가와 손엔 검붉은 피
    float mould = smoothstep(0.45, 0.8, fbm3(lp * 5.0 + 3.0));
    float blot = fbm3(lp * 22.0);
    float wrinkle = smoothstep(0.08, 0.0, ridge(lp * vec3(70.0, 140.0, 70.0))) * 0.5;
    vec3 alb = vec3(0.06, 0.066, 0.055) * (0.7 + 0.5 * blot);
    alb = mix(alb, vec3(0.085, 0.095, 0.07), mould * 0.5);
    alb *= 1.0 - 0.35 * wrinkle;
    vec3 hq = headSpace(lp);
    float mouthBlood = smoothstep(0.08, 0.0, length(hq.xy - vec2(0.0, -0.075))) * smoothstep(0.05, 0.12, hq.z);
    float handBlood = smoothstep(0.1, 0.0, min(length(lp - BONE_A), length(lp - BONE_B))) * smoothstep(0.3, 0.6, noise(lp * 30.0));
    float blood = max(mouthBlood, handBlood);
    alb = mix(alb, vec3(0.05, 0.006, 0.004), blood);
    return Mat(alb, mix(0.45, 0.2, blood), 0.55 + blood * 0.5, vec3(0.0), 0.05, 0.4, 0.35 + blood * 0.5);
  }
  if (id < 2.5) return Mat(vec3(0.24, 0.2, 0.12), 0.35, 0.8, vec3(0.0), 0.0, 0.3, 0.5);
  if (id < 3.5) return Mat(vec3(0.02, 0.018, 0.015), 0.3, 1.0, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 4.5) {
    // 누렇게 바랜 뼈, 재에 덮였다
    float stain = fbm3(lp * 10.0);
    vec3 alb = mix(vec3(0.2, 0.18, 0.13), vec3(0.1, 0.085, 0.06), smoothstep(0.35, 0.75, stain));
    float ash = smoothstep(0.3, 0.9, n.y + 0.4 * (fbm3(lp * 9.0) - 0.5));
    alb = mix(alb, vec3(0.11, 0.105, 0.1), ash * 0.6);
    if (lp.y < 0.06) alb *= 0.6;
    return Mat(alb, 0.65, 0.35, vec3(0.0), 0.0, 0.25, 0.05);
  }
  return Mat(vec3(0.18, 0.14, 0.08), 0.35, 0.5, vec3(0.0), 0.0, 0.8, 0.3);
}
`,
  };
}
