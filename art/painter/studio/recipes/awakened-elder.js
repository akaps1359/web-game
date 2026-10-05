// 깨어난 원로 (3층 계층군주) — 수억 년 전 얼음 속에 잠든 고대인(Elder Thing)의 원로. 모닥불의 온기에 얼음이 녹자 다섯 눈을 떴다.
// 다섯 줄기 등마루가 선 통 모양의 몸, 꼭대기엔 다섯 갈래 별 모양 머리와 그 끝마다 눈자루에 달린 눈.
// 몸 가운데서 다섯 갈래 가는 촉수 팔이 뻗고 끝은 다섯 가닥으로 갈라진다. 아래는 다섯 갈래 굵은 촉수 발.
// 등마루 사이 골에서 접혀 있던 막날개가 부채처럼 활짝 펴졌다. 하반신은 아직 깨진 얼음덩이에 물려 있고,
// 녹은 물에 젖어 번들거리는 가죽 위로 서리가 남았다. 아래에서 올려다보는 구도.
// elderThing(cfg)는 고대인 사냥꾼(elder-hunter)·고대인 해부학자(elder-vivisector)도 쓴다.
import { rng } from '../../lib.js';

const f4 = (x) => (+x).toFixed(4);
const v3 = (a) => `vec3(${a.map(f4).join(', ')})`;
const norm = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, s) => a.map((v) => v * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** 회전 행렬 (yaw: y축, pitch: x축, roll: z축) — 몸 좌표 → 세계 */
function rotM(yaw, pitch, roll) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  const Ry = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const Rx = [
    [1, 0, 0],
    [0, cp, -sp],
    [0, sp, cp],
  ];
  const Rz = [
    [cr, -sr, 0],
    [sr, cr, 0],
    [0, 0, 1],
  ];
  const mm = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
  return mm(Ry, mm(Rx, Rz));
}

/**
 * cfg:
 *  seed, origin [x,y,z] (몸 좌표 원점의 세계 위치), rot [yaw,pitch,roll]
 *  scale: 몸 크기 배율 (몸 좌표 그대로, 원점 기준)
 *  wings: [{ a: 골 각도(라디안, 0 = +x), y, len, phi0, phi1, back, tilt }]
 *  arms: [{ a, y, path: (t) => [x,y,z] (몸 좌표, 팔 끝까지), fingers: 'grab'|'spread'|'scalpel' }]
 *  feet: 'stand' | 'trail'
 *  head: { tilt (앞으로 숙임), stalk: 눈자루 길이 }
 *  extraGlsl, extraSdf, extraMat, extraArrays, cam, light, frame, eyeKind, ice, wet
 */
export function elderThing(cfg = {}) {
  const C = {
    seed: 1,
    origin: [0, 0, 0],
    rot: [0, 0, 0],
    scale: 1,
    feet: 'stand',
    head: { tilt: 0.25, stalk: 0.3 },
    eyeKind: 0,
    ice: 0.0,
    wet: 0.6,
    extraGlsl: '',
    extraSdf: '',
    extraMat: '',
    extraArrays: {},
    noGround: false,
    ...cfg,
  };
  const R = rng(C.seed * 733 + 17);
  const M = rotM(...C.rot);
  const S = C.scale;
  const toW = (q) => add(C.origin, [0, 1, 2].map((i) => S * (M[i][0] * q[0] + M[i][1] * q[1] + M[i][2] * q[2])));

  // 몸 비례 (몸 좌표, 단위: 미터 비슷)
  const Y0 = 0.5; // 통 아래 끝
  const Y1 = 1.9; // 통 위 끝
  const YM = (Y0 + Y1) / 2;
  const HH = (Y1 - Y0) / 2;
  const RB = 0.37;
  const rb = (y) => RB * Math.sqrt(Math.max(0, 1 - Math.pow((y - YM) / (HH + 0.12), 2)));
  const radial = (a) => [Math.cos(a), 0, Math.sin(a)];
  // 등마루는 a = 90° (앞) + k·72°, 골은 그 사이
  const ridgeA = (k) => Math.PI / 2 + (k * 2 * Math.PI) / 5;
  const furrowA = (k) => ridgeA(k) + Math.PI / 5;
  const headC = [0, Y1 + 0.27, 0.04];
  const ht = C.head.tilt;

  // ── 사슬 (uB): 발 → 팔 → 눈자루 (몸 좌표)
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const groups = []; // [시작, 끝] 재질 구분
  // 발: 아래 별 모양 밑판에서 다섯 갈래 굵은 촉수
  let g0 = ch.length;
  for (let k = 0; k < 5; k++) {
    const a = ridgeA(k) + (R() - 0.5) * 0.25;
    const d = radial(a);
    const N = 6;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      let p;
      if (C.feet === 'trail') {
        // 날 때: 뒤로 늘어뜨린다 (몸 좌표 -y 쪽으로 길게, 조금씩 꼬인다)
        p = [d[0] * (0.16 + 0.22 * t) + Math.sin(t * 5 + k) * 0.06, Y0 + 0.02 - t * 0.85, d[2] * (0.16 + 0.22 * t) + Math.cos(t * 4 + k) * 0.06];
      } else {
        // 서 있을 때: 바깥으로 뻗어 바닥을 짚고 끝이 말린다
        const out = 0.12 + (C.footReach ?? 0.55) * Math.pow(t, 0.8);
        const yy = Y0 + 0.02 - 0.42 * Math.sin(Math.min(t, 0.75) / 0.75 * Math.PI / 2) + (t > 0.75 ? (t - 0.75) * 0.5 : 0);
        p = [d[0] * out, Math.max(0.06, yy), d[2] * out];
        if (t > 0.8) {
          const c = (t - 0.8) / 0.2;
          p = add(p, mul(d, -0.08 * c));
          p[1] += 0.06 * c;
        }
      }
      ch.push([...p, (C.footR ?? 0.12) * Math.pow(1 - t, 0.8) + 0.02]);
    }
    brk();
  }
  groups.push([g0, ch.length]);
  // 팔: 통 가운데 등마루에서 (cfg.arms)
  g0 = ch.length;
  const armTips = [];
  for (const arm of C.arms ?? []) {
    const N = 6;
    const pts = [];
    for (let i = 0; i < N; i++) pts.push(arm.path(i / (N - 1)));
    for (let i = 0; i < N; i++) ch.push([...pts[i], 0.05 * Math.pow(1 - i / (N - 1), 1.2) + 0.01]);
    brk();
    const tip = pts[N - 1];
    const dir = norm(add(tip, mul(pts[N - 2], -1)));
    armTips.push({ tip, dir, kind: arm.fingers ?? 'spread' });
    // 다섯 가닥 손: 끝에서 갈라진다
    let side = norm(cross(dir, [0, 1, 0]));
    if (!isFinite(side[0])) side = [1, 0, 0];
    const up2 = cross(side, dir);
    const nF = 3;
    for (let f = 0; f < nF; f++) {
      const ang = (f / nF) * Math.PI * 2 + R() * 0.5;
      const spread = arm.fingers === 'grab' ? 0.35 : arm.fingers === 'scalpel' ? 0.25 : 0.7;
      const fd = norm(add(dir, add(mul(side, Math.cos(ang) * spread), mul(up2, Math.sin(ang) * spread))));
      const curl = arm.fingers === 'grab' ? -0.9 : 0.25;
      const a1 = add(tip, mul(fd, 0.09));
      const fd2 = norm(add(fd, mul(add(mul(side, Math.cos(ang)), mul(up2, Math.sin(ang))), curl)));
      const a2 = add(a1, mul(fd2, 0.08));
      ch.push([...tip, 0.012], [...a1, 0.008], [...a2, 0.003]);
      brk();
    }
  }
  groups.push([g0, ch.length]);
  // 눈자루: 별 머리 끝마다 (머리 좌표 → 몸 좌표)
  g0 = ch.length;
  const eyesB = [];
  const headPt = (x, y, z) => {
    // 머리를 앞으로 ht만큼 숙임 (x축 회전)
    const c = Math.cos(ht);
    const s = Math.sin(ht);
    return [headC[0] + x, headC[1] + c * y - s * z, headC[2] + s * y + c * z];
  };
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5 + 0.2;
    const tipR = 0.43;
    const base = headPt(Math.cos(a) * tipR, 0.01, Math.sin(a) * tipR);
    const L = C.head.stalk * (0.8 + R() * 0.4);
    const N = 3;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / N;
      pts.push(headPt(Math.cos(a) * (tipR + L * 0.45 * t), 0.01 + L * Math.sin(t * 1.3) * 0.75, Math.sin(a) * (tipR + L * 0.45 * t)));
    }
    ch.push([...base, 0.022]);
    for (let i = 0; i < N; i++) ch.push([...pts[i], 0.018 - i * 0.002]);
    brk();
    eyesB.push(pts[N - 1]);
  }
  groups.push([g0, ch.length]);

  // 눈 (세계 좌표)
  const eyes = [];
  const gaze = [];
  const camPos = C.cam?.pos ?? [0, 1.5, 9];
  for (const e of eyesB) {
    const w = toW(e);
    eyes.push([...w, (C.eyeR ?? 0.026) * S]);
    const gd = norm(add(camPos, mul(w, -1)));
    gaze.push([gd[0] + (R() - 0.5) * 0.5, gd[1] + (R() - 0.5) * 0.3, gd[2], C.eyeKind]);
  }

  // 날개 (몸 좌표 상수)
  const wingDefs = (C.wings ?? []).map((w) => {
    const a = w.a;
    const d = radial(a);
    const root = [d[0] * (rb(w.y) - 0.04), w.y, d[2] * (rb(w.y) - 0.04)];
    // 날개 평면: u = 바깥(+조금 뒤로), v = 위(+기울기)
    const back = w.back ?? 0.3;
    const u = norm([d[0], w.lift ?? 0.0, d[2] - back]);
    let v = [0, 1, 0];
    const tilt = w.tilt ?? 0;
    v = norm(add(v, mul([0, 0, -1], tilt)));
    // v를 u에 직교하게
    const dv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    v = norm(add(v, mul(u, -dv)));
    return { root, u, v, len: w.len, phi0: w.phi0, phi1: w.phi1 };
  });
  const wingGlsl = wingDefs
    .map((w, i) => `  d = min(d, wing(q, ${v3(w.root)}, ${v3(w.u)}, ${v3(w.v)}, ${f4(w.len)}, ${f4(w.phi0)}, ${f4(w.phi1)}, ${i}.0, wr));`)
    .join('\n');

  const wingUVGlsl = `vec2 wingUV(vec3 q) {
  vec2 best = vec2(0.0);
  float bd = 1e5;
${wingDefs
  .map(
    (w) => `  {
    vec3 d = q - ${v3(w.root)};
    vec3 u = ${v3(w.u)};
    vec3 v = ${v3(w.v)};
    float c = abs(dot(d, cross(u, v)));
    if (c < bd) { bd = c; best = vec2(length(vec2(dot(d, u), dot(d, v))) / ${f4(w.len)}, (atan(dot(d, v), dot(d, u)) - ${f4(w.phi0)}) / ${f4((w.phi1 - w.phi0) / 6)}); }
  }`,
  )
  .join(String.fromCharCode(10))}
  return best;
}`;
  const Mrows = [0, 1, 2].map((i) => [M[0][i], M[1][i], M[2][i]]); // 전치 = 역회전 (세계 → 몸)
  const light = {
    key: [-0.3, 0.55, -0.78],
    rim: 1.8,
    fillCol: [0.06, 0.14, 0.13],
    amb: [0.014, 0.02, 0.028],
    exposure: 1.25,
    glow: 0.07,
    eyeEmit: 2.0,
    ...(C.light ?? {}),
  };

  return {
    preset: 'act3',
    cam: C.cam ?? { pos: [0.4, 0.6, 9.5], target: [0, 1.5, 0], fov: 1.8 },
    light,
    frame: { fill: 0.94, bottom: 0.025, ...(C.frame ?? {}) },
    arrays: { uB: ch, uE: eyes, uG: gaze, uP: [[groups[0][1], groups[1][1], groups[2][1], 0]], ...C.extraArrays },
    glsl: /* glsl */ `
${C.noGround ? '#define NO_GROUND' : ''}
${C.steam ? ['#define HAS_VOLUME', '#define VOLUME_STEPS 96', '#define VOLUME_FAR 13.0'].join(String.fromCharCode(10)) : ''}
const vec3 ORIGIN = ${v3(C.origin)};
const mat3 WTOB = mat3(${Mrows.map((r) => r.map(f4).join(', ')).join(', ')});
const float SCALE = ${f4(S)};
const float Y0 = ${f4(Y0)};
const float Y1 = ${f4(Y1)};
const float YM = ${f4(YM)};
const float HH = ${f4(HH)};
const float RB = ${f4(RB)};
const vec3 HEADC = ${v3(headC)};
const float HTILT = ${f4(ht)};
const float ICE = ${f4(C.ice)};
const float WET = ${f4(C.wet)};

vec3 toBody(vec3 p) {
  // mat3(...)는 열 우선: 열 = 몸→세계 행렬의 행 → 곱하면 세계→몸
  return transpose(WTOB) * ((p - ORIGIN) / SCALE);
}

/** 사슬 구간 [a, b) — 가까운 것만 계산 */
float chainSeg(vec3 p, int a, int b, float k, float cur) {
  float d = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i < a) continue;
    if (i + 1 >= b) break;
    vec4 s0 = uB[i];
    vec4 s1 = uB[i + 1];
    if (s0.w <= 0.0 || s1.w <= 0.0) continue;
    float bd = length(p - s0.xyz) - length(s1.xyz - s0.xyz) - s0.w - 0.1;
    if (bd > min(d, cur)) continue;
    d = smin(d, sdRoundCone(p, s0.xyz, s1.xyz, s0.w, s1.w), k);
  }
  return d;
}

float wingRibs;
/** 부채꼴 막날개: 뿌리 o, 펼친 방향 u, 위 v, 길이 L, 각도 범위 — 살 5개, 살 사이는 처지고 주름진다 */
float wing(vec3 q, vec3 o, vec3 u, vec3 v, float L, float ph0, float ph1, float wi, out float rib) {
  // 반쯤 펼친 쥘부채: 살 7개, 살 사이 막은 아코디언처럼 접혔다 (살이 번갈아 앞뒤로)
  vec3 d = q - o;
  vec3 nn = cross(u, v);
  float a = dot(d, u);
  float b = dot(d, v);
  float c = dot(d, nn);
  rib = 1e5;
  if (length(d) > L * 1.15 + 0.1) return length(d) - L * 1.1;
  float r = length(vec2(a, b));
  float ph = atan(b, a);
  const float NP = 6.0;
  float dph = (ph1 - ph0) / NP;
  float fi = (ph - ph0) / dph;
  float fr = fract(fi);
  float sag = 0.07 * pow(sin(3.14159 * clamp(fr, 0.0, 1.0)), 1.5);
  float tear = 0.12 * smoothstep(0.62, 0.85, noise(vec3(ph * 6.0, wi * 7.0, 1.0)));
  float edge = L * (1.0 - sag) * (1.0 - tear) - L * 0.025 * noise(vec3(ph * 30.0, wi, 3.0));
  float d2 = max(r - edge, max(ph0 - ph, ph - ph1) * r);
  float A = 0.07 * (L / 1.6);
  float zig = (abs(fract(fi * 0.5) - 0.5) * 4.0 - 1.0);
  float pleat = A * (r / L) * zig + 0.12 * (r / L) * (r / L);
  float mem = max(d2, (abs(c - pleat) - 0.005 - 0.004 * (1.0 - r / L)) * 0.7);
  for (int i = 0; i < 7; i++) {
    float phi = ph0 + float(i) * dph;
    vec3 dir = cos(phi) * u + sin(phi) * v;
    float sg = (i - (i / 2) * 2) == 0 ? 1.0 : -1.0;
    vec3 m1 = o + dir * L * 0.5 + nn * (A * 0.5 * sg + 0.12 * 0.25);
    vec3 e1 = o + dir * L * 1.0 + nn * (A * sg + 0.12);
    rib = min(rib, sdRoundCone(q, o, m1, 0.04, 0.022));
    rib = min(rib, sdRoundCone(q, m1, e1, 0.022, 0.005));
  }
  rib = min(rib, length(d) - 0.07);
  return mem;
}

${C.extraGlsl}
${wingUVGlsl}
${
  C.steam
    ? `
// 녹는 얼음에서 피어오르는 김: 뒤에서 오는 빛에 하얗게 비친다
vec4 volume(vec3 pw) {
  vec3 q = toBody(pw);
  float rr = length(q.xz);
  if (q.y < -0.05 || q.y > 2.6 || rr > 1.7) return vec4(0.0);
  float h = q.y;
  vec3 w = q * vec3(2.2, 1.3, 2.2) + vec3(0.0, -h * 0.8, 3.0);
  float n1 = fbm3(w);
  float dens = smoothstep(0.42, 0.72, n1) * smoothstep(1.7, 0.6, rr) * (smoothstep(1.4, 0.1, h) * 1.0 + 0.25 * smoothstep(2.6, 1.2, h));
  if (dens < 0.001) return vec4(0.0);
  vec3 rd = normalize(pw - uCamPos);
  float fw = pow(max(dot(rd, -normalize(uKeyDir)), 0.0), 4.0);
  vec3 col = vec3(0.16, 0.22, 0.3) * (0.35 + 2.2 * fw);
  return vec4(col * dens * ${f4(C.steam)}, dens * 2.2 * ${f4(C.steam)});
}
`
    : ''
}

vec2 sdf(vec3 pw) {
  vec3 q = toBody(pw);
  float cur = 1e5;
  // ── 통 몸통: 다섯 등마루, 가로 주름
  vec3 bq = q - vec3(0.0, YM, 0.0);
  float body = sdEllipsoid(bq, vec3(RB, HH + 0.12, RB));
  vec3 fq = polarRep(vec3(q.x, q.y, q.z), 5.0);
  // polarRep은 x축 기준으로 접는다 → 등마루를 a = 90°에 맞추려면 돌려서 접는다
  vec3 rq = q;
  rq.xz = rot(1.5708) * rq.xz;
  fq = polarRep(rq, 5.0);
  float yy = clamp((q.y - YM) / (HH + 0.12), -1.0, 1.0);
  float rbody = RB * sqrt(max(1.0 - yy * yy, 0.0));
  float rdg = length(vec2(fq.x - rbody + 0.005, fq.z * 1.3)) - 0.06 * smoothstep(1.0, 0.55, abs(yy));
  rdg = max(rdg, abs(q.y - YM) - HH + 0.02);
  body = smin(body, rdg, 0.06);
  float wr2 = ridge(vec3(q.x * 3.0, q.y * 16.0, q.z * 3.0) + fbm3(q * 3.0) * 2.0);
  // 골: 등마루 사이를 파낸다 (날개가 접혀 있던 홈)
  vec3 gq = rq;
  gq.xz = rot(0.6283) * gq.xz;
  gq = polarRep(gq, 5.0);
  body = smax(body, -(length(vec2(gq.x - rbody - 0.02, gq.z)) - 0.035), 0.03);
  // 위아래 목·밑판
  body = smin(body, sdRoundCone(q, vec3(0.0, Y1 - 0.05, 0.0), HEADC - vec3(0.0, 0.08, 0.0), 0.16, 0.1), 0.08);
  body = smin(body, sdEllipsoid(q - vec3(0.0, Y0 + 0.02, 0.0), vec3(0.22, 0.12, 0.22)), 0.1);
  // 가로 주름 + 가죽 결
  body += 0.004 * smoothstep(0.25, 0.0, wr2) * smoothstep(0.95, 0.4, abs(yy)) + 0.012 * (fbm3(q * 5.0) - 0.5) + 0.02 * (noise(q * 2.5) - 0.5);
  cur = body;

  // ── 별 머리: 다섯 갈래 납작한 팔, 가운데가 불룩
  vec3 hq = q - HEADC;
  hq.yz = rot(HTILT) * hq.yz;
  float head = sdEllipsoid(hq, vec3(0.13, 0.09, 0.13));
  for (int k = 0; k < 5; k++) {
    float a = 1.5708 + float(k) * 1.2566 + 0.2;
    vec3 tip = vec3(cos(a) * 0.44, 0.0, sin(a) * 0.44);
    head = smin(head, sdRoundCone(hq, vec3(0.0), tip, 0.095, 0.026), 0.05);
    // 팔 사이의 숨관: 끝이 종처럼 벌어진 짧은 관
    float a2 = a + 0.6283;
    vec3 tb = vec3(cos(a2) * 0.2, 0.07, sin(a2) * 0.2);
    float tube = sdRoundCone(hq, vec3(cos(a2) * 0.08, 0.02, sin(a2) * 0.08), tb, 0.022, 0.016);
    tube = smin(tube, sdCappedCone((hq - tb - vec3(0.0, 0.015, 0.0)), 0.015, 0.02, 0.034), 0.01);
    tube = max(tube, -sdCappedCone((hq - tb - vec3(0.0, 0.03, 0.0)), 0.02, 0.012, 0.026));
    head = smin(head, tube, 0.02);
  }
  head += 0.004 * (fbm3(hq * 20.0) - 0.5);
  float flesh = smin(body, head, 0.06);

  // ── 사슬: 발, 팔, 눈자루
  float feet = chainSeg(q, 0, int(uP[0].x), 0.015, flesh);
  flesh = smin(flesh, feet, 0.12);
  float arms = chainSeg(q, int(uP[0].x), int(uP[0].y), 0.006, flesh);
  flesh = smin(flesh, arms, 0.05);
  float stalks = chainSeg(q, int(uP[0].y), int(uP[0].z), 0.004, flesh);
  flesh = smin(flesh, stalks, 0.03);
  vec2 r = vec2(flesh * SCALE, 1.0);
  if (feet < body - 0.02 || arms < body - 0.02) r.y = 2.0;
  if (stalks < head - 0.005) r.y = 2.0;

  // ── 막날개
  float d = 1e5;
  float wr = 1e5;
  float wrAll = 1e5;
${wingGlsl.replace(/, wr\)\);/g, ', wr)); wrAll = min(wrAll, wr);')}
  if (d < 1e4) {
    r = umin(r, vec2(d * SCALE, 3.0));
    r = umin(r, vec2(smin(wrAll, flesh + 0.02, 0.04) * SCALE, 4.0));
  }
  ${C.extraSdf}
  return r;
}

Mat material(float id, vec3 pw, vec3 n) {
  vec3 q = toBody(pw);
  float frost = ICE * smoothstep(0.3, 0.8, n.y + 0.4 * (fbm3(q * 6.0) - 0.5)) * smoothstep(${f4(C.frostTop ?? 3.0)}, 0.4, q.y);
  float glint = step(0.996, hash31(floor(q * 380.0))) * frost;
  ${C.extraMat}
  if (id < 2.5) {
    // 질긴 가죽: 짙은 회록색, 등마루는 더 검고, 녹은 물에 젖어 번들거린다
    vec3 rq = q;
    rq.xz = rot(1.5708) * rq.xz;
    vec3 fq = polarRep(rq, 5.0);
    float onRidge = smoothstep(0.05, 0.0, abs(fq.z)) * step(q.y, Y1) * step(Y0, q.y);
    float v = fbm3(q * 7.0);
    float mott = smoothstep(0.45, 0.7, noise(q * 3.0));
    vec3 alb = vec3(0.05, 0.064, 0.058) * (0.6 + 0.8 * v);
    alb = mix(alb, vec3(0.03, 0.035, 0.034), onRidge * 0.7);
    alb = mix(alb, vec3(0.075, 0.07, 0.055), mott * 0.35);
    if (id > 1.5) {
      // 촉수·눈자루: 끝으로 갈수록 붉은 살빛
      alb = mix(alb, vec3(0.11, 0.06, 0.05), smoothstep(0.35, 0.8, noise(q * 2.0)) * 0.6);
    }
    alb = mix(alb, vec3(0.24, 0.29, 0.34), frost);
    float wet = WET * (0.5 + 0.5 * smoothstep(0.3, 0.7, fbm3(q * 4.0 + 7.0))) * (1.0 - frost);
    return Mat(alb, mix(0.5, 0.18, wet), 0.45 + wet * 1.1, vec3(0.5, 0.75, 1.0) * glint * 0.4, 0.15, 0.35, wet);
  }
  if (id < 3.5) {
    // 막: 빛이 비쳐 드는 얇은 가죽, 핏줄이 갈라진다
    vec2 wuv = wingUV(q);
    float wv = wuv.y * 1.5 + 0.35 * (fbm3(q * 3.0) - 0.5) + 0.08 * sin(wuv.x * 11.0);
    float sub = abs(fract(wv) - 0.5);
    float vein = smoothstep(0.035, 0.0, abs(sub - 0.5 + 0.0) - 0.0) * 0.0;
    vein += smoothstep(0.06, 0.0, ridge(vec3(wuv.y * 4.5, wuv.x * 2.5, 0.0) + fbm3(q * 2.0))) * smoothstep(0.1, 0.4, wuv.x) * 0.7;
    vein += smoothstep(0.05, 0.0, ridge(q * 16.0 + 5.0)) * 0.35;
    vein = clamp(vein, 0.0, 1.0);
    float ribDark = smoothstep(0.1, 0.0, abs(fract(wuv.y * 2.0 + 0.5) - 0.5));
    float thin = (0.35 + 0.65 * smoothstep(0.15, 0.95, wuv.x)) * (0.6 + 0.4 * fbm3(q * 5.0)) * (1.0 - ribDark * 0.7);
    vec3 V = normalize(uCamPos - pw);
    float back = 0.35 + 0.65 * pow(max(dot(-V, normalize(uKeyDir)), 0.0), 1.5);
    // 뒤에서 비쳐 드는 빛: 핏줄은 검게 남는다
    float facing = abs(dot(n, V));
    float blot = smoothstep(0.3, 0.75, fbm3(q * 2.2 + 4.0));
    vec3 emi = vec3(0.05, 0.11, 0.1) * thin * back * (1.0 - vein * 0.9) * (0.35 + 0.65 * facing) * (0.55 + 0.6 * blot) * ${f4(C.wingGlow ?? 1)};
    vec3 alb = mix(vec3(0.04, 0.048, 0.045), vec3(0.03, 0.01, 0.01), vein);
    alb = mix(alb, vec3(0.2, 0.24, 0.28), frost * 0.4);
    return Mat(alb, 0.4, 0.6, emi, 0.1, 0.8, WET * 0.7);
  }
  // 날개 살: 검고 단단하다
  vec3 alb = vec3(0.025, 0.03, 0.028) * (0.7 + 0.5 * fbm3(q * 12.0));
  alb = mix(alb, vec3(0.22, 0.26, 0.3), frost * 0.6);
  return Mat(alb, 0.4, 0.6, vec3(0.0), 0.1, 0.2, WET * 0.6);
}
`,
  };
}

export default function awakenedElder({ seed = 1 } = {}) {
  const R = rng(seed * 97 + 3);
  // 팔: 등마루에서 뻗는 다섯 촉수 (몸 좌표 경로: 출발 각도 a, 높이 y, 끝점 tip, 휘는 정도 w)
  const arm = (a, y, tip, w) => (t) => {
    const d = [Math.cos(a), 0, Math.sin(a)];
    const p0 = [d[0] * 0.36, y, d[2] * 0.36];
    const p1 = [d[0] * 0.75, y + 0.05, d[2] * 0.75 + 0.2];
    const m = 1 - t;
    const b = [0, 1, 2].map((i) => m * m * p0[i] + 2 * m * t * p1[i] + t * t * tip[i]);
    return [b[0] + Math.sin(t * 6 + a) * w, b[1] + Math.cos(t * 5 + a) * w, b[2] + Math.sin(t * 4) * w * 0.5];
  };
  const arms = [
    { path: arm(Math.PI / 2 + 0.15, 1.2, [0.35, 0.75, 1.45], 0.06), fingers: 'spread' },
    { path: arm(Math.PI / 2 + 1.3, 1.25, [-1.4, 1.75, 0.8], 0.07), fingers: 'grab' },
    { path: arm(Math.PI / 2 - 1.2, 1.28, [1.35, 2.0, 0.65], 0.07), fingers: 'spread' },
    { path: arm(Math.PI / 2 + 2.5, 1.15, [-1.15, 0.85, 0.6], 0.05), fingers: 'grab' },
    { path: arm(Math.PI / 2 - 2.4, 1.18, [1.1, 1.05, 0.75], 0.05), fingers: 'spread' },
  ];
  // 얼음덩이: 앞이 깨져 열린 얼음 껍데기 조각들 (몸 좌표: 중심, 크기, 기울기)
  const slabs = [];
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 + 0.9 + (i / 7) * (2 * Math.PI - 1.8) + (R() - 0.5) * 0.2;
    const rr = 0.6 + R() * 0.12;
    const h = 0.35 + R() * 0.45;
    slabs.push([Math.cos(a) * rr, h * 0.3, Math.sin(a) * rr, h]);
  }
  // 앞으로 쓰러진 조각과 부스러기
  slabs.push([0.5, 0.06, 0.95, 0.22], [-0.4, 0.05, 1.05, 0.16], [0.05, 0.03, 1.3, 0.1], [-0.9, 0.05, 0.7, 0.14]);
  // 녹은 물방울·서리 김
  const lights = [];
  const lc = [];
  for (let i = 0; i < 10; i++) {
    lights.push([(R() - 0.5) * 1.6, 0.4 + R() * 1.6, 0.3 + R() * 0.6, 0.004 + R() * 0.005]);
    lc.push([0.6, 0.85, 1.0, 0.8]);
  }
  return elderThing({
    seed,
    origin: [0, 0, 0],
    rot: [0.55, -0.08, 0.04],
    scale: 1.0,
    arms,
    wings: [
      { a: Math.PI / 2 - (3 * Math.PI) / 5 + 0.2, y: 1.62, len: 1.7, phi0: -0.1, phi1: 1.6, back: 0.9, lift: 0.2 },
      { a: Math.PI / 2 + (3 * Math.PI) / 5 - 0.2, y: 1.58, len: 1.6, phi0: -0.2, phi1: 1.4, back: 0.9, lift: 0.15 },
    ],
    head: { tilt: 0.95, stalk: 0.36 },
    ice: 0.75,
    frostTop: 1.3,
    wet: 0.85,
    cam: { pos: [0.9, 0.3, 8.6], target: [0, 1.55, 0], fov: 1.62 },
    wingGlow: 0.6,
    steam: 1.0,
    light: { pt: [0.5, 0.3, 2.2], ptCol: [0.6, 0.28, 0.1], key: [-0.3, 0.55, -0.78], rim: 2.2, fillCol: [0.05, 0.13, 0.11] },
    extraArrays: { uA: slabs, uL: lights, uLC: lc },
    extraGlsl: `
float iceSlab(vec3 q, vec4 s, float i) {
  // 무작위 평면 여덟 장을 교차한 깨진 얼음덩이 (s.w = 크기)
  vec3 lq = q - s.xyz;
  float ang = atan(s.z, s.x);
  lq.xz = rot(ang) * lq.xz;
  // 바깥 방향(x)으로 얇고 위로 길쭉하다
  lq /= vec3(0.6, 1.0, 0.85);
  float d = -1e5;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    vec3 nrm = normalize(vec3(hash11(i * 13.0 + fk * 1.7) - 0.5, hash11(i * 7.0 + fk * 3.1) - 0.5, hash11(i * 3.0 + fk * 5.3) - 0.5));
    d = max(d, dot(lq, nrm) - s.w * (0.32 + 0.18 * hash11(i + fk * 9.1)));
  }
  d = max(d, lq.y - s.w * (0.55 + 0.3 * hash11(i * 2.3)));
  d = max(d, length(lq) - s.w * 0.95);
  d = max(d, -(q.y + 0.02));
  return d * 0.45;
}
`,
    extraSdf: `
  {
    float ice = 1e5;
    for (int i = 0; i < 16; i++) {
      if (i >= uAN) break;
      vec4 s = uA[i];
      if (length(q - s.xyz) > s.w + 0.5) continue;
      ice = min(ice, iceSlab(q, s, float(i)));
    }
    // 발을 문 얼음 바닥
    float base = sdEllipsoid(q - vec3(0.0, 0.0, 0.05), vec3(0.95, 0.2, 0.8));
    base = max(base, -q.y);
    ice = min(ice, base + 0.025 * (fbm3(q * 7.0) - 0.5));
    r = umin(r, vec2(ice * SCALE, 20.0));
  }
`,
    extraMat: `
  if (id > 19.5) {
    vec3 V = normalize(uCamPos - pw);
    float fr = 1.0 - abs(dot(n, V));
    float bub = smoothstep(0.7, 0.9, noise(q * vec3(40.0, 5.0, 40.0))) * (0.4 + 0.6 * noise(q * 3.0));
    float crack = smoothstep(0.02, 0.0, ridge(q * vec3(4.0, 2.0, 4.0) + 3.0)) * smoothstep(0.55, 0.75, noise(q * 3.0 + 1.0));
    float depth = 0.3 + 0.7 * fbm3(q * 2.5);
    vec3 emi = vec3(0.012, 0.035, 0.06) * depth * (1.0 - fr * 0.7) + vec3(0.12, 0.2, 0.3) * (bub * 0.12 + crack * 0.3);
    // 모닥불 빛이 얼음 속에 번진다

    float top = smoothstep(0.6, 0.95, n.y) * smoothstep(0.3, 0.6, fbm3(q * 9.0));
    vec3 alb = mix(vec3(0.008, 0.014, 0.022), vec3(0.16, 0.2, 0.26), top * 0.7);
    return Mat(alb, 0.08 + top * 0.6, 1.0, emi, 0.0, 0.15, 0.22);
  }
`,
  });
}
