// 천 마리 새끼의 어머니 (4층 정예) — 숲의 검은 염소. 새끼를 낳고, 검은 젖을 먹이고, 숲이 일어선다.
// 뒤로 꺾인 무릎과 발굽을 가진 나무 둥치 같은 다리 위에 울퉁불퉁한 검은 살 구름이 얹혀 있다.
// 위로는 죽은 숲의 가지처럼 갈라지는 촉수, 꼭대기엔 거대하게 말린 염소 뿔, 살 곳곳에 오므린 입이 초록 점액을 흘리고,
// 아래로는 검은 젖이 맺힌 주머니가 늘어졌다. 작은 염소 눈 몇 개가 어둠 속에서 뜬다.
// 형체는 자료 배열(uA 덩어리·입, uB 사슬)로 넘기고 셰이더는 고리로 돈다.
import { rng } from '../../lib.js';

export default function thousandMother({ seed = 1 } = {}) {
  const R = rng(seed * 271 + 3);

  // ── 살 구름 (uA 0..): [x,y,z,r] ──
  const A = [];
  const core = [
    [0, 2.15, 0, 0.78],
    [-0.55, 2.35, -0.1, 0.55],
    [0.6, 2.3, -0.05, 0.58],
    [0.05, 2.75, -0.15, 0.55],
    [-0.4, 1.8, 0.2, 0.5],
    [0.45, 1.75, 0.2, 0.5],
    [0.0, 1.65, -0.35, 0.55],
  ];
  const LIFT = 0.45;
  for (const c of core) A.push([c[0], c[1] + LIFT, c[2], c[3]]);
  for (let i = 0; i < 16; i++) {
    const a = R() * Math.PI * 2;
    const el = (R() - 0.35) * 1.6;
    const rr = 0.75 + R() * 0.4;
    A.push([Math.cos(a) * rr * Math.cos(el) * 1.15, 2.2 + LIFT + Math.sin(el) * rr * 0.75, Math.sin(a) * rr * Math.cos(el) * 0.8, 0.16 + R() * 0.24]);
  }
  const nBlob = A.length;
  // 입: [중심, 크기], [방향(바깥 법선)]
  const mouthsAt = [
    [-0.32, 2.2, 0.72, 0.13],
    [0.42, 2.45, 0.62, 0.1],
    [0.12, 1.75, 0.68, 0.11],
    [-0.75, 2.6, 0.3, 0.08],
    [0.85, 1.95, 0.35, 0.085],
    [0.0, 2.85, 0.45, 0.075],
  ];
  for (const m0 of mouthsAt) {
    const m = [m0[0], m0[1] + LIFT, m0[2] + 0.04, m0[3]];
    const n = [m[0] * 0.6, (m0[1] - 2.15) * 0.8, m[2]];
    const l = Math.hypot(...n);
    A.push(m, [n[0] / l, n[1] / l, n[2] / l, 0]);
  }
  const nAll = A.length;

  // ── 사슬 (uB) ── 다리·가지·늘어진 촉수 (살갗) → 뿔 → 젖주머니
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  // 다리: 엉덩이 → 무릎(앞) → 뒤꿈치(뒤로 꺾임) → 발굽
  const legs = [
    [-0.62, 0.42, 1],
    [0.66, 0.38, 1],
    [-0.5, -0.5, 0.92],
    [0.55, -0.48, 0.92],
    [0.05, 0.62, 0.85],
  ];
  for (const [x, z, s] of legs) {
    const hip = [x * 0.85, 2.05, z * 0.6];
    const knee = [x * 1.15, 1.45 * s, z * 0.8 + 0.32];
    const hock = [x * 1.22, 0.62 * s, z * 0.85 - 0.25];
    const hoof = [x * 1.25, 0.06, z * 0.9 + 0.02];
    ch.push([...hip, 0.24], [...knee, 0.12], [...hock, 0.085], [...hoof, 0.075]);
    brk();
  }
  // 위로 갈라지는 가지 촉수
  for (let k = 0; k < 7; k++) {
    const a = -1.25 + (k / 6) * 2.5 + (R() - 0.5) * 0.2;
    const base = [Math.sin(a) * 0.55, 2.55 + LIFT + Math.cos(a) * 0.2, -0.15 + (R() - 0.5) * 0.3];
    const len = 1.2 + R() * 0.8;
    const bend = (R() - 0.5) * 0.8;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      ch.push([base[0] + Math.sin(a) * len * t * 0.9 + bend * t * t, base[1] + len * t * (0.75 + Math.cos(a) * 0.3) - t * t * 0.25, base[2] + Math.sin(t * 4 + k) * 0.12 - t * 0.2, 0.16 * Math.pow(1 - t, 0.9) + 0.012]);
    }
    brk();
  }
  // 늘어진 촉수 (땅을 더듬는다)
  for (let k = 0; k < 3; k++) {
    const a = -1.0 + (k / 2) * 2.0;
    const base = [Math.sin(a) * 0.75, 1.75 + LIFT, 0.35];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      ch.push([base[0] + Math.sin(a) * t * 0.9 + Math.sin(t * 5 + k) * 0.1, base[1] - t * 1.9 + t * t * 0.15, base[2] + t * 0.7, 0.08 * Math.pow(1 - t, 0.8) + 0.01]);
    }
    brk();
  }
  const nSkin = ch.length;
  // 뿔: 머리 쪽 덩어리에서 뒤로 말려 나온다
  // 숫양처럼 옆으로 말린 큰 뿔 (앞에서 보면 소용돌이가 보인다)
  for (const sx of [1, -1]) {
    const base = [sx * 0.38, 3.05 + LIFT, 0.2];
    const M = 12;
    for (let i = 0; i < M; i++) {
      const t = i / (M - 1);
      const a = t * 4.3;
      const s = 1 - 0.42 * t;
      ch.push([base[0] + sx * (0.62 * (1 - Math.cos(a)) * s + 0.12 * t), base[1] + 0.62 * Math.sin(a) * s, base[2] - 0.18 * Math.sin(a * 0.5) + 0.12 * t, 0.17 * Math.pow(1 - t, 0.85) + 0.014]);
    }
    brk();
  }
  const nHorn = ch.length;
  // 검은 젖주머니
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.24 + (R() - 0.5) * 0.08;
    const top = [x, 1.55 + LIFT, 0.25 + (R() - 0.5) * 0.2];
    const len = 0.35 + R() * 0.25;
    ch.push([...top, 0.13], [x * 1.05, top[1] - len * 0.55, top[2] + 0.04, 0.12], [x * 1.08, top[1] - len, top[2] + 0.06, 0.04]);
    brk();
  }
  const nAllCh = ch.length;

  // 눈: 살 사이에서 (작게)
  const cam = [0.5, 0.55, 10.5];
  const eyes = [];
  const gaze = [];
  const eyeAt = [
    [-0.12, 2.95, 0.42, 0.045],
    [0.2, 2.98, 0.4, 0.04],
    [-0.6, 2.05, 0.6, 0.035],
    [0.68, 2.25, 0.5, 0.03],
    [0.32, 2.05, 0.75, 0.03],
  ];
  for (const e0 of eyeAt) {
    const e = [e0[0], e0[1] + LIFT, e0[2] + 0.03, e0[3]];
    let g = [cam[0] - e[0] + (R() - 0.5) * 2, cam[1] - e[1], cam[2] - e[2]];
    const l = Math.hypot(...g);
    g = g.map((v) => v / l);
    eyes.push(e);
    gaze.push([...g, 0]);
  }

  // 입에서 떨어지는 초록 점액 빛
  const lights = [];
  const lc = [];
  for (const m of mouthsAt.slice(0, 4)) {
    lights.push([m[0], m[1] + LIFT - m[3] * 1.5, m[2] + 0.1, 0.018]);
    lc.push([0.6, 1.0, 0.35, 0.8]);
  }
  for (let i = 0; i < 8; i++) {
    const a = R() * 6.28;
    lights.push([Math.cos(a) * (1.4 + R()), 0.3 + R() * 3.6, 0.4 + R() * 0.6, 0.006 + R() * 0.008]);
    lc.push([0.65, 1.0, 0.4, 0.7]);
  }

  return {
    preset: 'act4',
    cam: { pos: [cam[0], cam[1], 11.6], target: [0, 2.4, 0], fov: 1.8 },
    light: {
      key: [-0.3, 0.6, -0.75],
      keyCol: [1.15, 1.05, 0.6],
      fillCol: [0.1, 0.12, 0.07],
      amb: [0.016, 0.018, 0.012],
      rimCol: [0.95, 1.05, 0.6],
      rim: 1.3,
      exposure: 1.25,
      pt: [0.0, 1.0, 1.6],
      ptCol: [0.7, 1.2, 0.35],
    },
    frame: { fill: 0.93, bottom: 0.025 },
    arrays: { uA: A, uB: ch, uE: eyes, uG: gaze, uL: lights, uLC: lc, uP: [[nBlob, nAll, nSkin, nHorn], [nAllCh, 0, 0, 0]] },
    glsl: /* glsl */ `
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

vec2 sdf(vec3 p) {
  float d = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= int(uP[0].x)) break;
    d = smin(d, length(p - uA[i].xyz) - uA[i].w, 0.22);
  }
  d = smin(d, chainR(p, 0, int(uP[0].z), 0.04), 0.12);
  // 오므린 입: 살을 파내고 입술을 두른다
  float hole = 1e5;
  for (int i = int(uP[0].x); i < int(uP[0].y); i += 2) {
    vec4 m = uA[i];
    vec3 n = uA[i + 1].xyz;
    vec3 q = p - m.xyz;
    float lip = length(vec2(length(q - n * dot(q, n)) - m.w * 0.8, dot(q, n) - m.w * 0.15)) - m.w * 0.35;
    d = smin(d, lip, m.w * 0.5);
    d = smax(d, -(length(q - n * m.w * 0.2) - m.w * 0.62), m.w * 0.2);
    hole = min(hole, length(q + n * m.w * 0.25) - m.w * 0.6);
  }
  // 나무껍질 같은 주름
  d += 0.04 * (noise(p * 4.0) - 0.5) + 0.01 * sin(p.y * 19.0 + sin(p.x * 6.0) * 3.0) * sin(p.x * 13.0 + p.z * 11.0);
  vec2 r = vec2(d, 1.0);
  r = umin(r, vec2(hole, 99.0));
  r = umin(r, vec2(chainR(p, int(uP[0].z), int(uP[0].w), 0.02), 2.0));
  float udder = chainR(p, int(uP[0].w), int(uP[1].x), 0.05);
  r = umin(r, vec2(udder, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검고 젖은 가죽, 아래로 갈수록 나무껍질처럼 거칠다. 발굽은 검게 반짝인다
    float v = fbm3(p * 5.0);
    float bark = smoothstep(0.03, 0.0, ridge(vec3(p.x * 9.0, p.y * 2.0, p.z * 9.0))) * smoothstep(1.7, 0.6, p.y);
    vec3 alb = vec3(0.022, 0.019, 0.014) * (0.6 + 0.8 * v) * (1.0 - bark * 0.6);
    // 입가의 초록 점액: 입술과 그 아래로 짧게 흐른 줄기만
    float slime = 0.0;
    for (int i = int(uP[0].x); i < int(uP[0].y); i += 2) {
      vec4 m = uA[i];
      vec3 q = p - m.xyz;
      float lipz = smoothstep(m.w * 1.5, m.w * 1.0, length(q));
      float run = smoothstep(m.w * 0.9, 0.0, abs(q.x + 0.02 * sin(q.y * 30.0))) * smoothstep(0.0, -0.05, q.y) * smoothstep(-0.55, -0.1, q.y) * step(0.0, q.z + m.w);
      slime = max(slime, max(lipz * 0.6, run));
    }
    slime *= smoothstep(0.35, 0.65, noise(p * vec3(14.0, 4.0, 14.0)));
    vec3 emi = vec3(0.35, 0.9, 0.18) * slime * 0.12;
    float hoof = smoothstep(0.2, 0.12, p.y);
    return Mat(mix(alb, vec3(0.008), hoof), mix(0.55, 0.2, max(slime, hoof)), mix(0.6, 1.3, max(slime, hoof)), emi, 0.08, 0.15, mix(0.5, 1.0, slime));
  }
  if (id < 2.5) {
    // 뿔: 골이 진 검은 뿔, 끝으로 갈수록 바랜다
    float ring = 0.7 + 0.3 * sin(length(p.xz) * 90.0 + p.y * 40.0);
    vec3 alb = mix(vec3(0.02, 0.018, 0.014), vec3(0.11, 0.095, 0.07), smoothstep(3.6, 4.3, p.y)) * ring;
    return Mat(alb, 0.55, 0.5, vec3(0.0), 0.0, 0.0, 0.2);
  }
  // 젖주머니: 팽팽하게 부푼 검은 살, 끝에 검은 젖이 맺혔다
  float tip = smoothstep(1.75, 1.5, p.y);
  return Mat(mix(vec3(0.035, 0.028, 0.026), vec3(0.004), tip), 0.3, 1.0, vec3(0.0), 0.1, 0.4, mix(0.5, 1.0, tip));
}
`,
  };
}
