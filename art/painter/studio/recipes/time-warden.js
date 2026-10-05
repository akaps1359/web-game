// 시간의 파수꾼 (4층 일반) — 별들의 궁정에서 시간을 지키는 자. 땅에 닿지 않고 떠 있는 키 큰 형체,
// 해진 청동빛 로브와 두건, 두건 속엔 얼굴 대신 금이 간 매끈한 청동 가면. 두 손으로 가슴 앞의 모래시계를 받쳐 들고
// (모래가 금빛으로 빛난다), 등 뒤로 기울어진 혼천의 고리들이 돈다. 주위에 멈춘 시간의 조각들이 떠 있다.
import { rng } from '../../lib.js';

const bez = (P, t) => {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
};
const sub = (a, b) => a.map((x, i) => x - b[i]);
const add = (a, b) => a.map((x, i) => x + b[i]);
const mul = (a, s) => a.map((x) => x * s);
const nrm = (a) => mul(a, 1 / Math.hypot(...a));

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

const CHAIN_GLSL = /* glsl */ `
vec2 chainSet(vec3 p) {
  vec2 res = vec2(1e5, 1.0);
  int ng = int(uP[0].x + 0.5);
  for (int g = 0; g < ng; g++) {
    vec4 bs = uP[1 + g];
    vec4 gi = uP[1 + ng + g];
    float k = gi.z;
    float d = length(p - bs.xyz) - bs.w;
    if (d < k + 0.25) {
      d = 1e5;
      int i1 = int(gi.y + 0.5) - 1;
      for (int i = int(gi.x + 0.5); i < i1; i++) {
        vec4 a = uB[i];
        vec4 b = uB[i + 1];
        if (a.w <= 0.0 || b.w <= 0.0) continue;
        d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
      }
    }
    res = usmin(res, vec2(d, gi.w), max(k, 0.03));
  }
  return res;
}
vec3 rimOf(vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  return pow(fres, 1.6) * max(dot(n, normalize(uKeyDir)) + 0.4, 0.0) * uRimCol * uRim;
}
`;

export default function timeWarden({ seed = 1 } = {}) {
  const R = rng(seed * 3301 + 17);
  const K = chainKit();
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };

  const GLASS = [0.0, 2.02, 0.42]; // 모래시계 중심
  // ── 소매 (재질 1, 로브 천): 어깨 → 팔꿈치 → 손목 (모래시계 양옆)
  K.begin(1, 0.06);
  for (const s of [-1, 1]) {
    K.line([
      [s * 0.36, 2.62, 0.0, 0.13],
      [s * 0.5, 2.2, 0.22, 0.12],
      [s * 0.26, 1.98, 0.42, 0.13],
    ]);
  }
  K.end();
  // ── 손 (재질 2, 마른 잿빛 살): 모래시계를 감싼 긴 손가락
  K.begin(2, 0.012);
  for (const s of [-1, 1]) {
    const w = [s * 0.2, 1.98, 0.44];
    for (let i = 0; i < 3; i++) {
      const z = (i - 1) * 0.04;
      K.line([
        [...add(w, [0, -0.02, z]), 0.02],
        [...add(w, [-s * 0.035, 0.09, z + 0.03]), 0.014],
        [...add(w, [-s * 0.07, 0.17, z + 0.04]), 0.008],
      ]);
    }
  }
  K.end();

  // ── 혼천의 고리 셋: [중심, 반지름], [축, 두께]
  const RINGS = [
    [[0.0, 2.5, -0.4], 0.92, nrm([0.25, 0.15, 1.0]), 0.03],
    [[0.0, 2.5, -0.4], 0.76, nrm([1.0, 0.35, 0.25]), 0.025],
    [[0.0, 2.5, -0.4], 1.08, nrm([-0.3, 1.0, 0.45]), 0.022],
  ];
  // ── 멈춘 시간의 조각들: [중심, 크기], [회전각 둘, 길쭉함]
  const SHARDS = [];
  for (let i = 0; i < 7; i++) {
    const a = -0.4 + (i / 6) * (Math.PI + 0.8) + (R() - 0.5) * 0.3;
    const rr = 0.85 + R() * 0.35;
    SHARDS.push([[Math.cos(a) * rr, 1.8 + Math.sin(a) * 0.85 + (R() - 0.5) * 0.4, 0.25 + R() * 0.4], 0.035 + R() * 0.035, [R() * 6, R() * 6, 2.0 + R() * 1.5]]);
  }

  const P = {
    robe: prm([0.045, 0.034, 0.024, 0.85]), // 로브 색, 거칠기
    gold: prm([0.36, 0.25, 0.08, 0.3]), // 금실 테두리
    bronze: prm([0.2, 0.13, 0.06, 0.28]), // 청동 (고리·가면)
    flesh: prm([0.11, 0.1, 0.09, 0.6]), // 손
    sand: prm([1.0, 0.72, 0.3, 2.2]), // 모래 빛
    hood: prm([0.0, 2.88, 0.02, 0.2]), // 두건 중심, 크기
    glass: prm([...GLASS, 0.17]), // 모래시계 중심, 반높이
    counts: prm([RINGS.length, SHARDS.length, 0, 0]),
    rimk: prm([0.0, 0, 0, 0]),
  };
  const RB = PB.length;
  for (const [c, r, ax, t] of RINGS) {
    PB.push([...c, r]);
    PB.push([...ax, t]);
  }
  const SB = PB.length;
  for (const [c, s, rr] of SHARDS) {
    PB.push([...c, s]);
    PB.push([...rr, 0]);
  }

  // 빛: 모래시계, 가면의 금, 조각들
  const uL = [[...add(GLASS, [0, -0.08, 0.02]), 0.1]];
  const uLC = [[1.0, 0.72, 0.3, 0.45]];
  for (const [c, s] of SHARDS) {
    uL.push([...c, s * 0.6]);
    uLC.push([1.0, 0.85, 0.55, 0.3]);
  }

  return {
    preset: 'act4',
    cam: { pos: [0.5, 1.1, 9.6], target: [0.0, 1.95, 0], fov: 1.8 },
    light: { key: [-0.4, 0.7, -0.6], fillCol: [0.12, 0.08, 0.17], amb: [0.025, 0.02, 0.03], rim: 2.1, exposure: 1.3, pt: add(GLASS, [0, 0.0, 0.12]), ptCol: [1.4, 0.95, 0.4] },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: K.uB, uP: K.uP(), uA: PB, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
${CHAIN_GLSL}

vec2 sdf(vec3 p) {
  // ── 로브: 떠 있는 긴 원뿔, 아랫단은 찢겨 들쭉날쭉 (바닥에 닿지 않는다)
  vec3 rp = p - vec3(0.0, 0.3, 0.0);
  float robe = sdRobe(rp, 2.4, 0.26, 0.58, 9.0, 0.06);
  robe = max(robe, -(rp.y - 0.05 - 0.75 * pow(fbm3(vec3(rp.x * 5.0, 0.0, rp.z * 5.0)), 1.5)));
  // 어깨
  robe = smin(robe, sdEllipsoid(p - vec3(0.0, 2.55, -0.02), vec3(0.42, 0.2, 0.26)), 0.12);
  vec4 Hd = ${P.hood};
  robe = smin(robe, sdHood(p, Hd.xyz, Hd.w), 0.06);
  vec2 r = vec2(robe, 1.0);
  r = usmin(r, chainSet(p), 0.06);
  // 두건 속: 어둠 + 금 간 청동 가면
  r = umin(r, vec2(sdSphere(p - Hd.xyz - vec3(0.0, -0.03, -0.02), Hd.w * 0.7), 99.0));
  float mask = sdEllipsoid(p - Hd.xyz - vec3(0.0, -0.03, 0.09), vec3(Hd.w * 0.5, Hd.w * 0.64, Hd.w * 0.4));
  r = umin(r, vec2(mask, 4.0));

  // ── 모래시계: 위아래 두 유리 구 + 청동 받침
  vec4 G = ${P.glass};
  vec3 gq = p - G.xyz;
  float bulb = min(sdEllipsoid(gq - vec3(0.0, G.w * 0.5, 0.0), vec3(G.w * 0.48, G.w * 0.62, G.w * 0.48)), sdEllipsoid(gq + vec3(0.0, G.w * 0.5, 0.0), vec3(G.w * 0.48, G.w * 0.62, G.w * 0.48)));
  bulb = smin(bulb, sdCylinder(gq, G.w * 0.4, G.w * 0.06), 0.03);
  r = umin(r, vec2(bulb, 5.0));
  float frame = min(sdCylinder(gq - vec3(0.0, G.w * 1.08, 0.0), 0.016, G.w * 0.62), sdCylinder(gq + vec3(0.0, G.w * 1.08, 0.0), 0.016, G.w * 0.62));
  vec3 pq = vec3(abs(gq.x), gq.y, abs(gq.z)) - vec3(G.w * 0.52, 0.0, G.w * 0.52);
  frame = min(frame, sdCapsule(pq, vec3(0.0, -G.w * 1.08, 0.0), vec3(0.0, G.w * 1.08, 0.0), 0.011));
  r = umin(r, vec2(frame, 3.0));

  // ── 혼천의 고리 (반복 횟수는 uniform)
  vec4 C = ${P.counts};
  int nr = int(C.x + 0.5);
  for (int i = 0; i < nr; i++) {
    vec4 c = uA[${RB} + 2 * i];
    vec4 ax = uA[${RB} + 2 * i + 1];
    vec3 q = p - c.xyz;
    float h = dot(q, ax.xyz);
    float rr = length(q - ax.xyz * h);
    vec2 tq = vec2(rr - c.w, h);
    // 납작한 띠 고리
    float ring = length(max(abs(tq) - vec2(ax.w * 0.35, ax.w), 0.0)) - 0.006;
    r = umin(r, vec2(ring, 3.0));
  }
  // ── 떠 있는 시간의 조각 (길쭉한 팔면체)
  int ns = int(C.y + 0.5);
  for (int i = 0; i < ns; i++) {
    vec4 c = uA[${SB} + 2 * i];
    vec4 rr = uA[${SB} + 2 * i + 1];
    vec3 q = p - c.xyz;
    q.xy = rot(rr.x) * q.xy;
    q.yz = rot(rr.y) * q.yz;
    q.y /= rr.z;
    float sh = (abs(q.x) + abs(q.y) + abs(q.z) - c.w) * 0.4;
    r = umin(r, vec2(sh, 6.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float g = fbm3(p * 5.0);
  vec4 Rb = ${P.robe};
  vec3 alb = Rb.rgb * (0.6 + 0.7 * g);
  float rough = Rb.a, spec = 0.15, irid = 0.0, sss = 0.0, wet = 0.0;
  vec3 emi = vec3(0.0);
  if (id < 1.5) {
    // 금실 테두리: 아랫단 위와 소맷부리
    float band = smoothstep(0.03, 0.0, abs(p.y - 1.25 - 0.04 * sin(atan(p.z, p.x) * 3.0)));
    vec4 Gd = ${P.gold};
    alb = mix(alb, Gd.rgb, band);
    rough = mix(rough, Gd.a, band);
    spec = mix(spec, 1.3, band);
    wet = band * 0.4;
  } else if (id < 2.5) {
    alb = ${P.flesh}.rgb * (0.7 + 0.5 * g); rough = ${P.flesh}.a; spec = 0.3; sss = 0.4;
  } else if (id < 3.5) {
    // 청동 고리·받침: 새겨진 눈금이 금빛으로 빛난다
    vec4 Bz = ${P.bronze};
    alb = Bz.rgb * (0.7 + 0.5 * g); rough = Bz.a; spec = 1.4; wet = 0.5; irid = 0.05;
    float tick = smoothstep(0.92, 0.99, sin(atan(p.y - 2.25, p.x) * 60.0)) * smoothstep(0.75, 0.9, noise(p * 3.0));
    emi = ${P.sand}.rgb * tick * 0.8;
  } else if (id < 4.5) {
    // 가면: 매끈한 청동, 가운데로 내려간 금이 빛난다
    vec4 Bz = ${P.bronze};
    alb = Bz.rgb * 0.9; rough = 0.2; spec = 1.6; wet = 0.7;
    vec3 hq = p - ${P.hood}.xyz;
    float crack = smoothstep(0.012, 0.0, abs(hq.x - 0.02 * sin(hq.y * 40.0) - 0.01 * sin(hq.y * 97.0)));
    emi = ${P.sand}.rgb * crack * 1.5;
  } else if (id < 5.5) {
    // 유리: 거의 검고 반사만, 아래 구엔 빛나는 모래
    vec3 gq = p - ${P.glass}.xyz;
    float sandLv = step(gq.y, -${P.glass}.w * 0.55) + smoothstep(0.03, 0.0, length(gq.xz)) * step(gq.y, 0.0);
    alb = vec3(0.01); rough = 0.05; spec = 1.6; wet = 1.0; irid = 0.1;
    emi = ${P.sand}.rgb * ${P.sand}.a * (0.15 + sandLv * 0.85) * (0.7 + 0.3 * noise(p * 40.0));
  } else {
    // 시간의 조각: 빛나는 수정
    alb = vec3(0.05, 0.045, 0.04); rough = 0.05; spec = 2.0; wet = 1.0; irid = 0.4;
    emi = ${P.sand}.rgb * 0.12;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}
