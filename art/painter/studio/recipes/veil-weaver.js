// 장막 직조자 (5층) — 가면 뒤에 얼굴이 몇 개인지 아무도 모른다. 꿈의 실로 동료의 그림자를 짜낸다.
// 허공에 뜬 길고 여윈 형체가 겹겹의 검보랏빛 장막을 뒤집어썼다. 얼굴엔 금 간 상아빛 가면 하나 —
// 그 뒤로 똑같은 가면들이 후광처럼 둥글게 겹쳐 있고, 몇은 조금씩 다른 쪽을 본다.
// 장막 틈에서 마디 긴 팔이 셋씩 두 줄로 뻗어 나와, 바늘 같은 손가락 사이에 희미하게 빛나는 꿈의 실을 걸어 실뜨기를 한다.
// 장막 자락은 아래로 갈수록 해져 어둠 속으로 풀린다.
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};

export default function veilWeaver({ seed = 1 } = {}) {
  const R = rng(seed * 619 + 5);
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  const path = (pts, rf) => {
    pts.forEach((p, i) => ch.push([...p, rf(i / (pts.length - 1))]));
    brk();
  };
  // 팔 셋 × 양쪽: 어깨 → 팔꿈치 → 손목
  const arms = [
    { sh: [0.22, 2.35, 0.0], el: [0.75, 2.75, 0.1], wr: [0.95, 2.35, 0.45] }, // 위: 치켜들었다
    { sh: [0.2, 2.1, 0.05], el: [0.62, 1.85, 0.25], wr: [0.52, 1.72, 0.75] }, // 가운데: 앞으로 실을 건다
    { sh: [0.18, 1.85, 0.0], el: [0.6, 1.4, 0.1], wr: [0.72, 1.12, 0.5] }, // 아래
  ];
  const hands = [];
  for (const sx of [1, -1]) {
    arms.forEach((a, i) => {
      const m = (v) => [v[0] * sx, v[1], v[2]];
      path([m(a.sh), m(a.el), m(a.wr)], (t) => 0.042 - 0.02 * t + 0.01 * Math.exp(-((t - 0.5) ** 2) * 120));
      hands.push({ w: m(a.wr), sx, i });
    });
  }
  const nArm = ch.length;
  // 바늘 손가락: 셋, 길고 곧다
  const tips = [];
  for (const h of hands) {
    const out = norm([h.sx * (h.i === 1 ? -0.3 : 0.4), h.i === 0 ? 0.5 : -0.2, 0.8]);
    const ft = [];
    for (let f = 0; f < 3; f++) {
      const o = (f - 1) * 0.35;
      const d = norm(add(out, [0, o, o * 0.3 * h.sx]));
      const k = add(h.w, d, 0.12);
      const e = add(k, d, 0.16);
      path([h.w, k, e], (t) => 0.012 - 0.01 * t);
      ft.push(e);
    }
    tips.push(ft);
  }
  const nFinger = ch.length;
  // 꿈의 실: 가운데 두 손 사이 실뜨기 + 위아래 손에서 가운데로
  const thr = (a, b, sag = 0.07) => {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      ch.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t, 0.002]);
    }
    brk();
  };
  const hi = (sx, i) => hands.findIndex((h) => h.sx === sx && h.i === i);
  const mR = tips[hi(1, 1)];
  const mL = tips[hi(-1, 1)];
  thr(mR[0], mL[2], 0.03);
  thr(mR[2], mL[0], 0.05);
  thr(mR[1], mL[1], 0.12);
  thr(tips[hi(1, 0)][0], mR[0], 0.02);
  thr(tips[hi(-1, 0)][2], mL[2], 0.04);
  const nThread = ch.length;

  // 가면 후광: 머리 뒤로 둥글게 (중심, 기울기)
  const head = [0, 2.62, 0.12];
  const masks = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI / 2 + (i - 3) * 0.55;
    masks.push([head[0] + Math.cos(a) * 0.42, head[1] + Math.sin(a) * 0.36 - 0.06, head[2] - 0.16 - Math.abs(i - 3) * 0.03, (i - 3) * 0.22 + (R() - 0.5) * 0.25]);
  }

  const lights = [];
  const lc = [];
  for (let i = 0; i < 14; i++) {
    const a = mR[Math.floor(R() * 3)];
    const b = mL[Math.floor(R() * 3)];
    const t = R();
    lights.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 0.004 + R() * 0.006]);
    lc.push([0.85, 0.7, 1.0, 1.0]);
  }
  lights.push([0.043, head[1] + 0.02, head[2] + 0.1, 0.005], [-0.043, head[1] + 0.02, head[2] + 0.1, 0.005]);
  lc.push([0.85, 0.65, 1.0, 1.1], [0.85, 0.65, 1.0, 1.1]);

  return {
    preset: 'act5',
    cam: { pos: [1.2, 1.0, 7.4], target: [0.0, 1.75, 0.1], fov: 1.75 },
    light: {
      key: [-0.3, 0.6, -0.75],
      keyCol: [1.15, 0.8, 1.2],
      fillCol: [0.06, 0.1, 0.14],
      amb: [0.014, 0.011, 0.022],
      rimCol: [1.0, 0.75, 1.25],
      rim: 1.7,
      exposure: 1.2,
      glow: 0.05,
      pt: [0.15, 2.75, 1.25],
      ptCol: [0.75, 0.62, 0.9],
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: { uA: masks, uB: ch, uL: lights, uLC: lc, uP: [[nArm, nFinger, nThread, masks.length], [...head, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND
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
// 가면: 얼굴 모양의 얇은 껍질, 눈구멍 둘과 가는 입
float maskD(vec3 q) {
  float outer = sdEllipsoid(q, vec3(0.085, 0.115, 0.06));
  float shell = max(outer, -sdEllipsoid(q + vec3(0.0, 0.0, 0.022), vec3(0.08, 0.11, 0.06)));
  shell = max(shell, -q.z - 0.005);
  vec3 qs = vec3(abs(q.x), q.yz);
  shell = smax(shell, -sdEllipsoid(qs - vec3(0.033, 0.016, 0.04), vec3(0.019, 0.012, 0.06)), 0.004);
  // 코 능선
  shell = smin(shell, sdRoundCone(q, vec3(0.0, 0.01, 0.058), vec3(0.0, -0.025, 0.066), 0.006, 0.009), 0.008);
  return shell;
}

vec2 sdf(vec3 p) {
  float bb = length(p - vec3(0.0, 1.7, 0.2)) - 2.0;
  if (bb > 0.5) return vec2(bb, 1.0);
  vec3 H = uP[1].xyz;
  // ── 장막: 머리부터 덮어쓴 겹겹의 천, 아래로 갈수록 해져 풀린다
  vec3 q = p - vec3(0.0, 0.0, 0.0);
  float yy = clamp((H.y + 0.1 - q.y) / 2.3, 0.0, 1.0);
  float ang = atan(q.z, q.x);
  float rad = 0.16 + 0.22 * pow(yy, 0.7) + 0.05 * smoothstep(0.1, 0.25, yy) * (1.0 - yy);
  rad += (0.03 * sin(ang * 6.0 + q.y * 2.5) + 0.02 * sin(ang * 11.0 + 2.0)) * smoothstep(0.05, 0.6, yy);
  float veil = (length(q.xz - vec2(0.0, -0.03)) - rad) * 0.8;
  veil = max(veil, q.y - H.y - 0.14);
  float hem = 0.35 + 0.5 * fbm3(vec3(q.x * 5.0, 0.0, q.z * 5.0)) + 0.25 * smoothstep(0.5, 0.9, noise(vec3(ang * 3.0, 1.0, 0.0)));
  veil = max(veil, hem - q.y);
  // 두 번째 겹: 더 짧고 넓게 (어깨에서)
  float rad2 = 0.13 + 0.42 * smoothstep(H.y - 0.05, H.y - 1.0, q.y) + 0.035 * sin(ang * 8.0 + 1.0) * smoothstep(H.y - 0.2, H.y - 0.9, q.y);
  float veil2 = (length(q.xz - vec2(0.0, -0.02)) - rad2) * 0.8;
  veil2 = abs(veil2) - 0.01;
  veil2 = max(veil2, q.y - (H.y + 0.05));
  veil2 = max(veil2, (H.y - 1.1 + 0.25 * fbm3(vec3(q.x * 6.0, 0.0, q.z * 6.0))) - q.y);
  // 얼굴 쪽은 두건처럼 트였다
  vec3 hq = p - H;
  float hood = sdEllipsoid(hq - vec3(0.0, 0.05, -0.03), vec3(0.15, 0.2, 0.15));
  hood = max(hood, -sdEllipsoid(hq - vec3(0.0, -0.02, 0.12), vec3(0.1, 0.14, 0.12)));
  veil = smin(veil, hood, 0.06);
  veil = max(veil, -sdEllipsoid(hq - vec3(0.0, -0.02, 0.12), vec3(0.1, 0.14, 0.12)));
  float cloth = min(veil, veil2);
  if (cloth < 0.04) cloth += 0.004 * (fbm3(p * 20.0) - 0.5);
  vec2 r = vec2(cloth, 1.0);
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.02, 0.02), vec3(0.1, 0.14, 0.1)), 99.0));
  // ── 가면 (앞) + 가면 후광 (뒤)
  vec3 mq = (hq - vec3(0.0, 0.0, 0.07)) / 1.3;
  float m0 = maskD(mq) * 1.3;
  float halo = 1e5;
  for (int i = 0; i < 8; i++) {
    if (i >= int(uP[0].w)) break;
    vec4 M = uA[i];
    vec3 hq2 = p - M.xyz;
    hq2.xy = rot(-M.w) * hq2.xy;
    hq2.xz = rot(M.w * 0.6) * hq2.xz;
    halo = min(halo, maskD(hq2 / 1.15) * 1.15);
  }
  r = umin(r, vec2(min(m0, halo), 2.0));
  // ── 팔과 바늘 손가락
  float arms = chainR(p, 0, int(uP[0].x), 0.02);
  arms = min(arms, chainR(p, int(uP[0].x), int(uP[0].y), 0.002));
  r = umin(r, vec2(smin(arms, cloth + 0.01, 0.06), 3.0));
  // ── 꿈의 실
  r = umin(r, vec2(chainR(p, int(uP[0].y), int(uP[0].z), 0.0), 4.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  float v = fbm3(p * 6.0);
  if (id < 1.5) {
    // 장막: 검보랏빛 얇은 천, 빛이 비친다
    vec3 alb = vec3(0.03, 0.024, 0.042) * (0.6 + 0.8 * v);
    return Mat(alb, 0.75, 0.25, vec3(0.0), 0.15, 0.85, 0.05);
  }
  if (id < 2.5) {
    // 상아빛 가면: 금이 갔고, 뒤의 가면들은 더 바랬다
    float crack = smoothstep(0.035, 0.0, ridge(p * 13.0));
    float back = smoothstep(0.0, -0.15, p.z - uP[1].z);
    vec3 alb = mix(vec3(0.3, 0.27, 0.24), vec3(0.2, 0.18, 0.18), back) * (0.8 + 0.3 * v) * (1.0 - crack * 0.5);
    return Mat(alb, 0.32, 0.8, vec3(0.0), 0.05, 0.3, 0.3);
  }
  if (id < 3.5) return Mat(vec3(0.06, 0.05, 0.07) * (0.7 + 0.5 * v), 0.5, 0.5, vec3(0.0), 0.0, 0.4, 0.2);
  // 꿈의 실: 보랏빛으로 빛난다
  float fade = 0.35 + 0.65 * smoothstep(0.3, 0.7, noise(p * 9.0));
  return Mat(vec3(0.0), 1.0, 0.0, vec3(0.5, 0.33, 0.75) * fade, 0.0, 0.0, 0.0);
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
