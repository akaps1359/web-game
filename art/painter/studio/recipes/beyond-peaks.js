// 산맥 너머의 것 (3층 수호자) — 이 도시를 굽어보는 산맥보다 더 높은 봉우리들 너머, 보랏빛 증기 속에서 모양을 바꾸는 것.
// 아래로는 검은 봉우리들이 왕관처럼 솟아 그것의 몸에 박혀 있다 (끝없는 봉우리). 그 위로 보랏빛 증기가 거대한
// 두건 쓴 형체처럼 부풀어 오르고, 증기가 갈라진 틈 한가운데에서 세로로 찢어진 거대한 눈이 내려다본다.
// 눈동자는 하나가 아니다. 증기 속에는 떠 있는 정육면체 돌덩이들, 둘레엔 별빛 같은 불티.
// 똑바로 보면 안 되는 것 — 형체는 끝까지 증기에 반쯤 가려 있다.
import { rng } from '../../lib.js';

export default function beyondPeaks({ seed = 1 } = {}) {
  const R = rng(seed * 997 + 31);
  // 봉우리: [x, z, 높이, 밑 반지름]
  const peaks = [
    [-0.25, 0.1, 1.45, 0.62],
    [0.55, 0.0, 1.15, 0.55],
    [-1.05, 0.2, 1.0, 0.55],
    [1.25, 0.25, 0.8, 0.5],
    [0.15, 0.55, 0.62, 0.42],
    [-0.65, 0.6, 0.5, 0.38],
    [-1.65, 0.45, 0.45, 0.4],
    [1.75, 0.5, 0.4, 0.36],
    [0.85, 0.7, 0.38, 0.3],
  ];
  // 떠 있는 정육면체 돌덩이
  const cubes = [];
  for (let i = 0; i < 300 && cubes.length < 5; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.9 + R() * 0.8;
    const c = [Math.cos(a) * rr, 1.9 + R() * 2.0, Math.sin(a) * rr * 0.5];
    if (Math.abs(c[0]) < 0.5 && c[2] > -0.2) continue;
    if (cubes.some((q) => Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < 0.5)) continue;
    cubes.push([...c, 0.04 + R() * 0.06]);
  }
  // 증기 속에 떴다 감기는 작은 눈들
  const camP = [0.3, 0.3, 10.5];
  const eyes = [];
  const gaze = [];
  for (let i = 0; i < 300 && eyes.length < 0; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.55 + R() * 0.65;
    const c = [Math.cos(a) * rr * 1.1, 2.75 + Math.sin(a) * rr * 1.35, 0.05 + R() * 0.15];
    if (c[1] < 1.6 || c[1] > 4.2) continue;
    if (eyes.some((e) => Math.hypot(e[0] - c[0], e[1] - c[1]) < 0.35)) continue;
    eyes.push([...c, 0.03 + Math.pow(R(), 2) * 0.06]);
    const g = [camP[0] - c[0] + (R() - 0.5) * 4, camP[1] - c[1] + (R() - 0.5) * 2, camP[2] - c[2]];
    const l = Math.hypot(...g);
    gaze.push([g[0] / l, g[1] / l, g[2] / l, 4]);
  }
  const lights = [];
  const lc = [];
  for (let i = 0; i < 22; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.5 + R() * 1.6;
    lights.push([Math.cos(a) * rr, 0.5 + R() * 3.6, Math.sin(a) * rr * 0.5 + 0.3, 0.004 + R() * 0.008]);
    lc.push(R() < 0.6 ? [0.85, 0.65, 1.0, 1.0] : [0.6, 0.8, 1.0, 1.0]);
  }
  return {
    preset: 'act3',
    cam: { pos: [0.3, 0.2, 10.5], target: [0.0, 2.2, 0.0], fov: 1.7 },
    light: {
      key: [-0.2, 0.55, -0.81],
      keyCol: [0.9, 0.85, 1.35],
      rimCol: [0.85, 0.7, 1.25],
      rim: 1.8,
      fillCol: [0.1, 0.06, 0.16],
      amb: [0.016, 0.014, 0.026],
      exposure: 1.2,
      glow: 0.06,
      pt: [0.0, 2.75, 0.6],
      ptCol: [0.35, 0.18, 0.55],
    },
    frame: { fill: 0.95, bottom: 0.02 },
    arrays: { uA: [...peaks.map((p) => [p[0], p[1], p[2], p[3]]), ...cubes], uE: eyes, uG: gaze, uL: lights, uLC: lc, uP: [[peaks.length, peaks.length + cubes.length, 0, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 140
#define VOLUME_FAR 14.0

const vec3 EYE = vec3(0.0, 2.75, 0.15);

/** 들쭉날쭉한 검은 봉우리: 깎인 면이 많은 피라미드 */
float peak(vec3 p, vec4 s, float i) {
  vec3 q = p - vec3(s.x, 0.0, s.y);
  float h = s.z;
  float r0 = s.w;
  q.xz = rot(i * 1.7) * q.xz;
  // 몸 쪽으로 기운다
  q.x += 0.12 * q.y * sign(s.x + 0.001) * (0.4 + 0.3 * hash11(i));
  float t = clamp(q.y / h, 0.0, 1.0);
  float rr = r0 * pow(1.0 - t, 1.6);
  // 능선: 각도에 따라 반지름이 크게 달라지는 산 (골짜기·능선)
  float a = atan(q.z, q.x);
  float facet = 0.75 + 0.25 * abs(cos(a * 2.0 + i)) + 0.15 * (noise(vec3(a * 3.0, q.y * 2.0, i)) - 0.5);
  float d = (length(q.xz) * facet - rr) * 0.5;
  d = max(d, (q.y - h) * 0.7);
  d = max(d, -q.y - 0.02);
  // 깎인 바위 결
  d += 0.05 * (fbm3(q * 3.0 + i) - 0.5) + 0.015 * (ridge(q * 9.0 + i) - 0.5);
  return d;
}

float cubeD(vec3 p, vec4 c, float i) {
  vec3 q = p - c.xyz;
  q.xy = rot(i * 0.9) * q.xy;
  q.yz = rot(i * 1.3) * q.yz;
  return sdRoundBox(q, vec3(c.w), c.w * 0.08) + 0.004 * (noise(q * 40.0) - 0.5);
}

vec2 sdf(vec3 p) {
  float d = 1e5;
  int n0 = int(uP[0].x);
  int n1 = int(uP[0].y);
  for (int i = 0; i < 16; i++) {
    if (i >= n0) break;
    d = smin(d, peak(p, uA[i], float(i)), 0.1);
  }
  vec2 r = vec2(d, 1.0);
  float cb = 1e5;
  for (int i = 0; i < 32; i++) {
    if (i < n0) continue;
    if (i >= n1) break;
    cb = min(cb, cubeD(p, uA[i], float(i)));
  }
  r = umin(r, vec2(cb, 2.0));
  // 봉우리 너머로 솟은 거대한 형체: 두건 쓴 어깨와 머리 — 증기처럼 일렁이는 검은 덩어리
  vec3 eq = p - EYE;
  float alm = max(length(eq.xy - vec2(0.62, 0.0)) - 0.86, length(eq.xy + vec2(0.62, 0.0)) - 0.86);
  float body = sdEllipsoid(p - vec3(0.0, 1.6, -0.8), vec3(1.6, 1.3, 0.7));
  body = smin(body, sdEllipsoid(p - vec3(0.0, 3.05, -0.45), vec3(0.78, 1.2, 0.6)), 0.5);
  body = smin(body, sdEllipsoid(p - vec3(0.0, 4.0, -0.7), vec3(0.45, 0.55, 0.4)), 0.4);
  body += 0.3 * (fbm3(p * vec3(1.2, 0.8, 1.2) + 2.0) - 0.5) + 0.06 * (noise(p * 5.0) - 0.5);
  body = max(body, 0.4 - p.y);
  // 눈자리: 아몬드 모양으로 갈라져 안쪽으로 패였다
  float socket = max(alm + 0.02, -(eq.z + 0.25));
  body = smax(body, -max(alm - 0.03, -eq.z - 0.4), 0.08);
  vec2 r2 = vec2(body * 0.7, 4.0);
  r = umin(r, r2);
  float eye = max(alm, abs(eq.z + 0.12) - 0.04);
  r = umin(r, vec2(eye, 3.0));
  return r;
}

vec3 eyeCol(vec3 p) {
  vec3 eq = p - EYE;
  float alm = max(length(eq.xy - vec2(0.62, 0.0)) - 0.86, length(eq.xy + vec2(0.62, 0.0)) - 0.86);
  // 홍채: 눈 안을 거의 다 채운 큰 원, 방사상의 섬유와 핏줄
  vec2 e = eq.xy - vec2(0.02, -0.04);
  float rr = length(e) / 0.3;
  float ang = atan(e.y, e.x);
  float fib = 0.45 + 0.55 * noise(vec3(ang * 11.0, rr * 9.0, 2.0)) * (0.6 + 0.4 * noise(vec3(ang * 37.0, rr * 3.0, 5.0)));
  vec3 iris = mix(vec3(1.0, 0.5, 1.15), vec3(0.22, 0.04, 0.35), smoothstep(0.0, 0.85, rr)) * fib;
  // 가늘게 찢어진 세로 동공 + 홍채 위를 떠도는 작은 동공 둘
  float pup = abs(e.x) / (0.03 * (1.0 - smoothstep(0.2, 1.1, abs(e.y) / 0.3))) - 1.0;
  pup = min(pup, length(e - vec2(0.13, 0.16)) / 0.028 - 1.0);
  pup = min(pup, length(e - vec2(-0.1, -0.2)) / 0.02 - 1.0);
  float pupil = smoothstep(0.1, -0.2, pup);
  vec3 col = iris * (1.0 - pupil) * smoothstep(1.05, 0.9, rr) * 0.9;
  col += vec3(1.0, 0.7, 1.1) * smoothstep(0.25, 0.0, abs(pup)) * 0.25 * (1.0 - pupil);
  // 흰자위 대신 검붉은 막, 가장자리는 젖어 어둡다
  float sclera = smoothstep(0.9, 1.05, rr);
  col = mix(col, vec3(0.08, 0.02, 0.06) * (0.6 + 0.6 * noise(eq * 20.0)), sclera);
  col *= smoothstep(0.0, -0.06, alm);
  return col;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검은 바위: 서리 낀 결, 보랏빛을 비춘다
    float v = fbm3(p * 5.0);
    float frost = smoothstep(0.35, 0.8, n.y + 0.35 * (fbm3(p * 9.0) - 0.5)) * smoothstep(0.2, 0.7, p.y);
    vec3 alb = vec3(0.016, 0.015, 0.02) * (0.6 + 0.8 * v);
    alb = mix(alb, vec3(0.2, 0.23, 0.3), frost * 0.85);
    // 눈빛이 바위 윗면에 번진다
    float lit = 1.0 / (1.0 + 1.2 * dot(p - EYE, p - EYE));
    return Mat(alb, 0.6, 0.6, vec3(0.08, 0.03, 0.12) * lit * (0.3 + frost), 0.0, 0.0, 0.25);
  }
  if (id < 2.5) {
    // 떠 있는 검은 돌덩이
    return Mat(vec3(0.02, 0.018, 0.025) * (0.7 + 0.6 * noise(p * 30.0)), 0.5, 0.6, vec3(0.0), 0.0, 0.0, 0.2);
  }
  if (id > 3.5) {
    // 형체의 살: 거의 검은 보랏빛, 속에서 희미한 빛줄기가 흐른다. 눈가로 갈수록 젖은 살
    vec3 eq = p - EYE;
    float alm = max(length(eq.xy - vec2(0.62, 0.0)) - 0.86, length(eq.xy + vec2(0.62, 0.0)) - 0.86);
    float nearEye = smoothstep(0.25, 0.0, alm);
    float vein = smoothstep(0.05, 0.0, ridge(p * vec3(2.0, 0.7, 2.0) + 3.0)) * smoothstep(0.4, 0.7, noise(p * 1.5));
    float v = fbm3(p * 3.0);
    vec3 alb = vec3(0.01, 0.007, 0.014) * (0.6 + 0.8 * v);
    vec3 emi = vec3(0.25, 0.08, 0.45) * vein * 0.1 + vec3(0.35, 0.1, 0.4) * nearEye * 0.08;
    return Mat(alb, mix(0.85, 0.25, nearEye), mix(0.15, 1.0, nearEye), emi, 0.1, 0.2, nearEye * 0.8);
  }
  // 젖은 눈알: 반사 하이라이트를 더한다
  vec3 V = normalize(uCamPos - p);
  vec3 eq = p - EYE;
  float hl = smoothstep(0.03, 0.0, length(eq.xy - vec2(-0.06, 0.18)) - 0.012) * 1.5;
  return Mat(vec3(0.0), 1.0, 0.0, eyeCol(p) + vec3(0.9, 0.85, 1.0) * hl, 0.0, 0.0, 0.0);
}

// 보랏빛 증기: 봉우리들 위로 두건 쓴 거대한 형체처럼 부푼다. 눈 둘레는 갈라져 눈꺼풀이 된다
vec4 volume(vec3 p) {
  if (p.y < 0.2 || p.y > 4.7 || abs(p.x) > 2.4 || abs(p.z) > 1.6) return vec4(0.0);
  float y = p.y;
  // 형체: 위로 갈수록 넓어지다 머리에서 둥글게 닫힌다
  float rad = 0.5 + 0.95 * smoothstep(0.6, 2.8, y) - 0.7 * smoothstep(3.7, 4.7, y);
  vec3 w = p * vec3(1.1, 0.7, 1.1) + vec3(0.0, -y * 0.3, 0.0);
  vec3 warp = vec3(fbm3(w + 1.0), fbm3(w + 4.0), fbm3(w + 7.0)) - 0.5;
  vec3 pw = p + warp * 0.9;
  // 부풀어 오른 덩이 (큰 잡음으로 둥근 엽을 만든다)
  rad += 0.35 * (noise(p * vec3(1.6, 1.2, 1.6) + 9.0) - 0.5);
  float dShape = (length(pw.xz * vec2(0.85, 1.4)) - rad);
  // 어깨처럼 양옆으로 늘어진 증기
  dShape = min(dShape, length((pw - vec3(0.0, 3.0, -0.2)) * vec3(0.55, 1.6, 1.2)) - 0.9);
  float n1 = fbm3(p * 2.6 + vec3(0.0, uSeed, 0.0));
  float ds = dShape + (n1 - 0.5) * 0.9;
  float dens = smoothstep(0.35, -0.3, ds) * smoothstep(-1.0, -0.2, ds + 0.2 * n1);
  dens *= 0.3 + 0.9 * smoothstep(0.35, 0.7, n1);
  // 눈 앞은 갈라진 틈 — 하지만 가는 증기 가닥이 눈 앞을 가로지른다
  vec3 eq = p - EYE;
  float slit = length(vec2(eq.x / 0.42, eq.y / 0.95));
  float wisp = smoothstep(0.62, 0.75, fbm3(p * vec3(5.0, 1.5, 5.0) + 3.0));
  float open = smoothstep(0.85, 1.3, slit + (n1 - 0.5) * 0.5);
  dens *= mix(wisp * 0.6, 1.0, open) * step(-0.7, eq.z) + step(eq.z, -0.7);
  // 봉우리 사이로 흘러내리는 증기 가닥
  float tend = smoothstep(0.62, 0.8, fbm3(vec3(p.x * 3.0, p.y * 0.6, p.z * 3.0) + 11.0)) * smoothstep(1.6, 0.0, abs(p.x)) * smoothstep(1.6, 0.3, y);
  dens = max(dens * smoothstep(0.3, 1.3, y), tend * 0.5 * smoothstep(0.1, 0.4, y));
  if (dens < 0.002) return vec4(0.0);
  // 빛: 속은 어둡고 가장자리(형체의 경계)와 눈 둘레만 빛난다 → 거대한 덩어리의 입체감
  float de = length(eq);
  float edge = smoothstep(-0.5, 0.1, ds);
  vec3 rd = normalize(p - uCamPos);
  float fw = pow(max(dot(rd, -normalize(uKeyDir)), 0.0), 3.0);
  vec3 col = vec3(0.3, 0.13, 0.48) * (0.2 + 0.5 * edge + 0.8 / (1.0 + 3.0 * de * de)) + vec3(0.3, 0.25, 0.5) * fw * 0.8;
  col *= 0.5 + 0.7 * n1;
  return vec4(col * dens * 0.9, dens * 1.8);
}
`,
  };
}
