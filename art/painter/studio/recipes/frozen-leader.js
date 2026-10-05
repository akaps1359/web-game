// 시간에 얼어붙은 탐사대장 (3층 균열 수호자) — 균열 너머, 시간이 멈춘 얼음 속의 탐사대장.
// 그날 밤의 마지막 순간: 조명탄 권총을 하늘로 쏘아 올린 바로 그 찰나에 멈췄다. 총구를 막 떠난 조명탄이
// 핏빛으로 타오르는 채 허공에 걸려 있고, 그 연기와 불티도 그대로 멎었다. 붉은 빛이 얼굴과 서리 앉은 외투를 위에서 비춘다.
// 뒤로는 그를 가두었던 거대한 얼음 결정이 갈라져 솟았고, 깨진 얼음 조각들이 떨어지다 만 채 공중에 떠 있다.
// 다른 손엔 얼음도끼, 이마엔 방한 고글. 손목시계의 바늘은 움직이지 않는다.
import { rng } from '../../lib.js';

const { expedition } = await import(/* @vite-ignore */ `/art/painter/studio/recipes/frozen-explorer.js?t=${Date.now()}`);

const v3 = (a) => `vec3(${a.map((x) => (+x).toFixed(4)).join(', ')})`;

export default function frozenLeader({ seed = 1 } = {}) {
  const R = rng(seed * 401 + 9);
  const YAW = -0.22;
  const c = Math.cos(YAW);
  const s = Math.sin(YAW);
  const toWorld = ([x, y, z]) => [c * x - s * z, y, s * x + c * z];
  let J;
  // 공중에 멎은 얼음 조각 (uA: 지역 좌표 + 크기)
  const shards = [];
  for (let i = 0; i < 300 && shards.length < 15; i++) {
    const a = R() * Math.PI * 2;
    const rr = 0.45 + R() * 0.75;
    const p = [Math.cos(a) * rr, 0.25 + Math.pow(R(), 0.8) * 2.05, Math.sin(a) * rr * 0.55 - 0.05];
    if (Math.abs(p[0]) < 0.42 && p[2] > -0.2 && p[1] < 1.9) continue; // 몸 앞은 비운다
    if (shards.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 0.16)) continue;
    shards.push([...p, 0.022 + Math.pow(R(), 2) * 0.05]);
  }
  const big = [
    // 뒤에 솟은 큰 결정: [x, y, z, 길이], 기울기는 셰이더에서
    [-0.42, 0.0, -0.42, 2.05],
    [0.47, 0.0, -0.48, 1.65],
    [-0.08, 0.0, -0.66, 2.35],
    [0.72, 0.0, -0.12, 0.85],
    [-0.7, 0.0, -0.02, 0.95],
  ];
  const opts = {
    seed: seed + 7,
    yaw: YAW,
    hunch: 0.25,
    lean: -0.12,
    tilt: -0.12,
    bow: -0.28, // 하늘을 올려다본다
    tool: 'flare',
    leader: true,
    goggles: true,
    ice: 1.15,
    mist: 0.8,
    mistR: 0.9,
    cam: { pos: [0.7, 0.5, 7.4], target: [0.0, 1.3, 0.0], fov: 1.85 },
    frame: { fill: 0.93 },
    onJoints(j) {
      J = j;
      j.toolDir.splice(0, 3, ...normalize([0.1, 1.0, 0.18]));
    },
  };
  expedition(opts); // 관절 위치만 얻는다
  // 관절이 정해진 뒤의 위치들 (지역 좌표)
  const dir = normalize([0.1, 1.0, 0.18]);
  const wr = J.wrR;
  const el = J.elR;
  const fdir = normalize(wr.map((v, i) => v - el[i]));
  const grip = wr.map((v, i) => v + fdir[i] * 0.075);
  const muzzle = grip.map((v, i) => v + dir[i] * 0.27);
  const flare = grip.map((v, i) => v + dir[i] * 0.47 + [0.03, 0, 0.03][i]);
  const watch = J.wrL;
  const lights = [];
  const lc = [];
  lights.push([...toWorld(flare), 0.06]);
  lc.push([1.0, 0.35, 0.14, 1.8]);
  lights.push([...toWorld(flare), 0.3]);
  lc.push([1.0, 0.1, 0.03, 0.95]);
  // 멎은 연기 꼬리: 총구에서 조명탄까지 휘어 오른다 (붉게 물든 희미한 빛)
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const q = muzzle.map((v, k) => v + (flare[k] - v) * t + [0.04 * Math.sin(t * 7), 0, 0.03 * Math.cos(t * 5)][k]);
    lights.push([...toWorld(q), 0.018 + t * 0.03]);
    lc.push([0.9, 0.25, 0.12, 0.45]);
  }
  // 멎은 불티
  for (let i = 0; i < 15; i++) {
    const t = R();
    const q = muzzle.map((v, k) => v + (flare[k] - v) * (0.2 + t * 0.9) + (R() - 0.5) * 0.22 * (0.4 + t));
    lights.push([...toWorld(q), 0.004 + R() * 0.006]);
    lc.push([1.0, 0.45 + R() * 0.25, 0.15, 1.1]);
  }
  const glsl = /* glsl */ `
const vec3 FLARE = ${v3(flare)};
const vec3 MUZZLE = ${v3(muzzle)};
const vec3 WATCH = ${v3(watch)};

float sdHexPrism(vec3 p, vec2 h) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x), p.z - h.y);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
/** 얼음 결정: 바닥 c에서 기울기 (ax, az)로 길이 L, 끝이 뾰족한 육각기둥 */
float crystal(vec3 p, vec3 c, float L, float w, float ax, float az, float tw) {
  vec3 q = p - c;
  q.xy = rot(ax) * q.xy;
  q.zy = rot(az) * q.zy;
  q.xz = rot(tw) * q.xz;
  float d = sdHexPrism(vec3(q.x, q.z, q.y - L * 0.5), vec2(w, L * 0.5));
  // 뾰족한 끝
  d = max(d, (q.y - L) * 0.6 + length(q.xz) * 0.8 - 0.0);
  d = max(d, (q.y - (L - w * 1.6)) * 0.55 + length(q.xz) * 0.9 - w * 0.9);
  return d;
}
/** 길쭉한 얼음 조각 (뒤틀린 팔면체) */
float shard(vec3 p, vec4 s, float i) {
  vec3 q = p - s.xyz;
  float h1 = hash11(i * 7.1 + 1.0);
  float h2 = hash11(i * 3.7 + 5.0);
  q.xy = rot(h1 * 6.28) * q.xy;
  q.yz = rot(h2 * 6.28) * q.yz;
  vec3 a = abs(q) / vec3(s.w * 0.4, s.w * 2.0, s.w * 0.28);
  return (a.x + a.y + a.z - 1.0) * s.w * 0.3;
}
`;
  const sdf = /* glsl */ `
  // ── 얼음 결정과 멎은 조각
  {
    float ice2 = 1e5;
    int n0 = int(uP[0].x);
    int n1 = int(uP[0].y);
    for (int i = 0; i < 64; i++) {
      if (i >= n0) break;
      vec4 s = uA[i];
      if (length(p - s.xyz) > s.w * 2.5 + 0.05) { ice2 = min(ice2, length(p - s.xyz) - s.w * 2.0); continue; }
      ice2 = min(ice2, shard(p, s, float(i)));
    }
    for (int i = 0; i < 64; i++) {
      if (i < n0) continue;
      if (i >= n1) break;
      vec4 s = uA[i];
      float fi = float(i);
      float ax = -s.x * 0.32 + (hash11(fi) - 0.5) * 0.2;
      float az = -0.18 - hash11(fi + 2.0) * 0.25;
      float w = 0.06 + s.w * 0.03;
      float d = crystal(p, s.xyz, s.w, w, ax, az, fi);
      // 곁가지 결정
      d = min(d, crystal(p, s.xyz + vec3(0.12 * sign(s.x + 0.01), 0.0, 0.05), s.w * 0.55, w * 0.6, ax - 0.35 * sign(s.x + 0.01), az + 0.1, fi + 1.0));
      ice2 = min(ice2, d);
    }
    // 발목을 문 얼음 덩이
    float base = sdEllipsoid(p - vec3(0.02, -0.03, 0.0), vec3(0.42, 0.13, 0.3));
    base = max(base, -p.y + 0.0);
    base += 0.04 * (fbm3(p * 7.0) - 0.5);
    ice2 = min(ice2, base);
    r = umin(r, vec2(ice2, 20.0));
    // 손목시계 (왼손목, 멈춘 바늘)
    float wt = sdCylinder((p - WATCH - vec3(0.0, 0.04, 0.0)).xzy, 0.006, 0.02);
    r = umin(r, vec2(wt, 21.0));
  }
  // 얼음도끼 (왼손에 늘어뜨림)
  {
    float m2;
    float ax2 = tool(p, WR_L + normalize(WR_L - EL_L) * 0.075, normalize(vec3(-0.15, 1.0, -0.1)), 0, m2);
    r = umin(r, vec2(ax2, m2 > 0.5 ? 9.0 : 10.0));
  }
`;
  const mat = /* glsl */ `
  if (id > 19.5 && id < 20.5) {
    // 맑은 얼음: 속에서 푸른 빛이 돌고, 금이 하얗게 갔다. 조명탄의 붉은 빛이 비친다
    vec3 V = normalize(uCamPos - p);
    float fr = 1.0 - abs(dot(n, V));
    float crack = 0.0;
    float bub = smoothstep(0.7, 0.9, noise(lp * vec3(40.0, 5.0, 40.0))) * (0.4 + 0.6 * noise(lp * 3.0));
    float depth = 0.3 + 0.7 * fbm3(lp * 2.5);
    vec3 emi = vec3(0.012, 0.035, 0.065) * depth * (1.0 - fr * 0.7) + vec3(0.12, 0.2, 0.3) * (crack * 0.35 + bub * 0.12);
    float fl = 1.0 / (1.0 + 4.0 * dot(lp - FLARE, lp - FLARE));
    emi += vec3(0.45, 0.08, 0.03) * fl * (0.25 + crack + fr * 0.5);
    float low = smoothstep(0.12, -0.02, lp.y);
    vec3 alb = mix(vec3(0.008, 0.014, 0.022), snowCol * 0.7, low * 0.6);
    return Mat(alb, 0.05 + low * 0.5, 1.5, emi, 0.0, 0.15, 0.45);
  }
  if (id > 20.5 && id < 21.5) {
    // 시계: 희미하게 빛나는 문자판
    return Mat(vec3(0.05), 0.2, 1.2, vec3(0.35, 0.42, 0.4), 0.0, 0.0, 0.8);
  }
`;
  const vol = '';
  const rec = expedition({
    ...opts,
    onJoints: (j) => j.toolDir.splice(0, 3, ...normalize([0.1, 1.0, 0.18])),
    extraArrays: { uA: [...shards, ...big], uL: lights, uLC: lc, uP: [[shards.length, shards.length + big.length, 0, 0]] },
    light: {
      pt: toWorld(flare.map((v, i) => v + [0.0, -0.05, 0.12][i])),
      ptCol: [4.2, 0.9, 0.35],
      key: [-0.35, 0.65, -0.68],
      rim: 2.0,
      exposure: 1.25,
      glow: 0.05,
    },
    extraGlsl: glsl,
    extraSdf: sdf,
    extraMat: mat,
    extraVol: vol,
  });
  return rec;
}

function normalize(a) {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
}
