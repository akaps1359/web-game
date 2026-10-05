// 문턱의 존재 (5층 균열 수호자) — 꿈과 현실 사이의 틈에 끼어 사는 것. 한쪽 세계의 무기로는 끝까지 베어 낼 수 없다.
// 공간에 세로로 난 흰 틈(문턱) 앞에 떠 있는 앙상하고 긴 형체. 몸 한가운데를 들쭉날쭉한 빛의 금이 위아래로 가른다:
// 한쪽 반은 잿빛 살갗의 현실, 다른 반은 살이 없이 테두리만 남은 실루엣 속에 별밤이 들어찬 꿈이다.
// 너무 긴 두 팔이 양쪽 세계에서 갈퀴를 펴고, 얼굴 없는 긴 머리는 금을 따라 반으로 갈라져 있다.
import { rng } from '../../lib.js';

export default function liminal({ seed = 1 } = {}) {
  const R = rng(seed * 911 + 7);
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 팔: 어깨 → 팔꿈치 → 손목 (너무 길다)
  const armR = (t) => 0.085 - 0.05 * t + 0.02 * Math.exp(-((t - 0.5) ** 2) * 120);
  path([[0.34, 2.36, 0.0], [0.66, 2.3, 0.0], [0.95, 2.05, 0.12], [1.1, 1.6, 0.35], [1.12, 1.15, 0.6]], armR);
  path([[-0.34, 2.36, 0.0], [-0.62, 2.42, 0.1], [-0.85, 2.2, 0.4], [-0.95, 1.85, 0.85], [-0.9, 1.6, 1.25]], armR);
  // 다리: 매달려 늘어졌다 (발끝이 아래로)
  const legR = (t) => 0.1 - 0.06 * t + 0.02 * Math.exp(-((t - 0.5) ** 2) * 120);
  path([[0.15, 1.2, 0.0], [0.2, 0.85, 0.14], [0.22, 0.48, 0.06], [0.19, 0.16, -0.06], [0.2, 0.08, 0.06], [0.2, -0.12, 0.14]], (t) => (t < 0.8 ? legR(t / 0.8) : 0.04 - 0.035 * (t - 0.8) / 0.2));
  path([[-0.15, 1.2, 0.0], [-0.23, 0.9, 0.18], [-0.27, 0.56, 0.14], [-0.28, 0.26, 0.02], [-0.29, 0.18, 0.12], [-0.3, 0.0, 0.2]], (t) => (t < 0.8 ? legR(t / 0.8) : 0.04 - 0.035 * (t - 0.8) / 0.2));
  const nLimb = ch.length;
  // 손가락: 갈퀴처럼 긴 넷
  const fingers = (wr, dir, side) => {
    for (let f = 0; f < 4; f++) {
      const o = (f - 1.5) * 0.04;
      const b0 = [wr[0] + side[0] * o, wr[1] + side[1] * o, wr[2] + side[2] * o];
      const b1 = [b0[0] + dir[0] * 0.16 + side[0] * o * 0.6, b0[1] + dir[1] * 0.16, b0[2] + dir[2] * 0.16 + side[2] * o * 0.6];
      const b2 = [b1[0] + dir[0] * 0.14 + side[0] * o * 0.5, b1[1] + dir[1] * 0.12 - 0.04, b1[2] + dir[2] * 0.14 + 0.05];
      const b3 = [b2[0] + dir[0] * 0.08, b2[1] - 0.07, b2[2] + 0.06];
      ch.push([...b0, 0.02], [...b1, 0.015], [...b2, 0.011], [...b3, 0.003]);
      brk();
    }
  };
  fingers([1.12, 1.15, 0.6], [0.1, -0.85, 0.45], [0.9, 0, -0.4]);
  fingers([-0.9, 1.6, 1.25], [-0.05, -0.45, 0.9], [0.95, 0, 0.1]);
  const nAll = ch.length;

  // 빛: 문턱의 틈을 따라 + 현실 쪽 눈 하나
  const lights = [[-0.05, 2.37, 0.5, 0.008]];
  const lc = [[0.9, 0.95, 1.0, 1.6]];
  for (let i = 0; i < 9; i++) {
    const y = 0.2 + i * 0.42 + (R() - 0.5) * 0.1;
    lights.push([0.0, y, -0.5, 0.1 + R() * 0.05]);
    lc.push([0.9, 0.92, 1.0, 0.16]);
  }
  for (let i = 0; i < 8; i++) {
    lights.push([(R() - 0.3) * 1.6, 0.3 + R() * 3.0, 0.2 + R() * 0.6, 0.005 + R() * 0.006]);
    lc.push([0.9, 0.95, 1.0, 0.8]);
  }
  return {
    preset: 'act5',
    cam: { pos: [1.2, 0.8, 9.6], target: [-0.05, 1.75, 0.0], fov: 1.75 },
    light: {
      key: [0.15, 0.45, -1.0],
      keyCol: [1.0, 0.95, 1.15],
      fillCol: [0.07, 0.08, 0.12],
      amb: [0.014, 0.014, 0.02],
      rimCol: [0.9, 0.95, 1.2],
      rim: 1.8,
      exposure: 1.25,
      glow: 0.05,
      pt: [0.0, 1.9, 0.6],
      ptCol: [0.4, 0.42, 0.5],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uB: ch, uL: lights, uLC: lc, uP: [[nLimb, nAll, 0, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 36
#define VOLUME_FAR 16.0
#define HAS_BG

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
// 문턱의 금: 몸을 세로로 가르는 들쭉날쭉한 면 (음수 = 현실, 양수 = 꿈)
float seam(vec3 p) {
  return p.x - 0.035 * sin(p.y * 6.0 + 1.0) - 0.04 * (noise(vec3(p.y * 5.0, 1.0, 2.0)) - 0.5) - 0.015 * (noise(vec3(p.y * 19.0, 4.0, 1.0)) - 0.5);
}

float bodyD(vec3 p) {
  vec3 sp = vec3(abs(p.x), p.y, p.z);
  // 앙상한 가슴과 등, 골반
  float chest = sdEllipsoid(p - vec3(0.0, 1.98, 0.0), vec3(0.27, 0.32, 0.17));
  chest = smin(chest, sdEllipsoid(p - vec3(0.0, 2.2, -0.1), vec3(0.32, 0.2, 0.19)), 0.12);
  float ribs = abs(fract(p.y * 9.0) - 0.5);
  chest += 0.015 * smoothstep(0.25, 0.05, ribs) * smoothstep(0.05, 0.2, abs(p.x)) * smoothstep(1.65, 1.8, p.y) * smoothstep(2.2, 2.05, p.y);
  float belly = sdEllipsoid(p - vec3(0.0, 1.55, -0.02), vec3(0.15, 0.25, 0.12));
  float pelvis = sdEllipsoid(p - vec3(0.0, 1.24, 0.0), vec3(0.22, 0.13, 0.13));
  float d = smin(chest, belly, 0.1);
  d = smin(d, pelvis, 0.1);
  d = smin(d, sdEllipsoid(sp - vec3(0.3, 2.34, 0.0), vec3(0.12, 0.09, 0.09)), 0.08);
  // 목과 얼굴 없는 긴 머리 (금을 따라 앞으로 기울었다)
  d = smin(d, sdRoundCone(p, vec3(0.0, 2.3, 0.02), vec3(0.0, 2.4, 0.25), 0.07, 0.06), 0.06);
  vec3 hq = p - vec3(0.0, 2.42, 0.38);
  hq.yz = rot(-0.9) * hq.yz;
  float head = sdEllipsoid(hq, vec3(0.11, 0.2, 0.13));
  head = smin(head, sdEllipsoid(hq - vec3(0.0, -0.15, 0.04), vec3(0.07, 0.09, 0.08)), 0.05);
  head = smax(head, -sdEllipsoid(vec3(abs(hq.x), hq.yz) - vec3(0.055, -0.02, 0.11), vec3(0.035, 0.02, 0.04)), 0.02);
  d = smin(d, head, 0.06);
  float limbs = chainR(p, 0, int(uP[0].x), 0.03);
  d = smin(d, limbs, 0.07);
  d = smin(d, chainR(p, int(uP[0].x), int(uP[0].y), 0.005), 0.03);
  return d;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 1.6, 0.0)) - 2.6;
  if (bb > 0.5) return vec2(bb, 1.0);
  float d = bodyD(p);
  float s = seam(p);
  // 두 세계 사이로 몸이 조금 벌어졌다
  // 가슴의 금은 세로로 벌어진 아가리가 된다 (양쪽 가장자리에 이빨)
  float my = clamp((p.y - 1.55) / 0.7, 0.0, 1.0);
  float mw = 0.06 * sin(3.14159 * my) * step(1.55, p.y) * step(p.y, 2.25) * smoothstep(-0.1, 0.1, p.z);
  float gap = abs(s) - 0.012 - mw;
  float body = max(d, -gap);
  float teeth = 1e5;
  if (mw > 0.005) {
    float ty = mod(p.y, 0.04) - 0.02;
    for (int j = 0; j < 2; j++) {
      float sg = j == 0 ? 1.0 : -1.0;
      vec2 tq = vec2(sg * s - (0.012 + mw), ty);
      float tooth = sdRoundCone(vec3(tq, 0.0), vec3(0.0), vec3(-0.045 * (0.5 + mw * 8.0), 0.0, 0.0), 0.009, 0.001);
      teeth = min(teeth, max(tooth, abs(d + 0.02) - 0.06));
    }
  }
  if (body < 0.05) body += 0.004 * (fbm3(p * 18.0) - 0.5);
  vec2 r = vec2(body, s < 0.0 ? 1.0 : 2.0);
  r = umin(r, vec2(teeth, 5.0));
  // 틈 속의 빛
  r = umin(r, vec2(max(abs(s) - 0.003, d + 0.005), 3.0));
  // 뒤쪽 공간의 문턱: 세로로 긴 흰 틈
  vec3 q = p - vec3(0.0, 1.75, -0.5);
  float yy = clamp(abs(q.y) / 2.1, 0.0, 1.0);
  float w = 0.26 * sqrt(1.0 - yy * yy) + 0.004;
  w *= 0.8 + 0.4 * noise(vec3(q.y * 6.0, 2.0, 0.0));
  float rift = max(abs(q.x + 0.04 * sin(q.y * 3.0)) - w, abs(q.y) - 2.1);
  rift = max(rift, abs(q.z) - 0.005);
  r = umin(r, vec2(rift, 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fr = pow(1.0 - max(dot(n, V), 0.0), 2.2);
  float s = seam(p);
  float seamGlow = smoothstep(0.06, 0.0, abs(s));
  if (id < 1.5) {
    // 현실: 잿빛 푸른 살갗, 핏줄이 비치고 메말랐다
    float v = fbm3(p * 5.0);
    float vein = smoothstep(0.05, 0.0, ridge(p * 6.0)) * 0.5;
    vec3 alb = vec3(0.075, 0.075, 0.09) * (0.6 + 0.6 * v) * (1.0 - vein * 0.5);
    return Mat(alb, 0.65, 0.35, vec3(0.85, 0.9, 1.0) * seamGlow * 0.6, 0.0, 0.35, 0.12);
  }
  if (id < 2.5) {
    // 꿈: 살이 없다. 테두리만 희게 빛나고 속은 별밤
    vec3 g = p * 34.0;
    vec3 c = floor(g);
    float h = hash31(c);
    float star = step(0.9, h) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.5 + 0.5 * hash31(c + 7.0));
    vec3 neb = mix(vec3(0.12, 0.04, 0.2), vec3(0.03, 0.12, 0.16), fbm3(p * 2.5)) * (0.4 + 0.8 * fbm3(p * 5.0 + 3.0));
    vec3 emi = neb * 0.35 + vec3(0.9, 0.92, 1.0) * star * 1.6;
    emi += vec3(0.85, 0.9, 1.0) * (pow(fr, 2.2) * 1.4 + seamGlow * 0.8);
    return Mat(vec3(0.0), 1.0, 0.0, emi, 0.0, 0.0, 0.0);
  }
  if (id < 3.5) return Mat(vec3(0.0), 1.0, 0.0, vec3(2.4, 2.45, 2.6), 0.0, 0.0, 0.0);
  if (id > 4.5) return Mat(vec3(0.2, 0.19, 0.17), 0.3, 0.8, vec3(0.25, 0.26, 0.3), 0.0, 0.3, 0.4);
  // 문턱: 가운데는 눈부신 흰빛, 가장자리로 갈수록 보랏빛
  vec3 q = p - vec3(0.0, 1.75, -0.5);
  float yy = clamp(abs(q.y) / 2.1, 0.0, 1.0);
  float w = 0.26 * sqrt(1.0 - yy * yy) + 0.004;
  float e = abs(q.x + 0.04 * sin(q.y * 3.0)) / w;
  // 문턱: 찢긴 가장자리는 희게 타고, 그 안은 꿈의 우주 (별과 성운)
  vec3 g = p * 40.0;
  vec3 cc = floor(g);
  float star = step(0.9, hash31(cc)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.5 + hash31(cc + 7.0));
  vec3 neb = mix(vec3(0.35, 0.1, 0.5), vec3(0.06, 0.28, 0.4), fbm3(p * vec3(3.0, 1.2, 3.0))) * (0.12 + 0.9 * pow(fbm3(p * 6.0 + 3.0), 2.0));
  vec3 c = neb * 0.4 + vec3(1.0) * star * 1.5;
  float edge = smoothstep(0.7, 0.98, e);
  c = mix(c, vec3(2.4, 2.4, 2.7), edge);
  c += vec3(0.8, 0.7, 1.0) * exp(-e * 2.5) * 0.25 * (1.0 - yy);
  return Mat(vec3(0.0), 1.0, 0.0, c, 0.0, 0.0, 0.0);
}

// 문턱에서 새어 나오는 흰 빛 안개
vec4 volume(vec3 p) {
  vec3 q = p - vec3(0.0, 1.75, -0.45);
  float dx = abs(q.x);
  float core = exp(-dx * 9.0) * smoothstep(2.3, 1.2, abs(q.y)) * exp(-abs(q.z) * 3.0);
  float n1 = fbm3(p * vec3(3.0, 1.0, 3.0) + vec3(0.0, uSeed, 0.0));
  float dens = core * (0.4 + 0.8 * n1);
  if (dens < 0.003) return vec4(0.0);
  return vec4(vec3(0.7, 0.72, 0.95) * dens * 0.3, dens * 0.25);
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
