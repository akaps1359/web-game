// 이스의 방랑자 (4층 정예) — 이스의 위대한 종족. 소용돌이 주름이 감긴 거대한 원뿔 껍데기가 점액질 밑동 위에 서 있고,
// 꼭대기에서 네 갈래 팔이 뻗는다: 둘은 거대한 갑각 집게, 하나는 검붉은 나팔 다발, 하나는 세 눈이 둘러 박힌 누런 구체 머리.
// 시간을 건너는 자 — 쳐든 집게 사이에 번개총의 창백한 전기가 튄다.
// (셰이더 컴파일이 느려지지 않도록 반복문은 모두 uniform 개수로 돈다 — 상수 범위 반복은 D3D가 통째로 펼친다)
import { rng } from '../../lib.js';

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(+x.toFixed(4)));
const v3 = (a) => `vec3(${a.map(f).join(', ')})`;
const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => mul(a, 1 / Math.hypot(...a));
/** 국소 좌표축 (x = dir, y = spread 쪽) */
const frame = (dir, spread) => {
  const x = nrm(dir);
  const y = nrm(sub(spread, mul(x, dot(spread, x))));
  return [x, y, cross(x, y)];
};
const toWorld = (F, o, l) => add(o, add(add(mul(F[0], l[0]), mul(F[1], l[1])), mul(F[2], l[2])));
/** GLSL mat3: world → local */
const m3 = (F) => `mat3(${[0, 1, 2].map((c) => F.map((ax) => f(ax[c])).join(', ')).join(', ')})`;

/** 사슬 묶음: uB(점) + uP(묶음별 경계 구와 [시작, 끝, 부드러움, 재질]) — 최대 7묶음 */
function chainKit() {
  const uB = [];
  const groups = [];
  let cur = null;
  return {
    uB,
    begin(mat, k) {
      cur = { i0: uB.length, mat, k };
    },
    end() {
      cur.i1 = uB.length;
      const pts = uB.slice(cur.i0, cur.i1).filter((q) => q[3] > 0);
      const c = mul(pts.reduce((s, q) => add(s, q), [0, 0, 0]), 1 / pts.length);
      cur.c = c;
      cur.r = Math.max(...pts.map((q) => Math.hypot(...sub(q.slice(0, 3), c)) + q[3]));
      groups.push(cur);
    },
    line(pts) {
      for (const q of pts) uB.push(q);
      uB.push([0, 0, 0, 0]);
      return pts;
    },
    tube(P, n, r0, r1, pw = 1) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push([...bez(P, t), r0 + (r1 - r0) * Math.pow(t, pw)]);
      }
      return this.line(pts);
    },
    uP() {
      const n = groups.length;
      return [[n, 0, 0, 0], ...groups.map((g) => [...g.c, g.r]), ...groups.map((g) => [g.i0, g.i1, g.k, g.mat])];
    },
  };
}

// 사슬 묶음 SDF (재질 50+ = 속 빈 나팔)
const CHAIN_GLSL = /* glsl */ `
vec2 chainSet(vec3 p) {
  vec2 res = vec2(1e5, 1.0);
  int ng = int(uP[0].x + 0.5);
  for (int g = 0; g < ng; g++) {
    vec4 bs = uP[1 + g];
    vec4 gi = uP[1 + ng + g];
    float k = gi.z;
    float d = length(p - bs.xyz) - bs.w;
    bool bell = gi.w > 49.5;
    if (d < k + 0.2) {
      d = 1e5;
      int i1 = int(gi.y + 0.5) - 1;
      for (int i = int(gi.x + 0.5); i < i1; i++) {
        vec4 a = uB[i];
        vec4 b = uB[i + 1];
        if (a.w <= 0.0 || b.w <= 0.0) continue;
        float s;
        if (bell) {
          vec3 ba = b.xyz - a.xyz;
          float L = length(ba);
          vec3 u = ba / L;
          vec3 pa = p - a.xyz;
          float x = dot(pa, u);
          float rho = length(pa - u * x);
          float h = clamp(x / L, 0.0, 1.0);
          float r = mix(a.w, b.w, h * h * h);
          s = length(vec2(x - h * L, abs(rho - r) * 0.7)) - 0.011;
        } else {
          s = sdRoundCone(p, a.xyz, b.xyz, a.w, b.w);
        }
        d = smin(d, s, k);
      }
    }
    res = usmin(res, vec2(d, bell ? gi.w - 50.0 : gi.w), max(k, 0.03));
  }
  return res;
}
`;

export default function yith({ seed = 1 } = {}) {
  const R = rng(seed * 977 + 13);
  const K = chainKit();

  const APEX = [0.12, 2.74, 0.0];
  // ── 네 팔 (재질 2): 코끼리 코처럼 굵고 주름진
  K.begin(2, 0.08);
  const headLimb = K.tube([[0.0, 2.78, -0.05], [-0.3, 3.45, -0.3], [-0.78, 3.92, 0.0], [-0.88, 3.72, 0.4]], 10, 0.18, 0.09, 0.8);
  const clawL = K.tube([[-0.1, 2.64, 0.05], [-1.0, 3.02, 0.1], [-1.62, 2.62, 0.35], [-1.78, 1.98, 0.55]], 10, 0.18, 0.13, 0.8);
  const clawR = K.tube([[0.3, 2.68, 0.0], [1.05, 3.02, -0.15], [1.48, 3.4, 0.0], [1.58, 3.95, 0.12]], 10, 0.18, 0.13, 0.8);
  const trump = K.tube([[0.22, 2.55, 0.18], [0.64, 2.3, 0.7], [0.86, 1.85, 0.85], [0.8, 1.5, 1.0]], 9, 0.15, 0.09, 0.8);
  K.end();
  const tip = (pts) => pts[pts.length - 1].slice(0, 3);
  const endDir = (pts) => nrm(sub(tip(pts), pts[pts.length - 3].slice(0, 3)));
  const HEAD = add(tip(headLimb), [-0.03, -0.03, 0.14]);
  const spreadOf = (d) => [d[1], -d[0], 0];

  // ── 집게 손가락 (재질 3): 국소 좌표 (x 앞, y 벌어짐) → 세계
  const dL = endDir(clawL);
  const dR = endDir(clawR);
  const claws = [
    { o: tip(clawL), F: frame(dL, spreadOf(dL)), s: 1.15, open: 0.14 },
    { o: tip(clawR), F: frame(dR, spreadOf(dR)), s: 1.3, open: 0.24 },
  ];
  const fing = (sg, op) => {
    const th = sg > 0 ? 1 : 0.85;
    return [
      [0.38, sg * 0.09, 0, 0.1 * th],
      [0.65, sg * (0.14 + op), 0, 0.085 * th],
      [0.9, sg * (0.11 + op * 0.85), 0, 0.055 * th],
      [1.08, sg * (-0.02 + op * 0.3), 0, 0.008],
    ];
  };
  K.begin(3, 0.035);
  for (const c of claws) {
    // 부푼 손바닥 (갑각 마디)
    K.line([[-0.3, 0, 0, 0.12], [0.06, 0, 0, 0.22], [0.36, 0, 0, 0.15]].map((q) => [...toWorld(c.F, c.o, mul(q.slice(0, 3), c.s)), q[3] * c.s]));
    for (const sg of [1, -1]) {
      K.line(fing(sg, c.open * (sg > 0 ? 1 : 0.6)).map((q) => [...toWorld(c.F, c.o, mul(q.slice(0, 3), c.s)), q[3] * c.s]));
    }
  }
  K.end();

  // ── 머리 아래 여덟 더듬이 (재질 6) + 머리 위 네 줄기 (재질 7) + 줄기 끝 작은 꽃
  K.begin(6, 0.025);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + R() * 0.3;
    const s = add(HEAD, [Math.cos(a) * 0.22, -0.24, Math.sin(a) * 0.22]);
    const len = 0.45 + R() * 0.35;
    const e = add(s, [Math.cos(a) * 0.1 + (R() - 0.5) * 0.16, -len, Math.sin(a) * 0.1 + 0.04]);
    K.tube([s, add(s, [Math.cos(a) * 0.1, -len * 0.3, Math.sin(a) * 0.1]), add(e, [Math.cos(a) * -0.08, len * 0.35, 0]), e], 3, 0.022, 0.004, 0.6);
  }
  K.end();
  const stalkTips = [];
  K.begin(7, 0.02);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    const s = add(HEAD, [Math.cos(a) * 0.11, 0.31, Math.sin(a) * 0.11]);
    const e = add(s, [Math.cos(a) * 0.12, 0.13 + R() * 0.06, Math.sin(a) * 0.12]);
    K.tube([s, add(s, [0, 0.12, 0]), add(e, [-Math.cos(a) * 0.05, -0.05, -Math.sin(a) * 0.05]), e], 3, 0.014, 0.009);
    stalkTips.push(e);
  }
  K.end();
    // ── 나팔 다발 (속 빈 나팔, 재질 4)
  const TR = tip(trump);
  const TF = frame(endDir(trump), [0, 0, 1]);
  K.begin(54, 0.03);
  for (let i = 0; i < 4; i++) {
    const a = i * 1.5708 + 0.4;
    const dir = nrm([1, 0.55 * Math.cos(a), 0.55 * Math.sin(a)]);
    const len = 0.62 + 0.14 * Math.sin(i * 2.3);
    K.line([[...toWorld(TF, TR, mul(dir, 0.02)), 0.024], [...toWorld(TF, TR, add(mul(dir, len), [0, -0.12, 0])), 0.095]]);
  }
  K.end();
  // ── 번개 (재질 8, 빛남): 쳐든 집게의 두 손가락 사이를 잇는 지그재그
  const CR = claws[1];
  const arcs = [];
  K.begin(8, 0.004);
  for (let a = 0; a < 2; a++) {
    const x0 = 0.62 + a * 0.2;
    const top = 0.14 + CR.open * 0.9 - 0.06;
    const bot = -(0.12 + CR.open * 0.5) + 0.06;
    const pts = [];
    const N = 7;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const l = [x0 + (R() - 0.5) * 0.12 * Math.sin(t * Math.PI), top + (bot - top) * t, (R() - 0.5) * 0.12 * Math.sin(t * Math.PI)];
      pts.push([...toWorld(CR.F, CR.o, mul(l, CR.s)), 0.008 - a * 0.002]);
    }
    arcs.push(...pts);
    K.line(pts);
  }
  K.end();

  // ── 세 눈: 머리 구체의 적도에 120°씩 — 작고 어둡게
  const uE = [];
  const uG = [];
  for (let i = 0; i < 3; i++) {
    const a = -0.75 + (i * Math.PI * 2) / 3;
    const d = nrm([Math.sin(a), -0.12, Math.cos(a)]);
    uE.push([...add(HEAD, mul(d, 0.31)), 0.045]);
    uG.push([...d, 2]);
  }
  // 번개의 빛
  const spark = toWorld(CR.F, CR.o, mul([0.72, 0.03, 0], CR.s));
  const uL = [[...spark, 0.06]];
  const uLC = [[0.45, 0.75, 1.0, 0.7]];
  for (let i = 1; i < arcs.length; i += 3) {
    uL.push([...arcs[i].slice(0, 3), 0.02]);
    uLC.push([0.6, 0.88, 1.0, 0.9]);
  }

  return {
    preset: 'act4',
    cam: { pos: [1.3, 0.45, 11.2], target: [0.0, 2.25, 0], fov: 1.75 },
    light: {
      key: [-0.45, 0.65, -0.7],
      fillCol: [0.1, 0.065, 0.15],
      amb: [0.025, 0.02, 0.035],
      rim: 2.1,
      eyeEmit: 0.8,
      pt: add(spark, [0.0, -0.15, 0.25]),
      ptCol: [0.5, 0.85, 1.2],
      exposure: 1.3,
    },
    frame: { fill: 0.92, bottom: 0.025 },
    arrays: { uB: K.uB, uP: K.uP(), uE, uG, uL, uLC },
    glsl: /* glsl */ `
${CHAIN_GLSL}
const vec3 APEX = ${v3(APEX)};
const vec3 HEAD = ${v3(HEAD)};

/** 뿔산호 같은 껍데기 결: 세로 격벽 골 + 가는 성장 주름 + 이따금 깊게 조인 마디 */
float horn(vec3 q, float lumps) {
  float ang = atan(q.z, q.x);
  float septa = pow(abs(sin(ang * 12.0 + lumps * 5.0 + q.y * 0.7)), 0.45);
  float growth = 0.5 + 0.5 * sin(q.y * 41.0 + lumps * 14.0);
  float stage = pow(0.5 + 0.5 * sin(q.y * 5.1 + lumps * 4.0), 10.0);
  return 0.022 * septa + 0.011 * growth - 0.05 * stage;
}

vec2 sdf(vec3 p) {
  // ── 원뿔 껍데기: 감아 오르는 마디, 혹, 기운 꼭대기, 주름
  vec3 q = p;
  q.x -= 0.04 * q.y * q.y;
  float lumps = fbm3(p * 1.5 + 4.0);
  float y01 = clamp(q.y / 2.7, 0.0, 1.0);
  float cone = sdCappedCone(q - vec3(0.0, 1.36, 0.0), 1.36, 1.06, 0.32);
  cone -= horn(q, lumps) * (1.0 - 0.4 * y01) + 0.13 * (lumps - 0.5);
  cone *= 0.72;
  // 끈적한 밑동
  float fa = atan(p.z, p.x);
  float lobe = 1.0 + 0.12 * sin(fa * 5.0 + 1.3) + 0.08 * sin(fa * 9.0) + 0.12 * (lumps - 0.5);
  float foot = sdEllipsoid(p - vec3(0.0, 0.03, 0.0), vec3(1.32 * lobe, 0.2, 1.24 * lobe));
  float body = smin(cone, foot, 0.32);
  body = smin(body, sdEllipsoid(p - APEX, vec3(0.42, 0.25, 0.4)), 0.22);
  vec2 r = vec2(body, 1.0);

  // ── 팔·손가락·더듬이·줄기·나팔·번개
  vec2 ch = chainSet(p);
  r = usmin(r, ch, 0.15);

  // ── 머리 구체 (위아래로 조금 길쭉)
  vec3 hq = p - HEAD;
  float head = sdEllipsoid(hq, vec3(0.34, 0.33, 0.34));
  head += 0.03 * pow(1.0 - ridge(hq * 5.5 + 2.0), 3.0) - 0.008;
  r = usmin(r, vec2(head, 5.0), 0.08);
  // 잔주름 (한 번만)
  r.x += 0.012 * (0.5 - ridge(p * 7.0));
  return r;
}

// 재질은 반환을 하나로 (분기마다 return하면 D3D 컴파일러가 음영 코드를 분기 수만큼 복제해 몹시 느려진다)
Mat material(float id, vec3 p, vec3 n) {
  float grime = 0.55 + 0.8 * fbm3(p * 4.0);
  // 기본: 팔 — 젖은 회갈색 살
  vec3 alb = vec3(0.06, 0.05, 0.042);
  float rough = 0.4, spec = 0.6, irid = 0.25, sss = 0.15, wet = 0.4;
  vec3 emi = vec3(0.0);
  if (id < 1.5) {
    // 껍데기: 마루는 바랜 청동빛 갈색, 골은 검고 기름져 무지갯빛
    vec3 q = p;
    q.x -= 0.04 * q.y * q.y;
    float wh = smoothstep(-0.01, 0.03, horn(q, fbm3(p * 1.5 + 4.0)));
    float wetFoot = smoothstep(0.45, 0.05, p.y);
    alb = mix(vec3(0.016, 0.013, 0.012), vec3(0.1, 0.085, 0.065), wh) * (1.0 - wetFoot * 0.5);
    rough = 0.55 - wetFoot * 0.35;
    spec = 0.55 + wetFoot * 0.6;
    irid = 0.45 * (1.0 - wh);
    sss = 0.05;
    wet = 0.3 + wetFoot * 0.6;
  } else if (id < 2.5) {
  } else if (id < 3.5) {
    // 집게: 검은 갑각, 반들반들
    alb = vec3(0.035, 0.032, 0.03); rough = 0.2; spec = 1.3; irid = 0.2; sss = 0.0; wet = 0.6;
  } else if (id < 4.5) {
    // 나팔: 검붉은 살
    alb = vec3(0.045, 0.012, 0.01); rough = 0.4; spec = 0.5; irid = 0.0; sss = 0.7; wet = 0.5;
  } else if (id < 5.5) {
    // 누런 머리 구체
    alb = vec3(0.045, 0.04, 0.026); rough = 0.65; spec = 0.35; irid = 0.1; sss = 0.3; wet = 0.25;
  } else if (id < 6.5) {
    alb = vec3(0.035, 0.05, 0.025); rough = 0.5; spec = 0.4; irid = 0.0; sss = 0.5; wet = 0.4;
  } else if (id < 7.5) {
    alb = vec3(0.07, 0.07, 0.065); rough = 0.6; spec = 0.3; irid = 0.0; sss = 0.3; wet = 0.1;
  } else {
    // 번개
    alb = vec3(0.0); rough = 1.0; spec = 0.0; irid = 0.0; sss = 0.0; wet = 0.0; emi = vec3(1.6, 2.4, 3.2);
  }
  return Mat(alb * grime, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
