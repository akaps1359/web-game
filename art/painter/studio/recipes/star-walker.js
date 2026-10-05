// 별 사이를 걷는 자 (4층 추적자) — 바람을 타고 별 사이를 걷는다. 얼어붙은 손톱, 별바람, 하늘에서 덮친다.
// 너무 길고 마른 거인이 땅에 닿지 않은 채 허공을 성큼 걷는다 — 앞으로 굽은 몸, 높이 치켜든 무릎, 앞으로 쭉 뻗은 목.
// 작은 머리엔 별처럼 타는 두 눈, 바람에 뒤로 날리는 흰 머리칼, 서리 앉은 잿빛 살갗(갈비뼈가 드러남),
// 동상으로 검게 죽은 손발과 긴 얼음 손톱. 아래에서 올려다본 거대함. 주위엔 눈보라와 별가루.
// 몸은 사슬로 이어 붙이고(척추 → 쇄골 → 팔다리), 갈비·골반·머리만 타원체로. 셰이더는 자료 배열을 고리로 돈다.
import { rng } from '../../lib.js';

const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);

export default function starWalker({ seed = 1 } = {}) {
  const R = rng(seed * 811 + 13);

  // ── 타원체 (uA: [중심, k], [반지름, 0]) ──
  const ell = [];
  const E = (c, r, k = 0.1) => ell.push([...c, k], [...r, 0]);
  const head = [0, 4.38, 1.02];
  E([0, 2.72, 0.0], [0.25, 0.2, 0.19], 0.1); // 골반
  E([0, 3.62, 0.3], [0.33, 0.4, 0.25], 0.14); // 갈비
  E(head, [0.115, 0.165, 0.15], 0.06); // 머리 (작고 길다)
  E(add(head, [0, -0.14, 0.07]), [0.07, 0.065, 0.085], 0.05); // 턱
  const nBody = ell.length;

  // ── 사슬 (uB) ── 척추·쇄골·팔다리 (살갗) → 손발 끝 → 머리칼
  const ch = [];
  const brk = () => ch.push([0, 0, 0, 0]);
  // 척추: 골반 → 허리(가늘게) → 가슴 → 목 → 머리
  ch.push([0, 2.72, 0.0, 0.2], [0, 3.15, 0.12, 0.15], [0, 3.62, 0.3, 0.24], [0, 3.95, 0.5, 0.2], [0, 4.18, 0.8, 0.075], [...add(head, [0, -0.05, -0.04]), 0.09]);
  brk();
  // 쇄골 → 팔 (오른팔은 앞 아래로, 왼팔은 앞 위로 치켜듦)
  const shR = [-0.48, 3.98, 0.42];
  const shL = [0.48, 3.98, 0.42];
  const wrR = [-0.92, 2.55, 1.58];
  const wrL = [1.42, 4.95, 1.18];
  ch.push([0, 3.96, 0.5, 0.12], [...shR, 0.1], [-0.86, 3.3, 1.0, 0.065], [...wrR, 0.042]);
  brk();
  ch.push([0, 3.96, 0.5, 0.12], [...shL, 0.1], [1.12, 4.32, 0.76, 0.065], [...wrL, 0.042]);
  brk();
  // 다리: 앞다리는 무릎을 높이 들었고, 뒷다리는 뒤로 끌린다
  const ankR = [-0.33, 1.1, 0.78];
  const ankL = [0.36, 0.66, -0.78];
  ch.push([-0.17, 2.66, 0.04, 0.15], [-0.3, 2.0, 0.88, 0.095], [...ankR, 0.06]);
  brk();
  ch.push([0.17, 2.66, -0.04, 0.15], [0.3, 1.6, -0.24, 0.095], [...ankL, 0.06]);
  brk();
  const nSkin = ch.length;
  // 손: 손바닥 + 긴 손가락 (손톱은 얼음)
  const hand = (w, dir, side, spread) => {
    const palm = add(w, dir, 0.1);
    ch.push([...w, 0.045], [...palm, 0.04]);
    brk();
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * spread;
      const b0 = add(palm, side, o * 0.6);
      const b1 = add(add(b0, dir, 0.16), side, o);
      const b2 = add(add(b1, dir, 0.15), side, o * 0.8);
      const b3 = add(add(b2, dir, 0.17), [0, -0.05, 0]);
      ch.push([...b0, 0.022], [...b1, 0.017], [...b2, 0.012], [...b3, 0.003]);
      brk();
    }
  };
  hand(wrR, [-0.1, -0.5, 0.86], [0.95, 0, 0.25], 0.045);
  hand(wrL, [0.35, 0.75, 0.55], [0.2, -0.55, 0.8], 0.06);
  // 발: 발등 + 긴 발가락 (아래로 늘어진다)
  const foot = (a, dir) => {
    const mid = add(a, dir, 0.18);
    ch.push([...a, 0.055], [...mid, 0.045]);
    brk();
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 0.04;
      const b0 = add(mid, [o, 0, 0]);
      ch.push([...b0, 0.022], [...add(add(b0, dir, 0.12), [o * 0.8, -0.05, 0]), 0.014], [...add(add(b0, dir, 0.2), [o * 1.2, -0.17, 0]), 0.004]);
      brk();
    }
  };
  foot(ankR, [0.0, -0.75, 0.66]);
  foot(ankL, [0.05, -0.85, -0.5]);
  const nExt = ch.length;
  // 머리칼: 바람에 뒤로 날린다
  for (let k = 0; k < 6; k++) {
    const a = -1.2 + (k / 5) * 2.4;
    const base = add(head, [Math.sin(a) * 0.1, 0.1 - Math.abs(a) * 0.05, -0.08]);
    const len = 1.5 + R() * 1.1;
    const ph = R() * 6.28;
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      ch.push([base[0] + Math.sin(a) * t * 0.6 + t * 0.3 + Math.sin(t * 9 + ph) * 0.16 * t, base[1] + t * 0.3 - t * t * 0.55 + Math.cos(t * 7 + ph) * 0.1 * t, base[2] - len * t, 0.026 * Math.pow(1 - t, 0.7) + 0.004]);
    }
    brk();
  }
  const nAll = ch.length;

  // 눈: 별처럼 타는 두 점 + 눈보라 + 별가루
  const eyeC = add(head, [0, 0.02, 0.13]);
  const lights = [
    [eyeC[0] - 0.05, eyeC[1], eyeC[2] + 0.01, 0.024],
    [eyeC[0] + 0.05, eyeC[1], eyeC[2] + 0.01, 0.024],
  ];
  const lc = [
    [0.85, 0.95, 1.0, 4.0],
    [0.85, 0.95, 1.0, 4.0],
  ];
  for (let i = 0; i < 20; i++) {
    lights.push([(R() - 0.5) * 3.4, 0.4 + R() * 5.0, -1.2 + R() * 2.6, 0.004 + R() * 0.008]);
    lc.push(R() < 0.7 ? [0.85, 0.92, 1.0, 0.8] : [1.0, 0.9, 0.6, 0.8]);
  }

  return {
    preset: 'act4',
    cam: { pos: [-6.2, 0.45, 9.6], target: [0, 2.9, 0.3], fov: 1.8 },
    light: {
      key: [-0.3, 0.6, -0.75],
      keyCol: [1.0, 1.1, 1.35],
      fillCol: [0.07, 0.08, 0.14],
      amb: [0.015, 0.018, 0.03],
      rimCol: [0.9, 1.0, 1.3],
      rim: 1.6,
      exposure: 1.2,
      glow: 0.1,
      pt: [-0.4, 3.4, 2.4],
      ptCol: [0.35, 0.45, 0.7],
    },
    frame: { fill: 0.92, bottom: 0.025 },
    arrays: { uA: ell, uB: ch, uL: lights, uLC: lc, uP: [[nBody, nSkin, nExt, nAll], [...eyeC, 0]] },
    glsl: /* glsl */ `
#define NO_GROUND

float ellR(vec3 p, int a, int b) {
  float d = 1e5;
  for (int i = a; i < b; i += 2) d = smin(d, sdEllipsoid(p - uA[i].xyz, uA[i + 1].xyz), uA[i].w);
  return d;
}
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
  float body = ellR(p, 0, int(uP[0].x));
  body = smin(body, chainR(p, 0, int(uP[0].y), 0.05), 0.08);
  // 갈비뼈
  float rib = sin(p.y * 46.0 - abs(p.x) * 8.0);
  body -= 0.008 * rib * smoothstep(3.3, 3.45, p.y) * smoothstep(3.95, 3.8, p.y) * step(0.3, p.z);
  float ext = chainR(p, int(uP[0].y), int(uP[0].z), 0.012);
  vec2 r = vec2(smin(body, ext, 0.03), 1.0);
  if (ext < body) r.y = 2.0;
  // 눈구멍
  vec3 e = p - uP[1].xyz;
  r.x = smax(r.x, -sdEllipsoid(vec3(abs(e.x), e.yz) - vec3(0.05, 0.0, 0.0), vec3(0.036, 0.022, 0.04)), 0.01);
  float hair = chainR(p, int(uP[0].z), int(uP[0].w), 0.01);
  r = umin(r, vec2(hair, 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 서리 앉은 잿빛 살갗: 푸른 핏줄, 위를 향한 면엔 반짝이는 서리
    float v = fbm3(p * 6.0);
    float vein = smoothstep(0.05, 0.0, ridge(p * 5.0)) * 0.5;
    vec3 alb = mix(vec3(0.075, 0.085, 0.105), vec3(0.03, 0.04, 0.07), vein) * (0.7 + 0.5 * v);
    float frost = smoothstep(0.3, 0.9, n.y) * smoothstep(0.4, 0.7, noise(p * 18.0));
    alb = mix(alb, vec3(0.22, 0.25, 0.3), frost * 0.7);
    float rime = step(0.85, hash31(floor(p * 140.0))) * smoothstep(0.2, 0.8, n.y);
    return Mat(alb, 0.6, 0.6 + rime * 2.0, vec3(0.6, 0.75, 1.0) * rime * 0.2, 0.0, 0.55, 0.25);
  }
  if (id < 2.5) {
    // 동상으로 검게 죽은 손발, 얼음 손톱
    return Mat(vec3(0.012, 0.015, 0.022), 0.25, 1.4, vec3(0.0), 0.15, 0.2, 0.7);
  }
  // 흰 머리칼
  return Mat(vec3(0.2, 0.22, 0.26), 0.6, 0.5, vec3(0.0), 0.0, 0.6, 0.1);
}
`,
  };
}
