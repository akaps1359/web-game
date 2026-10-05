// 문 너머의 존재를 이루는 구체 (4층 하수인) — 요그소토스의 "무지갯빛 구체들의 무리".
// 검은 구체 위로 기름막 같은 무지갯빛이 흐르고, 작은 구체들이 거품처럼 들러붙어 함께 떠 있다.
// 세 구체는 같은 셰이더를 쓰고 (한 번만 컴파일), uniform으로 갈래를 고른다:
//   탐식(hunger)  — 세로로 갈라진 아가리, 안쪽으로 휜 바늘 이빨, 속에서 핏빛이 샌다
//   봉인(seal)    — 서로 엇갈린 청동 띠 둘에 묶이고, 띠 사이 이음매가 차가운 푸른빛으로 빛난다
//   시선(gaze)    — 아몬드꼴로 갈라진 틈 속 거대한 눈 하나, 작은 구체들에도 눈이 뜬다
import { rng } from '../../lib.js';

const VARIANTS = {
  hunger: { v: [1, 0, 0], tint: [0.03, 0.006, 0.01], glow: [1.0, 0.25, 0.32], seed: 3 },
  seal: { v: [0, 1, 0], tint: [0.006, 0.012, 0.03], glow: [0.5, 0.75, 1.0], seed: 5 },
  gaze: { v: [0, 0, 1], tint: [0.012, 0.016, 0.01], glow: [0.85, 1.0, 0.65], seed: 7 },
};

export function gateOrb(kind, { seed = 1 } = {}) {
  const V = VARIANTS[kind];
  const R = rng(seed * 97 + V.seed);
  const C = [0.0, 1.05, 0.0];
  const RAD = 0.62;
  const PB = [];
  const prm = (v) => {
    PB.push([v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0]);
    return `uA[${PB.length - 1}]`;
  };
  // 들러붙은 작은 구체들
  const sats = [];
  for (let i = 0; i < 5; i++) {
    const a = R() * Math.PI * 2;
    const e = (R() - 0.5) * 1.6;
    const d = [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e) * 0.6 - 0.3];
    const len = Math.hypot(...d);
    const r = 0.13 + R() * 0.13;
    const k = RAD + r * 0.55;
    sats.push([C[0] + (d[0] / len) * k, C[1] + (d[1] / len) * k, C[2] + (d[2] / len) * k, r]);
  }
  const P = {
    c: prm([...C, RAD]),
    v: prm([...V.v, 0]),
    tint: prm([...V.tint, 0.25]),
    glow: prm([...V.glow, 1.0]),
    n: prm([sats.length, 0, 0, 0]),
  };
  const SB = PB.length;
  for (const s of sats) PB.push(s);

  const uE = [];
  const uG = [];
  const uL = [];
  const uLC = [];
  if (kind === 'gaze') {
    // 큰 눈 (구체 앞면의 틈 속) + 작은 구체 위의 눈 셋
    uE.push([C[0], C[1] + 0.0, C[2] + RAD - 0.43, 0.38]);
    uG.push([0.05, -0.08, 1, 0]);
    for (const s of sats.slice(0, 3)) {
      const d = [s[0] - C[0], s[1] - C[1], s[2] - C[2]];
      const l = Math.hypot(...d);
      const n = [d[0] / l + 0.0, d[1] / l, d[2] / l + 0.9];
      const nl = Math.hypot(...n);
      const dir = n.map((x) => x / nl);
      uE.push([s[0] + dir[0] * s[3] * 0.72, s[1] + dir[1] * s[3] * 0.72, s[2] + dir[2] * s[3] * 0.72, s[3] * 0.38]);
      uG.push([...dir, 0]);
    }
  }
  if (kind === 'hunger') {
    uL.push([C[0], C[1], C[2] + RAD * 0.55, 0.22]);
    uLC.push([1.0, 0.15, 0.15, 0.16]);
  }
  if (kind === 'seal') {
    uL.push([C[0], C[1], C[2] + RAD * 0.9, 0.3]);
    uLC.push([0.5, 0.75, 1.0, 0.03]);
  }

  return {
    preset: 'act4',
    cam: { pos: [0.4, 1.25, 6.2], target: [0.0, 1.05, 0], fov: 1.8 },
    light: { key: [-0.45, 0.7, -0.6], fillCol: [0.1, 0.07, 0.15], amb: [0.02, 0.016, 0.03], rim: 1.5, exposure: 1.25, eyeEmit: 1.15, glow: kind === 'gaze' ? 0.02 : 0.1 },
    frame: { fill: 0.86, bottom: 0.05 },
    arrays: { uA: PB, uE, uG, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND

vec2 sdf(vec3 p) {
  vec4 C = ${P.c};
  vec3 V = ${P.v}.xyz;
  vec3 q = p - C.xyz;
  // 출렁이는 큰 구체
  float wob = 0.025 * sin(q.x * 7.0 + q.y * 5.0) * sin(q.z * 6.0 + q.y * 3.0);
  float d = length(q) - C.w + wob;
  int n = int(${P.n}.x + 0.5);
  for (int i = 0; i < n; i++) {
    vec4 s = uA[${SB} + i];
    d = smin(d, length(p - s.xyz) - s.w, 0.09);
  }
  vec2 r = vec2(d, 1.0);
  // 탐식: 세로 아가리 + 안쪽으로 휜 바늘 이빨
  if (V.x > 0.5) {
    vec3 mq = q - vec3(0.0, 0.0, C.w * 0.8);
    float maw = sdEllipsoid(mq, vec3(0.16 + 0.1 * smoothstep(0.5, 0.0, abs(mq.y)), C.w * 0.82, C.w * 0.7));
    r.x = smax(r.x, -maw, 0.03);
    r = umin(r, vec2(sdEllipsoid(q - vec3(0.0, 0.0, C.w * 0.35), vec3(0.2, C.w * 0.78, C.w * 0.55)), 99.0));
    float seg = 0.19;
    float yy = (floor(mq.y / seg) + 0.5) * seg;
    float hw = 0.16 + 0.1 * smoothstep(0.5, 0.0, abs(yy));
    float sx = sign(mq.x);
    vec3 tb = vec3(sx * hw * 0.95, yy, -0.02);
    vec3 tt = vec3(sx * 0.02, yy - 0.025, 0.04);
    float tooth = sdRoundCone(mq, tb, tt + vec3(-sx * 0.02, -0.02, 0.0), 0.034, 0.002);
    tooth = max(tooth, abs(mq.y) - C.w * 0.72);
    r = umin(r, vec2(tooth, 2.0));
  }
  // 봉인: 엇갈린 청동 띠 둘
  if (V.y > 0.5) {
    vec3 a1 = normalize(vec3(0.35, 1.0, 0.2));
    vec3 a2 = normalize(vec3(1.0, -0.25, 0.45));
    float h1 = dot(q, a1);
    float b1 = max(abs(length(q) - C.w * 1.02) - 0.035, abs(h1) - 0.07);
    float h2 = dot(q, a2);
    float b2 = max(abs(length(q) - C.w * 1.02) - 0.035, abs(h2) - 0.06);
    float bands = min(b1, b2);
    r = umin(r, vec2(bands, 3.0));
  }
  // 시선: 아몬드꼴 틈 (큰 눈이 그 안에서 보인다)
  if (V.z > 0.5) {
    vec3 eq = q - vec3(0.0, 0.0, C.w);
    float lid = max(length(eq.xy - vec2(0.0, -0.36)) - 0.45, length(eq.xy - vec2(0.0, 0.36)) - 0.45);
    r.x = smax(r.x, -max(lid, -(eq.z + 0.5)), 0.02);
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  vec4 T = ${P.tint};
  vec3 Gl = ${P.glow}.rgb;
  vec3 Vv = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, Vv), 0.0), 2.0);
  float swirl = fbm3(p * 3.0 + vec3(0.0, uSeed, 0.0));
  vec3 alb = T.rgb * (0.6 + 0.8 * swirl);
  float rough = 0.15, spec = 1.0, irid = 0.85, sss = 0.0, wet = 0.32;
  // 속에서 비치는 빛 (가장자리) + 흐르는 무늬
  vec3 emi = Gl * (fres * fres * 0.06 + 0.025 * smoothstep(0.62, 0.85, swirl));
  vec3 V = ${P.v}.xyz;
  if (id > 2.5) {
    // 청동 띠, 사이 이음매가 빛난다
    alb = vec3(0.09, 0.06, 0.03) * (0.7 + 0.5 * swirl); rough = 0.3; spec = 1.3; irid = 0.05; sss = 0.0; wet = 0.35;
    float runes = smoothstep(0.96, 0.995, sin(atan(p.y - ${P.c}.y, p.x) * 22.0)) * step(0.6, noise(p * 9.0));
    emi = Gl * runes * 0.45;
  } else if (id > 1.5) {
    alb = vec3(0.07, 0.055, 0.045); rough = 0.25; spec = 1.0; irid = 0.0; sss = 0.3; wet = 0.5; emi = vec3(0.0);
  }
  if (V.y > 0.5 && id < 1.5) {
    // 봉인 구체: 서리 낀 표면, 갈라진 금으로 빛
    float crack = smoothstep(0.02, 0.0, ridge(p * 6.0));
    emi += Gl * crack * 0.18;
    rough = 0.35;
  }
  return Mat(alb, rough, spec, emi, irid, sss, wet);
}
`,
  };
}

export default function gateOrbHunger(opts = {}) {
  return gateOrb('hunger', opts);
}
