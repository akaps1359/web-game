// 각도의 사냥개 (3층 일반) — 굽은 시간 속에 사는 굶주린 것. 모서리에서 기어 나와 몸을 낮춘 채 덮칠 자세.
// 몸은 둥근 데가 하나도 없다: 날 선 다각 기둥(결정)으로 이은 앙상한 개의 뼈대 — 깊고 좁은 가슴, 드러난 칼날 갈비,
// 등뼈를 따라 솟은 파편 가시, 접칼처럼 꺾인 긴 다리 끝의 칼날 발톱. 머리는 눈 없는 쐐기, 벌린 턱에 바늘 이빨 줄,
// 길고 속이 빈 혀가 늘어지고, 갈라진 틈마다 푸른 고름빛이 새어 떨어진다. 둘레엔 공간이 깨진 파편들이 떠 있다.
// angleHound()는 모서리의 새끼·각도의 왕 레시피도 같이 쓴다.
// 형식: uB/uA 에 꺾인 사슬 — [위 방향 xyz, -(면 수 + 10×재질 + 1000×납작함%)] 다음에 마디 [x,y,z,굵기]...
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const mul = (a, k) => a.map((x) => x * k);
const len = (a) => Math.hypot(...a);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

/** 사냥개 뼈대를 만든다. o: 크기·자세 매개변수 */
export function angleHound(o) {
  const R = rng(o.seed * 6007 + (o.salt ?? 0));
  const S = o.size ?? 1;
  const yaw = o.yaw ?? -0.55;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const base = o.pos ?? [0, 0, 0];
  // 지역 좌표 (x 앞, y 위, z 오른쪽→왼쪽) → 월드
  const W = (p) => {
    const q = mul(p, S);
    return [base[0] + cy * q[0] - sy * q[2], base[1] + q[1], base[2] + sy * q[0] + cy * q[2]];
  };
  const WD = (d) => [cy * d[0] - sy * d[2], d[1], sy * d[0] + cy * d[2]];
  const lists = [[], [], []];
  let cur = 0;
  const chain = (pts, { sides = 4, mat = 1, up = [0, 1, 0], flat = 1, list = 0 } = {}) => {
    const L = lists[list];
    L.push([...nrm(WD(up)), -(sides + 10 * mat + 1000 * Math.round(flat * 100))]);
    for (const [x, y, z, w] of pts) L.push([...W([x, y, z]), w * S]);
    cur = list;
  };
  const jit = (a) => (R() - 0.5) * a;

  const P = o.pose; // 자세 (지역 좌표)
  // ── 몸통: 골반 → 허리(잘록) → 가슴(깊고 좁다) → 목
  chain([[...P.pelvis, 0.17 * (o.bulk ?? 1)], [...P.waist, 0.11 * (o.bulk ?? 1)], [...P.chest, 0.33 * (o.bulk ?? 1)], [...P.neck, 0.15 * (o.bulk ?? 1)]], { sides: 5, flat: 0.55, up: o.torsoUp ?? [0, 1, 0] });
  // 어깨뼈·골반뼈의 모난 판
  for (const s of [-1, 1]) {
    chain([[P.chest[0] - 0.05, P.chest[1] + 0.12, s * 0.1, 0.1], [P.chest[0] - 0.3, P.chest[1] + 0.2, s * 0.13, 0.02]], { sides: 3, up: [0, 0, s] });
    chain([[P.pelvis[0] + 0.05, P.pelvis[1] + 0.05, s * 0.09, 0.09], [P.pelvis[0] - 0.22, P.pelvis[1] + 0.12, s * 0.12, 0.015]], { sides: 3, up: [0, 0, s] });
  }
  // 어깨·엉덩이에서 뒤로 곤두선 칼날 털
  for (const s2 of [-1, 1]) {
    for (let k = 0; k < (o.hackles ?? 3); k++) {
      const b0 = [P.chest[0] - 0.05 - k * 0.12, P.chest[1] + 0.18 - k * 0.04, s2 * (0.13 + k * 0.02)];
      const l = 0.32 - k * 0.06 + jit(0.08);
      chain([[...b0, 0.04], [b0[0] - l * 0.8, b0[1] + l * 0.55, b0[2] + s2 * l * 0.35, 0.0]], { sides: 3, up: [0, 0, s2], list: 2 });
    }
  }
  // ── 칼날 갈비: 등뼈에서 배 아래로 휘어 내려오는 얇은 날
  const ribN = o.ribs ?? 4;
  for (let i = 0; i < ribN; i++) {
    const t = (i + 0.5) / ribN;
    const top = lerp(P.waist, P.chest, 0.25 + t * 0.7);
    // 배 쪽(rd)과 머리 쪽(fw) 방향: 엎드린 몸은 아래·앞, 앉은 몸은 앞·위
    const rd = o.ribDown ?? [0, -1, 0];
    const fw = o.ribFwd ?? [1, 0, 0];
    const bk = mul(rd, -1);
    const rp = [-1, 1].map((s) => [
      add(add(add(top, fw, 0.1 + t * 0.05), rd, 0.3 + t * 0.12), [0, 0, s * 0.07]),
      add(add(add(top, fw, 0.04), rd, 0.12), [0, 0, s * 0.16 * (0.7 + t * 0.5)]),
    ]);
    chain([[...rp[0][0], 0.008], [...rp[0][1], 0.03], [...add(top, bk, 0.03), 0.04], [...rp[1][1], 0.03], [...rp[1][0], 0.008]], { sides: 3, up: fw, flat: 0.35 });
  }
  // ── 등뼈 가시: 등을 따라 뒤로 젖혀 솟은 파편
  const spN = o.spines ?? 7;
  for (let i = 0; i < spN; i++) {
    const t = i / (spN - 1);
    const at = t < 0.5 ? lerp(P.pelvis, P.waist, t * 2) : lerp(P.waist, P.chest, (t - 0.5) * 2);
    const hgt = (0.16 + 0.3 * Math.sin(t * Math.PI) + jit(0.12)) * (o.spineLen ?? 1);
    const so = o.spineOff ?? [0, 0.1];
    const sv = o.spineVec ?? [-0.55, 1];
    const b = [at[0] + so[0], at[1] + so[1], jit(0.04)];
    chain([[...b, (0.045 + 0.02 * Math.sin(t * Math.PI)) * (o.bulk ?? 1)], [b[0] + hgt * sv[0] + jit(0.06), b[1] + hgt * sv[1], b[2] + jit(0.08), 0.0]], { sides: 3, up: [0, 0, 1] });
  }
  // ── 다리: 접칼처럼 꺾인 마디, 끝은 칼날 발톱
  for (const L of P.legs) {
    const [a, b, c, d] = L.j;
    chain([[...a, L.w * 1.5], [...lerp(a, b, 0.4), L.w * 1.25], [...b, L.w * 0.6], [...c, L.w * 0.42], [...d, L.w * 0.3]], { sides: 4, up: L.up ?? [0, 0, 1], flat: 0.62 });
    // 마디마다 뒤로 솟은 가시
    chain([[...b, L.w * 0.4], [b[0] - 0.08 * Math.sign(L.kneeOut ?? 1), b[1] + 0.12, b[2], 0.0]], { sides: 3 });
    // 칼날 발톱 둘
    for (const k of [-1, 1]) {
      const f = [d[0] + 0.17, Math.max(0.0, d[1] - 0.05), d[2] + k * 0.045];
      chain([[...d, L.w * 0.24], [...f, 0.0]], { sides: 3, mat: 2, up: [0, 1, 0], flat: 0.5, list: 2 });
    }
  }
  // ── 꼬리: 마디진 칼날 사슬
  if (P.tail) chain(P.tail.map((q, i, A) => [...q, 0.08 * (1 - i / (A.length - 1)) + 0.0]), { sides: 4, flat: 0.6 });
  // ── 목과 머리: 눈 없는 쐐기, 벌린 턱
  const H = P.head; // 머리 뒤통수
  const hd = nrm(P.headDir); // 주둥이 방향
  const hu = nrm(sub([0, 1, 0], mul(hd, hd[1]))); // 머리 위
  const at = (f, u, s = 0) => add(add(add(H, hd, f), hu, u), [0, 0, 1], s);
  const gape = P.gape ?? 0.5;
  const jawDir = nrm(add(mul(hd, Math.cos(gape)), mul(hu, -Math.sin(gape))));
  const jat = (f, u) => add(add(at(0.08, -0.06), jawDir, f), hu, u);
  chain([[...P.neck, 0.14], [...lerp(P.neck, H, 0.5), 0.11], [...at(0.02, 0.0), 0.1]], { sides: 5, flat: 0.65 });
  // 두개골: 뒤통수 → 이마 → 주둥이 → 코끝 (위아래로 납작한 쐐기)
  const HL = o.headLen ?? 0.82;
  const hb = o.headBulk ?? 1;
  chain([[...at(-0.08, 0.03), 0.11 * hb], [...at(0.14, 0.06), 0.15 * hb], [...at(HL * 0.6, 0.02), 0.09 * hb], [...at(HL, -0.04), 0.03 * hb]], { sides: 4, flat: 0.68, up: hu });
  // 이마 위로 뒤로 젖혀진 각진 볏
  for (const s of [-1, 1]) chain([[...at(0.1, 0.1, s * 0.05), 0.05], [...at(-0.22, 0.3, s * 0.13), 0.0]], { sides: 3, up: [0, 0, s] });
  // 아래턱
  chain([[...jat(0.0, 0.0), 0.09 * hb], [...jat(HL * 0.55, -0.01), 0.065 * hb], [...jat(HL * 0.92, 0.0), 0.022 * hb]], { sides: 4, flat: 0.6, up: hu });
  // 이빨: 위턱은 아래로, 아래턱은 위로 (바늘)
  const teeth = o.teeth ?? 4;
  for (let i = 0; i < teeth; i++) {
    const f = 0.18 + (i / (teeth - 1)) * (HL * 0.75);
    for (const s of [-1, 1]) {
      const up0 = at(f, -0.035 - 0.03 * (1 - f / HL), s * 0.035 * (1 - f / HL * 0.6));
      chain([[...up0, 0.014], [...add(up0, hu, -0.07 - 0.04 * R()), 0.0]], { sides: 3, mat: 2, list: 1 });
      const lo0 = add(jat(f * 0.92, 0.03), [0, 0, s * 0.03 * (1 - f / HL * 0.6)]);
      chain([[...lo0, 0.012], [...add(lo0, hu, 0.06 + 0.03 * R()), 0.0]], { sides: 3, mat: 2, list: 1 });
    }
  }
  // 길고 속이 빈 혀: 턱 사이로 늘어져 아래로 휜다
  const tg0 = at(0.15, -0.07);
  const tg = [tg0];
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const q = add(add(tg0, jawDir, HL * 1.1 * t), [0.05 * Math.sin(t * 5), -0.35 * t * t * (o.tongueDrop ?? 1), 0.06 * Math.sin(t * 3)]);
    q[1] = Math.max(q[1], 0.05 + 0.04 * t);
    tg.push(q);
  }
  chain(tg.map((q, i) => [...q, 0.03 * (1 - i / 7) + 0.008]), { sides: 6, mat: 3, list: 0 });

  // 고름빛 방울 (턱과 혀끝에서 떨어진다) + 눈 대신 깊은 홈 속 푸른 점
  const lights = [];
  const lcol = [];
  const tip = tg[tg.length - 1];
  for (const q of [tip, add(tip, [0.03, -0.04, 0]), jat(HL * 0.85, -0.04), at(HL * 0.8, -0.08)]) {
    lights.push([...W(q), 0.012 * S]);
    lcol.push([0.35, 0.7, 1.0, 1.1]);
  }
  for (let e = 0; e < (o.eyePairs ?? 1); e++) {
    for (const s of [-1, 1]) {
      lights.push([...W(at(0.24 + e * 0.13, 0.06 - e * 0.012, s * (0.08 - e * 0.012))), (0.011 - e * 0.002) * S]);
      lcol.push([0.45, 0.8, 1.0, 2.0]);
    }
  }
  // 목구멍 깊은 곳의 푸른 빛
  const throat = W(at(0.2, -0.06));
  lights.push([...throat, 0.07 * S]);
  lcol.push([0.3, 0.6, 1.0, 0.7]);
  return { lists, lights, lcol, W, at, H, throat };
}

export const ANGLE_GLSL = /* glsl */ `
// 날 선 다각 기둥: a→b, 굵기(내접 반지름) wa→wb, 면 수 n, 단면 납작함 fl (옆 방향을 줄인다). 모서리 하나가 위를 향한다.
// 반환: (거리, 가장 가까운 모서리까지의 거리)
vec2 prism(vec3 p, vec4 A, vec4 B, vec3 upv, float n, float fl) {
  vec3 ba = B.xyz - A.xyz;
  float L = length(ba);
  vec3 ax = ba / L;
  vec3 up = normalize(upv - ax * dot(upv, ax) + vec3(1e-4, 0.0, 0.0));
  vec3 sd = cross(ax, up);
  vec3 q = p - A.xyz;
  float u = dot(q, ax);
  vec2 xy = vec2(dot(q, sd) / fl, dot(q, up));
  float an = 6.2831853 / n;
  float ang = atan(xy.y, xy.x) - 1.5707963 + an * 0.5;
  float off = ang - floor(ang / an + 0.5) * an;
  float rl = length(xy);
  float rp = rl * cos(off);
  float t = clamp(u / L, 0.0, 1.0);
  float w = mix(A.w, B.w, t);
  float slope = (A.w - B.w) / L;
  float ds = (rp - w) * fl / sqrt(1.0 + slope * slope);
  float edge = (w * tan(an * 0.5) - abs(rl * sin(off))) * fl;

  return vec2(max(ds, max(-u, u - L)), edge);
}

// 꺾인 사슬 목록을 돈다 (머리 표시 = w < 0 → 위 방향·면 수·재질·납작함). res = (거리, 재질, 모서리)
void prismHead(vec4 a, inout vec3 upv, inout float n, inout float mt, inout float fl) {
  float code = -a.w;
  fl = floor(code / 1000.0);
  code -= fl * 1000.0;
  fl /= 100.0;
  mt = floor(code / 10.0);
  n = code - mt * 10.0;
  upv = a.xyz;
}
vec3 prismSeg(vec3 p, vec3 res, vec4 a, vec4 b, vec3 upv, float n, float mt, float fl) {
  vec3 m = (a.xyz + b.xyz) * 0.5;
  float bound = length(p - m) - (length(a.xyz - b.xyz) * 0.5 + max(a.w, b.w) * 1.6 / max(fl, 0.3));
  if (bound > res.x) return res;
  vec2 d = prism(p, a, b, upv, n, fl);
  return d.x < res.x ? vec3(d.x, mt, d.y) : res;
}
vec3 prismsB(vec3 p, vec3 res) {
  vec3 upv = vec3(0.0, 1.0, 0.0);
  float n = 4.0, mt = 1.0, fl = 1.0;
  for (int i = 0; i < 159; i++) {
    if (i + 1 >= uBN) break;
    vec4 a = uB[i];
    if (a.w < 0.0) { prismHead(a, upv, n, mt, fl); continue; }
    vec4 b = uB[i + 1];
    if (b.w < 0.0) continue;
    res = prismSeg(p, res, a, b, upv, n, mt, fl);
  }
  return res;
}
vec3 prismsG(vec3 p, vec3 res) {
  vec3 upv = vec3(0.0, 1.0, 0.0);
  float n = 4.0, mt = 1.0, fl = 1.0;
  for (int i = 0; i < 47; i++) {
    if (i + 1 >= uGN) break;
    vec4 a = uG[i];
    if (a.w < 0.0) { prismHead(a, upv, n, mt, fl); continue; }
    vec4 b = uG[i + 1];
    if (b.w < 0.0) continue;
    res = prismSeg(p, res, a, b, upv, n, mt, fl);
  }
  return res;
}
vec3 prismsA(vec3 p, vec3 res) {
  vec3 upv = vec3(0.0, 1.0, 0.0);
  float n = 4.0, mt = 1.0, fl = 1.0;
  for (int i = 0; i < 63; i++) {
    if (i + 1 >= uAN) break;
    vec4 a = uA[i];
    if (a.w < 0.0) { prismHead(a, upv, n, mt, fl); continue; }
    vec4 b = uA[i + 1];
    if (b.w < 0.0) continue;
    res = prismSeg(p, res, a, b, upv, n, mt, fl);
  }
  return res;
}
vec3 prismAll(vec3 p) {
  vec3 r = vec3(1e5, 1.0, 1.0);
  r = prismsB(p, r);
  r = prismsA(p, r);
  r = prismsG(p, r);
  return r;
}

// 날 선 몸의 재질: 흑요석 같은 검은 유리, 모서리마다 가는 푸른 빛줄, 금 간 틈에서 새는 고름빛
Mat angleMat(float id, vec3 p, vec3 n) {
  float edge = prismAll(p).z;
  float eline = smoothstep(0.005, 0.0, edge) * smoothstep(0.5, 0.8, noise(p * 2.5 + 4.0));
  float crack = smoothstep(0.016, 0.0, ridge(p * 4.1 + 2.0)) * smoothstep(0.55, 0.7, noise(p * 1.6 + 9.0));
  vec3 blue = vec3(0.3, 0.62, 1.0);
  float g = uP[0].x;
  // 면마다 조금씩 다른 광택 (평평한 면은 법선이 같으니 법선으로 면을 가른다)
  float face = hash31(floor(n * 3.0 + 0.5) + 7.0);
  if (id < 1.5) {
    float v = fbm3(p * 4.0);
    vec3 alb = vec3(0.01, 0.012, 0.018) * (0.5 + 0.7 * v) * (0.5 + face);
    vec3 emi = blue * (eline * 0.35 + crack * 0.8) * g;
    return Mat(alb, 0.04 + 0.3 * v * face, 1.2 + 1.0 * face, emi, 0.12, 0.0, 0.5 + 0.5 * face);
  }
  if (id < 2.5) return Mat(vec3(0.06, 0.065, 0.08), 0.15, 1.3, blue * eline * 0.5 * g, 0.0, 0.2, 0.5);
  if (id < 3.5) return Mat(vec3(0.025, 0.035, 0.06), 0.25, 1.0, blue * (0.08 + 0.25 * smoothstep(0.45, 0.8, noise(p * 9.0))) * g, 0.0, 0.6, 1.0);
  return Mat(vec3(0.0), 0.5, 0.0, blue * 1.5, 0.0, 0.0, 0.0);
}
`;

export default function tindalos({ seed = 1 } = {}) {
  // 웅크려 덮칠 자세: 앞다리는 팔꿈치를 높이 벌리고, 머리는 낮게 앞으로
  const pose = {
    pelvis: [-0.95, 0.95, 0],
    waist: [-0.42, 1.04, 0],
    chest: [0.22, 0.86, 0],
    neck: [0.62, 0.86, 0],
    head: [0.9, 0.7, 0.0],
    headDir: [1, -0.38, 0.06],
    gape: 0.6,
    legs: [
      // 앞다리: 어깨 → 팔꿈치(높이 뒤로) → 손목(낮게 앞) → 발
      { j: [[0.28, 0.74, 0.18], [0.02, 0.6, 0.4], [0.5, 0.2, 0.46], [0.7, 0.03, 0.44]], w: 0.075, up: [0, 0, 1], kneeOut: -1 },
      { j: [[0.28, 0.74, -0.18], [0.1, 0.66, -0.38], [0.66, 0.28, -0.4], [0.86, 0.04, -0.36]], w: 0.075, up: [0, 0, -1], kneeOut: -1 },
      // 뒷다리: 엉덩이 → 무릎(앞) → 뒤꿈치(높이 뒤) → 발
      { j: [[-0.95, 0.88, 0.14], [-0.55, 0.52, 0.34], [-1.25, 0.4, 0.3], [-1.1, 0.03, 0.32]], w: 0.095, up: [0, 0, 1] },
      { j: [[-0.95, 0.88, -0.14], [-0.6, 0.56, -0.32], [-1.32, 0.44, -0.28], [-1.2, 0.03, -0.28]], w: 0.095, up: [0, 0, -1] },
    ],
    tail: [[-1.0, 0.98, 0], [-1.35, 1.15, 0.05], [-1.7, 1.45, -0.05], [-1.88, 1.85, 0.1], [-1.8, 2.15, 0.2]],
  };
  const h = angleHound({ seed, pose, yaw: 0.55, size: 1.0, ribs: 5, spines: 8, teeth: 4 });
  return houndRecipe(h, {
    cam: { pos: [0.9, 0.45, 7.8], target: [-0.05, 0.95, 0.0], fov: 1.8 },
    // 뒤쪽은 모서리에서 막 빠져나오는 중: 꼬리와 엉덩이 둘레로 깨진 파편과 연기
    shards: 12,
    shardC: h.W([-1.5, 0, 0]),
    shardR: 0.75,
    shardY: 1.0,
    shardH: 1.3,
    shardL: 0.2,
    smokeC: h.W([-1.2, 0.7, 0]),
    smokeR: [1.4, 1.2, 1.2],
    smoke: 0.8,
    light: { rim: 1.3, pt: h.throat, ptCol: [0.5, 0.9, 1.6] },
    seed,
  });
}

/** 사냥개 레시피 공통: 떠 있는 파편, 조명, 셰이더 */
export function houndRecipe(h, o) {
  const R = rng(o.seed * 313 + 9);
  const [LB, LA, LG] = h.lists;
  // 깨진 공간의 파편: 몸 둘레에 떠 있는 얇은 삼각 판
  for (let i = 0; i < (o.shards ?? 0); i++) {
    const a = R() * Math.PI * 2;
    const rr = (o.shardR ?? 1.4) * (0.7 + R() * 0.6);
    const sc0 = o.shardC ?? [0, 0, 0];
    const c = [sc0[0] + Math.cos(a) * rr, (o.shardY ?? 1.0) + (R() - 0.3) * (o.shardH ?? 1.2), sc0[2] + Math.sin(a) * rr * 0.6];
    const l = (o.shardL ?? 0.25) * (0.5 + R());
    const d = [R() - 0.5, R() - 0.2, R() - 0.5];
    const e = c.map((x, k) => x + d[k] * l);
    (LG.length < 46 ? LG : LA.length < 61 ? LA : LB).push([R() - 0.5, R() - 0.5, R() - 0.5, -(3 + 10 + 1000 * 25)], [...c, l * 0.22], [...e, 0.0]);
  }
  if (LB.length > 160 || LA.length > 64 || LG.length > 48) throw new Error(`사슬 초과 uB ${LB.length} uA ${LA.length} uG ${LG.length}`);
  return {
    preset: 'act3',
    cam: o.cam,
    light: {
      key: [-0.4, 0.55, -0.8],
      keyCol: [0.9, 1.15, 1.6],
      fill: [0.6, 0.2, 0.8],
      fillCol: [0.06, 0.12, 0.22],
      amb: [0.012, 0.018, 0.03],
      rimCol: [0.55, 0.85, 1.3],
      rim: 2.4,
      glow: 0.1,
      exposure: 1.4,
      ...(o.light ?? {}),
    },
    frame: o.frame ?? { fill: 0.92, bottom: 0.03 },
    arrays: { uB: LB, uA: LA, uG: LG, uL: h.lights, uLC: h.lcol, uP: [[o.glow ?? 1, o.smoke ?? 1, 0, 0], [...(o.smokeC ?? [0, 0.8, 0]), 0], [...(o.smokeR ?? [2.4, 1.4, 1.4]), 0], ...(o.extraP ?? [])] },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 40
#define VOLUME_FAR 16.0
` + ANGLE_GLSL + /* glsl */ `
${o.helpers ?? ''}
vec2 sdf(vec3 p) {
  vec2 r = prismAll(p).xy;
  ${o.sdfExtra ?? ''}
  return r;
}
// 시간의 연기: 몸 둘레에서 피어올라 비스듬히 꺾이며 흩어지는 푸른 안개
vec4 volume(vec3 p) {
  vec3 c = uP[1].xyz;
  vec3 rr = uP[2].xyz;
  vec3 q = (p - c) / rr;
  float fall = smoothstep(1.0, 0.2, length(q));
  if (fall <= 0.0) return vec4(0.0);
  vec3 w = p * 1.6 + vec3(0.0, -p.y * 0.8, 0.0);
  float f = fbm3(w + vec3(uSeed * 3.0, 0.0, 0.0));
  float wisp = smoothstep(0.46, 0.72, f) * fall;
  float low = smoothstep(0.8, 0.0, p.y) * 0.6 + 0.4;
  vec3 col = vec3(0.25, 0.55, 1.0) * 0.5;
  return vec4(col * wisp * low * uP[0].y, wisp * low * 0.5 * uP[0].y);
}
Mat material(float id, vec3 p, vec3 n) {
  ${o.matExtra ?? ''}
  return angleMat(id, p, n);
}
`,
  };
}
