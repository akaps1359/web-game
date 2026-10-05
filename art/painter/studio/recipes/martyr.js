// 순교자 (2층) — 가시관을 쓰고 스스로를 채찍질하는 광신도.
// 뼈만 남은 상체엔 채찍 자국이 엇갈려 패였고, 가시 사슬이 갈비뼈를 감아 살을 파고들었다.
// 고개를 숙인 얼굴은 그늘에 묻혔고 가시관 아래로 피가 흘러내린다. 한 손은 어깨 위로 매듭진 채찍을 치켜들었다.
import { rng } from '../../lib.js';

const YAW = -0.3;
const cy = Math.cos(YAW);
const sy = Math.sin(YAW);
const toWorld = ([x, y, z]) => [cy * x - sy * z, y, sy * x + cy * z];
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function martyr({ seed = 1 } = {}) {
  const R = rng(seed * 77 + 5);
  const pts = [];
  // 채찍 가닥 5개: 손잡이 끝에서 어깨 뒤로 늘어진다
  const tip = [0.27, 1.86, -0.02];
  for (let k = 0; k < 5; k++) {
    const a = (k - 2) * 0.32 + (R() - 0.5) * 0.15;
    const len = 0.5 + R() * 0.12;
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = tip[0] + Math.sin(a) * 0.12 * t + 0.03 * Math.sin(t * 5 + k);
      const y = tip[1] - len * t + 0.06 * t * t;
      const z = tip[2] - 0.22 * Math.sin(t * 2.2) - 0.06 * t + Math.cos(a) * 0.03 * t;
      const knot = i > 2 && i % 3 === 0;
      pts.push([x, y, z, knot ? 0.011 : 0.0045]);
    }
    pts.push([0, 0, 0, 0]);
  }
  const whipEnd = pts.length;
  // 가시 사슬: 가슴에서 허리까지 몸통을 감는 나선
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ang = t * Math.PI * 2 * 2.3 + 0.6;
    const y = 1.36 - t * 0.42;
    const rx = 0.17 - 0.025 * t;
    const rz = 0.13 - 0.01 * t;
    pts.push([Math.cos(ang) * rx, y + 0.02 * Math.sin(ang * 3), Math.sin(ang) * rz + 0.02 * (1 - t), 0.0085]);
  }
  pts.push([0, 0, 0, 0]);
  return {
    preset: 'act2',
    cam: { pos: [0.35, 0.8, 5.0], target: [0.0, 1.02, 0.0], fov: 1.85 },
    light: {
      key: [-0.45, 0.62, -0.72],
      rim: 1.35,
      fillCol: [0.16, 0.08, 0.035],
      pt: toWorld([-0.3, 0.75, 0.6]),
      ptCol: [0.6, 0.3, 0.1],
      exposure: 1.2,
    },
    frame: { fill: 0.9 },
    arrays: { uB: pts, uP: [[whipEnd, 0, 0, 0]] },
    glsl: /* glsl */ `
const float YAW = ${YAW.toFixed(4)};
const vec3 HEAD = vec3(0.0, 1.5, 0.22);
const vec3 P0 = vec3(0.0, 0.9, 0.0);
const vec3 P1 = vec3(0.0, 1.1, 0.0);
const vec3 P2 = vec3(0.0, 1.27, 0.02);
const vec3 P3 = vec3(0.0, 1.39, 0.04);
const vec3 P4 = vec3(0.0, 1.45, 0.11);
const vec3 HANDR = vec3(0.25, 1.78, 0.02);
const vec3 HANDL = vec3(-0.25, 0.93, 0.12);

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

/** 사슬 배열의 일부 구간만 (i0 ~ i1) */
float chainRange(vec3 p, int i0, int i1, float k) {
  float d = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i < i0) continue;
    if (i + 1 >= i1 || i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
  }
  return d;
}

vec3 headSpace(vec3 p) {
  vec3 q = p - HEAD;
  q.xy = rot(-0.12) * q.xy;
  q.yz = rot(0.75) * q.yz;
  return q;
}
float sdFace(vec3 q) {
  float d = sdEllipsoid(q - vec3(0.0, 0.025, -0.012), vec3(0.08, 0.098, 0.096));
  float jaw = sdEllipsoid(q - vec3(0.0, -0.07, 0.03), vec3(0.056, 0.046, 0.06));
  d = smin(d, jaw, 0.045);
  vec3 qa = vec3(abs(q.x), q.y, q.z);
  d = smin(d, sdEllipsoid(qa - vec3(0.052, -0.012, 0.058), vec3(0.024, 0.017, 0.026)), 0.02);
  d = smax(d, -sdEllipsoid(qa - vec3(0.066, -0.05, 0.048), vec3(0.022, 0.028, 0.03)), 0.02);
  d = smax(d, -sdEllipsoid(qa - vec3(0.031, 0.012, 0.084), vec3(0.023, 0.016, 0.02)), 0.012);
  d = smin(d, sdEllipsoid(qa - vec3(0.03, 0.034, 0.08), vec3(0.03, 0.01, 0.016)), 0.015);
  d = smin(d, sdRoundCone(q, vec3(0.0, 0.012, 0.094), vec3(0.0, -0.028, 0.112), 0.009, 0.012), 0.012);
  d = smax(d, -sdEllipsoid(q - vec3(0.0, -0.058, 0.094), vec3(0.024, 0.006, 0.02)), 0.004);
  d = smin(d, sdEllipsoid(qa - vec3(0.081, 0.0, 0.0), vec3(0.01, 0.026, 0.017)), 0.01);
  return d;
}
float torsoD(vec3 p) {
  vec3 q = p;
  q.x *= 0.8;
  float d = sdRoundCone(q, P0, P1, 0.12, 0.1);
  d = smin(d, sdRoundCone(q, P1, P2, 0.1, 0.13), 0.06);
  d = smin(d, sdRoundCone(q, P2, P3, 0.13, 0.135), 0.05);
  d = smin(d, sdRoundCone(q, P3, P4, 0.135, 0.06), 0.05);
  return d * 0.8;
}

vec2 sdf(vec3 p) {
  p.xz = rot(YAW) * p.xz;
  float bound = sdBox(p - vec3(0.0, 1.0, 0.0), vec3(0.6, 1.1, 0.55));
  if (bound > 0.3) return vec2(bound, 1.0);

  // ── 뼈만 남은 상체: 갈비뼈, 꺼진 배, 쇄골, 어깨뼈
  float body = torsoD(p);
  float rib = 0.5 + 0.5 * cos((p.y - 0.18 * abs(p.x)) * 88.0);
  float ribZone = smoothstep(1.08, 1.17, p.y) * smoothstep(1.42, 1.32, p.y);
  body -= 0.007 * pow(rib, 2.5) * ribZone;
  body = smax(body, -sdEllipsoid(p - vec3(0.0, 1.03, 0.13), vec3(0.08, 0.07, 0.04)), 0.04);
  vec3 pa = vec3(abs(p.x), p.y, p.z);
  body = smin(body, sdCapsule(pa, vec3(0.02, 1.45, 0.09), vec3(0.16, 1.47, 0.04), 0.014), 0.02);
  body = smin(body, sdSphere(pa - vec3(0.18, 1.44, 0.0), 0.055), 0.04);
  body = smin(body, sdEllipsoid(pa - vec3(0.09, 1.36, -0.09), vec3(0.06, 0.07, 0.025)), 0.03);
  // 팔: 마른 위팔·팔꿈치 혹·팔뚝
  vec3 shR = vec3(0.19, 1.44, 0.0);
  vec3 elR = vec3(0.36, 1.58, -0.04);
  vec3 shL = vec3(-0.19, 1.44, 0.0);
  vec3 elL = vec3(-0.26, 1.17, 0.02);
  float arms = min(sdRoundCone(p, shR, elR, 0.042, 0.03), sdRoundCone(p, elR, HANDR, 0.03, 0.022));
  arms = min(arms, min(sdRoundCone(p, shL, elL, 0.042, 0.03), sdRoundCone(p, elL, HANDL, 0.03, 0.022)));
  arms = min(arms, min(sdSphere(p - elR, 0.032), sdSphere(p - elL, 0.032)));
  body = smin(body, arms, 0.03);
  // 목
  body = smin(body, sdRoundCone(p, P4 + vec3(0.0, -0.02, -0.02), HEAD + vec3(0.0, -0.07, -0.04), 0.048, 0.042), 0.03);
  // 다리: 앙상한 정강이, 무릎뼈
  vec3 knL = vec3(-0.09, 0.47, 0.1);
  vec3 knR = vec3(0.1, 0.49, 0.05);
  vec3 anL = vec3(-0.1, 0.08, 0.03);
  vec3 anR = vec3(0.11, 0.08, -0.02);
  float legs = 1e5;
  for (int s = 0; s < 2; s++) {
    vec3 hip = s == 0 ? vec3(-0.08, 0.88, 0.0) : vec3(0.08, 0.88, 0.0);
    vec3 kn = s == 0 ? knL : knR;
    vec3 an = s == 0 ? anL : anR;
    float lg = sdRoundCone(p, hip, kn, 0.068, 0.04);
    lg = smin(lg, sdEllipsoid(p - mix(hip, kn, 0.35) - vec3(0.0, 0.0, 0.015), vec3(0.06, 0.13, 0.06)), 0.04);
    lg = smin(lg, sdRoundCone(p, kn, an, 0.038, 0.022), 0.03);
    lg = smin(lg, sdEllipsoid(p - mix(kn, an, 0.25) - vec3(0.0, 0.0, -0.02), vec3(0.036, 0.09, 0.038)), 0.03);
    lg = smin(lg, sdEllipsoid(p - kn - vec3(0.0, 0.0, 0.025), vec3(0.035, 0.035, 0.025)), 0.02);
    legs = min(legs, lg);
  }
  for (int s = 0; s < 2; s++) {
    vec3 an = s == 0 ? anL : anR;
    float foot = sdRoundCone(p, an + vec3(0.0, -0.035, -0.02), an + vec3(0.0, -0.05, 0.13), 0.026, 0.022);
    for (int t = 0; t < 4; t++) {
      float tx = (float(t) - 1.5) * 0.017;
      foot = smin(foot, sdRoundCone(p, an + vec3(tx, -0.055, 0.12), an + vec3(tx * 1.2, -0.062, 0.165 - abs(tx) * 0.6), 0.009, 0.007), 0.01);
    }
    legs = min(legs, smin(foot, sdSphere(p - an, 0.025), 0.02));
  }
  body = smin(body, legs, 0.03);
  body += 0.0015 * (fbm3(p * 60.0) - 0.5);
  vec2 r = vec2(body, 2.0);

  // ── 허리에 감은 해진 천 (무릎까지)
  float y = clamp((p.y - 0.5) / 0.5, 0.0, 1.0);
  float ang = atan(p.z, p.x);
  float rr = mix(0.2, 0.135, y) + 0.02 * sin(ang * 7.0 + y * 3.0);
  float cloth = (length(p.xz * vec2(1.0, 1.25)) - rr) * 0.7;
  float hem = 0.5 + 0.05 * fbm3(vec3(p.x * 12.0, 0.0, p.z * 12.0)) + 0.1 * pow(noise(vec3(ang * 7.0, 2.0, 0.0)), 2.0);
  cloth = max(cloth, max(hem - p.y, p.y - 1.0));
  cloth += 0.003 * (fbm3(p * 25.0) - 0.5);
  r = umin(r, vec2(cloth, 1.0));
  // 허리 끈
  float rope = length(vec2(length((p.xz) * vec2(1.0, 1.25)) - 0.14, p.y - 0.97)) - 0.012;
  r = umin(r, vec2(rope, 7.0));

  // ── 머리: 숙였다. 가시관
  vec3 hq = headSpace(p);
  float face = sdFace(hq) + 0.0015 * (fbm3(p * 70.0) - 0.5);
  r = umin(r, vec2(face, 2.0));
  // 가시관: 꼬인 가지 두 줄 + 바깥으로 뻗은 가시
  vec3 cq = hq - vec3(0.0, 0.062, -0.012);
  cq.xy = rot(0.08) * cq.xy;
  float ca = atan(cq.z, cq.x);
  float crown = 1e5;
  for (int i = 0; i < 3; i++) {
    float ph = float(i) * 2.1;
    float ry = 0.012 * sin(ca * 5.0 + ph);
    float rr2 = 0.09 + 0.006 * cos(ca * 7.0 + ph);
    crown = min(crown, length(vec2(length(cq.xz) - rr2, cq.y - ry)) - 0.0065);
  }
  vec3 tq = polarRep(cq, 18.0);
  float th = sdRoundCone(tq, vec3(0.088, 0.0, 0.0), vec3(0.122, 0.018, 0.0), 0.006, 0.0008);
  vec3 tq2 = polarRep(vec3(cq.x * 0.985 - cq.z * 0.174, cq.y, cq.x * 0.174 + cq.z * 0.985), 13.0);
  th = min(th, sdRoundCone(tq2, vec3(0.09, 0.005, 0.0), vec3(0.115, -0.02, 0.0), 0.005, 0.0008));
  crown = min(crown, th);
  r = umin(r, vec2(crown, 3.0));
  // 그늘진 눈
  vec3 qa = vec3(abs(hq.x), hq.y, hq.z);
  r = umin(r, vec2(sdSphere(qa - vec3(0.031, 0.009, 0.071), 0.011), 6.0));

  // ── 손: 채찍을 쥔 손, 늘어진 손
  float hR = sdHand(p, HANDR, vec3(-0.15, 0.6, 0.6), vec3(0.8, 0.0, -0.4), 1.15, vec4(1.45, 1.5, 1.55, 1.5), 0.04, -1.0, 1.2);
  float hL = sdHand(p, HANDL, vec3(-0.05, -1.0, 0.1), vec3(-1.0, 0.0, 0.0), 1.15, vec4(0.9, 1.0, 1.05, 1.1), 0.08, 1.0, 0.6);
  r = umin(r, vec2(min(hR, hL), 2.0));
  // 채찍: 나무 손잡이 + 매듭진 가닥 (끝에 쇠붙이)
  vec3 hdl = HANDR + vec3(0.02, 0.07, -0.02);
  float handle = sdCapsule(p, HANDR + vec3(0.0, -0.05, 0.04), hdl + vec3(0.01, 0.03, -0.02), 0.013);
  r = umin(r, vec2(handle, 4.0));
  int we = int(uP[0].x + 0.5);
  float cords = chainRange(p, 0, we, 0.004);
  r = umin(r, vec2(cords, 5.0));
  // 가시 사슬
  float chain = chainRange(p, we, 160, 0.002);
  chain -= 0.006 * pow(max(sin(atan(p.z, p.x) * 60.0 + p.y * 150.0), 0.0), 8.0);
  r = umin(r, vec2(chain, 8.0));
  return r;
}

float ashDust(vec3 p, vec3 n) {
  return smoothstep(0.3, 0.9, n.y + 0.35 * (fbm3(p * 9.0) - 0.5));
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 lp = p;
  lp.xz = rot(YAW) * lp.xz;
  float ash = ashDust(lp, n);
  if (id < 1.5) {
    float dirt = fbm3(lp * 6.0);
    vec3 alb = vec3(0.07, 0.062, 0.052) * (0.55 + 0.8 * dirt);
    float blood = smoothstep(0.55, 0.8, fbm3(lp * 9.0 + 4.0));
    alb = mix(alb, vec3(0.05, 0.005, 0.004), blood);
    alb = mix(alb, vec3(0.1, 0.095, 0.09), ash * 0.5);
    return Mat(alb, mix(0.9, 0.35, blood), 0.1 + blood * 0.6, vec3(0.0), 0.0, 0.0, blood * 0.6);
  }
  if (id < 2.5) {
    // 잿빛 살갗 + 엇갈린 채찍 자국 + 가시관 아래로 흐르는 피
    float blot = fbm3(lp * 16.0);
    vec3 alb = vec3(0.105, 0.09, 0.078) * (0.7 + 0.5 * blot);
    float bodyZone = smoothstep(0.95, 1.05, lp.y) * smoothstep(1.52, 1.42, lp.y);
    // 엇갈린 채찍 자국: 방향·간격이 제각각인 가는 상처
    vec3 wp = lp + 0.04 * (vec3(noise(lp * 9.0), noise(lp * 9.0 + 2.0), noise(lp * 9.0 + 5.0)) - 0.5);
    float l1 = smoothstep(0.93, 0.995, sin(dot(wp, vec3(52.0, 37.0, 12.0))));
    float l2 = smoothstep(0.93, 0.995, sin(dot(wp, vec3(-47.0, 41.0, 6.0)) + 1.7));
    float l3 = smoothstep(0.94, 0.995, sin(dot(wp, vec3(20.0, 58.0, -9.0)) + 0.4));
    float lash = max(max(l1 * step(0.45, noise(lp * 6.0)), l2 * step(0.5, noise(lp * 6.0 + 9.0))), l3 * step(0.55, noise(lp * 5.0 + 4.0))) * bodyZone;
    float bruise = smoothstep(0.5, 0.8, fbm3(lp * 7.0)) * bodyZone * 0.5;
    alb = mix(alb, vec3(0.06, 0.03, 0.04), bruise);
    vec3 hq = headSpace(lp);
    float streak = smoothstep(0.45, 0.8, noise(vec3(lp.x * 60.0, lp.y * 5.0, lp.z * 60.0)));
    float faceBlood = streak * smoothstep(0.07, 0.02, hq.y) * step(-0.14, hq.y) * smoothstep(0.13, 0.06, length(hq.xz));
    float drip = streak * smoothstep(1.45, 1.3, lp.y) * smoothstep(0.9, 1.1, lp.y) * smoothstep(0.08, 0.0, abs(lp.x - 0.04 - 0.02 * sin(lp.y * 10.0))) * step(0.0, lp.z);
    float blood = max(max(lash, faceBlood), drip);
    alb = mix(alb, vec3(0.075, 0.006, 0.005), blood);
    alb = mix(alb, vec3(0.1, 0.098, 0.092), ash * 0.35 * (1.0 - blood));
    return Mat(alb, mix(0.55, 0.18, blood), mix(0.35, 1.2, blood), vec3(0.0), 0.0, 0.55, 0.12 + blood * 0.8);
  }
  if (id < 3.5) return Mat(vec3(0.05, 0.035, 0.022) * (0.7 + 0.5 * noise(lp * 80.0)), 0.75, 0.25, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 4.5) return Mat(vec3(0.05, 0.03, 0.018), 0.6, 0.3, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 5.5) {
    // 가죽 가닥, 피에 절었다
    return Mat(vec3(0.045, 0.012, 0.008), 0.35, 0.8, vec3(0.0), 0.0, 0.0, 0.6);
  }
  if (id < 6.5) return Mat(vec3(0.03, 0.012, 0.01), 0.15, 0.8, vec3(0.0), 0.0, 0.2, 0.8);
  if (id < 7.5) return Mat(vec3(0.07, 0.06, 0.045), 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.0);
  // 녹슨 가시 사슬, 살을 파고든 자리엔 피
  float rust = fbm3(lp * 20.0);
  vec3 alb = mix(vec3(0.03, 0.025, 0.022), vec3(0.08, 0.035, 0.018), smoothstep(0.4, 0.7, rust));
  alb = mix(alb, vec3(0.06, 0.005, 0.004), smoothstep(0.5, 0.75, noise(lp * 25.0)));
  return Mat(alb, 0.45, 0.9, vec3(0.0), 0.0, 0.0, 0.4);
}
`,
  };
}
