// 혜성 탯줄 (5층 하수인, 별의 태아에게서 뻗어 나온 탯줄) — 어둠 속에서 솟아올라 뒤틀리는 굵은 탯줄.
// 밑동은 어둠으로 풀어지고, 위로 갈수록 젖은 젤리 같은 살 속 나선 핏줄이 비치다가 푸른 흰빛으로 달아오른다.
// 끝은 잘린 탯줄의 단면 — 세 개의 핏줄 구멍에서 별빛이 쏟아지고, 혜성처럼 빛의 꼬리와 불티를 끈다.
// 형체: 사슬(uB) 한 줄 + 끝의 단면. 빛: 끝에서 혜성 꼬리(덧칠), 불티(uL).
import { rng } from '../../lib.js';

export default function cometCord({ seed = 1 } = {}) {
  const R = rng(seed * 97 + 3);
  // 솟아오르며 뒤틀리는 길: 아래에서 위로, S자 두 번 + 비틀림
  // 뼈대: 두 번 S자로 꺾여 솟았다가, 끝이 뱀 머리처럼 앞으로 숙여진다
  const bez = (P, t) => [0, 1, 2].map((j) => (1 - t) ** 3 * P[0][j] + 3 * (1 - t) ** 2 * t * P[1][j] + 3 * (1 - t) * t * t * P[2][j] + t ** 3 * P[3][j]);
  const S1 = [[0.3, -0.4, -0.3], [2.0, 0.6, 0.2], [-1.9, 1.5, -0.2], [-0.3, 2.6, 0.1]];
  const S2 = [[-0.3, 2.6, 0.1], [0.4, 3.4, 0.3], [1.3, 3.6, 0.5], [1.2, 2.9, 1.0]];
  const N = 46;
  const B = [];
  const ph = R() * 6;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const c = t < 0.68 ? bez(S1, t / 0.68) : bez(S2, (t - 0.68) / 0.32);
    c[0] += Math.sin(t * 17 + ph) * 0.05;
    c[2] += Math.cos(t * 13 + ph) * 0.05;
    // 거짓 매듭처럼 군데군데 부푼다. 밑동은 실처럼 가늘어져 어둠으로 사라진다
    let r = 0.12 - 0.025 * t + 0.03 * Math.max(0, Math.sin(t * 19 + ph)) ** 3;
    r *= Math.min(1, 0.12 + t * 5.0);
    if (t > 0.94) r += (t - 0.94) * 0.6;
    B.push([...c, r]);
  }
  const end = B[N - 1];
  const prev = B[N - 3];
  const tg = [end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]];
  const tl = Math.hypot(...tg);
  const T = tg.map((v) => v / tl);
  // 불티: 머리 둘레와 꼬리 쪽으로 흩어진다
  const uL = [[end[0] + T[0] * 0.06, end[1] + T[1] * 0.06, end[2] + T[2] * 0.06, 0.1]];
  const uLC = [[0.7, 0.9, 1.0, 0.8]];
  for (let i = 0; i < 18; i++) {
    const k = N - 1 - Math.floor(R() * R() * 22);
    const c = B[k];
    const sp = 0.15 + R() * 0.55;
    uL.push([c[0] + (R() - 0.5) * sp - 0.15, c[1] + (R() - 0.4) * sp, c[2] + (R() - 0.5) * sp, 0.008 + R() * 0.016]);
    uLC.push(R() < 0.75 ? [0.7, 0.9, 1.0, 0.9] : [1.0, 0.85, 0.6, 0.9]);
  }
  // 혜성 꼬리 방향: 머리가 나아가는 쪽의 반대 (뒤·위·왼쪽)
  const td = [-0.55, 0.8, -0.25];
  const tdl = Math.hypot(...td);
  const tailD = td.map((v) => v / tdl);
  const f3 = (a) => `vec3(${a.map((n) => n.toFixed(4)).join(', ')})`;
  return {
    preset: 'act5',
    cam: { pos: [0.6, -1.2, 9.4], target: [0.3, 1.7, 0], fov: 1.9 },
    light: {
      key: [-0.4, 0.5, -0.75],
      keyCol: [0.7, 0.78, 1.05],
      fill: [0.6, -0.3, 0.7],
      fillCol: [0.015, 0.03, 0.045],
      amb: [0.006, 0.006, 0.012],
      rimCol: [0.7, 0.9, 1.25],
      rim: 2.2,
      glow: 0.07,
      exposure: 1.15,
      pt: [end[0] + T[0] * 0.25, end[1] + T[1] * 0.25, end[2] + T[2] * 0.25],
      ptCol: [1.2, 1.8, 2.4],
    },
    frame: { fill: 0.9, bottom: 0.03 },
    arrays: { uB: B, uL, uLC },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_OVERLAY
#define HAS_BG

const vec3 HEAD = ${f3(end.slice(0, 3))};
const vec3 TG = ${f3(T)};
const float HR = ${end[3].toFixed(4)};
const vec3 TAILD = ${f3(tailD)};

/** 사슬 위의 매개변수 (0 밑동 ~ 1 끝), 축 위의 점, 접선 */
float cordT(vec3 p, out vec3 ap, out vec3 tg, out float rad) {
  float best = 1e5;
  float tt = 0.0;
  ap = uB[0].xyz;
  tg = vec3(0.0, 1.0, 0.0);
  rad = uB[0].w;
  for (int i = 0; i < 63; i++) {
    if (i + 1 >= uBN) break;
    vec3 a = uB[i].xyz;
    vec3 ba = uB[i + 1].xyz - a;
    float h = clamp(dot(p - a, ba) / dot(ba, ba), 0.0, 1.0);
    vec3 c = a + ba * h;
    float r = mix(uB[i].w, uB[i + 1].w, h);
    float dd = length(p - c) - r;
    if (dd < best) {
      best = dd;
      tt = (float(i) + h) / float(uBN - 1);
      ap = c;
      tg = normalize(ba);
      rad = r;
    }
  }
  return tt;
}

vec3 headLocal(vec3 p) {
  vec3 q = p - HEAD;
  vec3 s = normalize(cross(TG, vec3(0.0, 0.0, 1.0)));
  vec3 u = cross(s, TG);
  return vec3(dot(q, s), dot(q, u), dot(q, TG));
}

vec2 sdf(vec3 p) {
  float d = chains(p, 0.02);
  // 나선으로 꼬인 젤리 살 (밑동은 가늘게 풀어진다)
  if (d < 0.2) {
    vec3 ap;
    vec3 tg;
    float rad;
    float t = cordT(p, ap, tg, rad);
    vec3 nn = normalize(cross(tg, vec3(0.0, 0.0, 1.0)));
    vec3 bb = cross(tg, nn);
    vec3 rr = p - ap;
    float ang = atan(dot(rr, bb), dot(rr, nn));
    d -= 0.028 * pow(0.5 + 0.5 * sin(ang * 3.0 + t * 55.0), 2.0) * smoothstep(0.05, 0.2, t);
    d += 0.004 * (fbm3(p * 14.0) - 0.5);
  }
  // 잘린 끝: 세 핏줄 구멍
  vec3 h = headLocal(p);
  // 잘라 낼 부분은 머리 앞의 짧은 원기둥뿐 (반공간으로 자르면 몸통까지 사라진다)
  float cutter = max(max(0.02 + 0.015 * noise(p * 30.0) - h.z, length(h.xy) - HR * 1.8), h.z - 0.6);
  d = max(d, -cutter);
  float holes = 1e5;
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.094 + 0.4;
    vec2 c = vec2(cos(a), sin(a)) * HR * 0.45;
    float rr = HR * (i == 2 ? 0.28 : 0.2);
    holes = min(holes, max(length(h.xy - c) - rr, -(h.z + 0.25)));
  }
  d = max(d, -holes);
  vec2 r = vec2(d, 1.0);
  // 구멍 속 빛
  r = umin(r, vec2(max(max(holes + 0.004, -(h.z + 0.08)), h.z + 0.006), 2.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id > 1.5) return Mat(vec3(0.0), 1.0, 0.0, vec3(2.6, 3.2, 3.6), 0.0, 0.0, 0.0);
  vec3 ap;
  vec3 tg;
  float rad;
  float t = cordT(p, ap, tg, rad);
  vec3 nn = normalize(cross(tg, vec3(0.0, 0.0, 1.0)));
  vec3 bb = cross(tg, nn);
  vec3 rr = p - ap;
  float ang = atan(dot(rr, bb), dot(rr, nn));
  // 젤리 속 나선 핏줄 둘(동맥)과 굵은 하나(정맥)
  float wob = 0.3 * sin(t * 90.0 + ang);
  float v1 = smoothstep(0.82, 0.98, sin(ang * 2.0 - t * 48.0 + wob));
  float v2 = smoothstep(0.88, 0.99, sin(ang * 2.0 - t * 48.0 + 3.14 + wob));
  vec3 alb = vec3(0.085, 0.09, 0.11) * (0.7 + 0.6 * fbm3(p * 6.0));
  alb = mix(alb, vec3(0.05, 0.012, 0.025), v1 * 0.55);
  alb = mix(alb, vec3(0.03, 0.02, 0.06), v2 * 0.55);
  // 위로 갈수록 달아오른다 (핏줄 속이 먼저 빛난다), 밑동은 어둠에 묻힌다
  float heat = smoothstep(0.45, 1.0, t);
  vec3 V = normalize(uCamPos - p);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.0);
  // 젤리 속에 스민 희미한 별빛 (아래는 아주 옅게, 가장자리가 더 밝다)
  vec3 emi = vec3(0.25, 0.45, 0.7) * (0.02 + 0.2 * fres) * smoothstep(0.15, 0.7, t);
  emi += vec3(0.4, 0.7, 1.0) * (heat * heat * 0.6 + (v1 + v2) * heat * 0.8);
  vec3 h = headLocal(p);
  emi += vec3(0.7, 0.9, 1.0) * smoothstep(-0.3, 0.02, h.z) * smoothstep(0.5, 0.0, length(h)) * 0.6;
  float fade = smoothstep(0.0, 0.18, t);
  alb *= fade;
  return Mat(alb, 0.25, 0.9 * fade, emi, 0.12, 0.75, 0.8 * fade);
}

// 혜성 꼬리: 끝에서 뒤로 흐르는 빛 (사슬 마디마다 넓어지는 번짐) + 머리의 눈부신 빛
vec4 overlay(vec3 ro, vec3 rd, float tHit) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 63; i++) {
    if (i + 1 >= uBN) break;
    float f = float(i) / float(uBN - 2);
    if (f < 0.4) continue;
    vec3 a = uB[i].xyz;
    vec3 u = uB[i + 1].xyz - a;
    vec3 w0 = a - ro;
    float ub = dot(u, rd);
    float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
    float tc = ub * sc + dot(rd, w0);
    if (tc < 0.0) continue;
    float dd = length(w0 + u * sc - rd * tc);
    float g = smoothstep(0.4, 1.0, f);
    float w = 0.06 + 0.45 * g;
    float vis = tc < tHit + 0.3 ? 1.0 : 0.3;
    acc += vec3(0.45, 0.72, 1.0) * (exp(-dd / w) * 0.35 + exp(-dd / (w * 0.25)) * 0.4) * g * g * length(u) * vis;
  }
  // 혜성 꼬리: 머리에서 뒤로 넓게 퍼지는 빛 (가는 결이 진다)
  {
    vec3 a = HEAD;
    vec3 u = TAILD * 2.2;
    vec3 w0 = a - ro;
    float ub = dot(u, rd);
    float sc = clamp((ub * dot(rd, w0) - dot(u, w0)) / max(dot(u, u) - ub * ub, 1e-6), 0.0, 1.0);
    float tc = ub * sc + dot(rd, w0);
    vec3 pc = w0 + u * sc - rd * tc;
    float dd = length(pc);
    float w = 0.05 + 0.5 * sc;
    vec3 side = normalize(cross(TAILD, rd));
    float stri = 0.55 + 0.45 * noise(vec3(dot(pc, side) / w * 3.0, sc * 2.0, 7.0));
    float I = exp(-dd / w) * (1.0 - sc) * stri * 0.7 * smoothstep(0.0, 0.05, sc);
    acc += mix(vec3(0.85, 0.95, 1.0), vec3(0.35, 0.6, 1.0), sc) * I * (tc < tHit + 0.3 ? 1.0 : 0.3);
  }
  vec3 c = HEAD - ro;
  float along = dot(c, rd);
  vec3 o = c - rd * along;
  float dist = length(o);
  acc += vec3(0.8, 0.92, 1.0) * exp(-dist / 0.25) * 0.25 * (tHit < along - 0.2 ? 0.3 : 1.0);
  return vec4(acc, clamp(dot(acc, vec3(0.33)) * 1.3, 0.0, 1.0));
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 col = vec3(0.004, 0.003, 0.01);
  vec3 g = rd * 300.0;
  vec3 cell = floor(g);
  col += vec3(1.0, 0.95, 0.9) * step(0.996, hash31(cell)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.4 + 0.8 * hash31(cell + 3.0));
  col += vec3(0.06, 0.03, 0.12) * pow(fbm3(rd * 3.0), 3.0);
  return col;
}
`,
  };
}
