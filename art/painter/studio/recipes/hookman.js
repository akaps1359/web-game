// 갈고리꾼 (1층) — 깡마르고 키 큰 하역꾼이 상체를 앞으로 기울인 채 성큼 다가온다. 머리엔 눈구멍을 찢어 뚫고
// 입을 거칠게 꿰맨 마대 자루를 뒤집어써 목을 밧줄로 묶었고, 자루 끝은 옆으로 무겁게 처졌다.
// 잘린 오른손 자리엔 쇠 소켓으로 박은 거대한 하역 갈고리 — 머리 위로 치켜들어 내려찍을 참이다.
// 늘어뜨린 왼손엔 땅까지 끌리는 쇠사슬, 몸 앞엔 피가 말라붙은 무거운 가죽 앞치마.
import { rng } from '../../lib.js';

const HIP = 0.93;
/** 상체 기울기: 엉덩이 위로 갈수록 앞(+z)으로 */
const lean = (y) => {
  const h = Math.max(y - HIP, 0);
  return 0.36 * h + 0.25 * h * h;
};
const at = (x, y, z) => [x, y, z + lean(y)];

export default function hookman({ seed = 1 } = {}) {
  const R = rng(seed * 313 + 1);
  const head = [0.0, 1.66, 0.52];
  const hand = [-0.32, 0.9, 0.42];
  const shR = at(0.2, 1.5, 0.0);
  const shL = at(-0.2, 1.48, 0.0);
  const elR = [0.44, 1.78, 0.2];
  const wrR = [0.38, 2.07, 0.24];
  const elL = [-0.31, 1.17, 0.33];
  // 쇠사슬: 왼손에서 늘어져 땅에 사리를 튼다
  const links = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let x;
    let y;
    let z;
    if (t < 0.6) {
      const u = t / 0.6;
      x = hand[0] - 0.08 * u + 0.025 * Math.sin(u * 3);
      y = (hand[1] - 0.06) * (1 - u) + 0.022 * u;
      z = hand[2] + 0.18 * u * u;
    } else {
      const u = (t - 0.6) / 0.4;
      const a = u * Math.PI * 1.5;
      x = hand[0] - 0.08 - 0.13 * Math.sin(a);
      y = 0.022 + R() * 0.004;
      z = hand[2] + 0.18 + 0.13 * (1 - Math.cos(a));
    }
    links.push([x, y, z, i % 2]);
  }
  const v = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
  return {
    preset: 'act1',
    cam: { pos: [2.3, 0.62, 4.4], target: [0.05, 1.12, 0.15], fov: 1.8 },
    light: { rim: 2.2, fillCol: [0.22, 0.14, 0.075], amb: [0.022, 0.03, 0.032] },
    frame: { fill: 0.93 },
    arrays: {
      uB: links,
      uL: [
        [head[0] - 0.055, head[1] - 0.012, head[2] + 0.1, 0.0065],
        [head[0] + 0.058, head[1] - 0.03, head[2] + 0.1, 0.0055],
      ],
      uLC: [
        [0.9, 0.95, 0.65, 1.1],
        [0.9, 0.95, 0.65, 0.9],
      ],
    },
    glsl: /* glsl */ `
const vec3 HEAD = ${v(head)};
const vec3 HAND = ${v(hand)};
const vec3 SH_R = ${v(shR)};
const vec3 EL_R = ${v(elR)};
const vec3 WR_R = ${v(wrR)};
const vec3 SH_L = ${v(shL)};
const vec3 EL_L = ${v(elL)};
const float HIP = ${HIP};

float lean(float y) { float h = max(y - HIP, 0.0); return 0.36 * h + 0.25 * h * h; }

/** 하역 갈고리: o = 손목, 굽은 쪽 u, 위 v */
float cargoHook(vec3 p, vec3 o, vec3 u, vec3 v) {
  vec3 w = cross(u, v);
  vec3 q = p - o;
  vec3 l = vec3(dot(q, u), dot(q, v), dot(q, w));
  float d = sdCappedCone(l - vec3(0.0, -0.06, 0.0), 0.07, 0.048, 0.034);
  d = min(d, sdCapsule(l, vec3(0.0, 0.0, 0.0), vec3(0.0, 0.2, 0.0), 0.026));
  vec2 c = vec2(0.115, 0.2);
  float rr = 0.115;
  vec2 lc = l.xy - c;
  float a = atan(lc.y, lc.x);
  float t = clamp((3.14159 - a) / 4.3, 0.0, 1.0);
  float thick = mix(0.028, 0.003, pow(t, 1.3));
  float arc = length(vec2(length(lc) - rr, l.z * 1.25)) - thick;
  vec2 tip = c + rr * vec2(cos(-1.16), sin(-1.16));
  float tipD = length(vec3(l.xy - tip, l.z)) - 0.003;
  arc = (a > -1.16) ? arc : tipD;
  return min(d, arc);
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  b.z -= lean(b.y);
  // ── 마른 몸통 (넝마 속옷)
  float body = sdEllipsoid(b - vec3(0.0, 1.36, 0.0), vec3(0.2, 0.18, 0.13));
  body = smin(body, sdEllipsoid(b - vec3(0.0, 1.11, 0.0), vec3(0.16, 0.17, 0.115)), 0.09);
  body = smin(body, sdEllipsoid(p - vec3(0.0, 0.96, -0.01), vec3(0.165, 0.11, 0.12)), 0.08);
  body = smin(body, sdSphere(b - vec3(-0.19, 1.48, 0.0), 0.068), 0.06);
  body = smin(body, sdSphere(b - vec3(0.19, 1.5, 0.0), 0.068), 0.06);
  // 굽은 등의 등뼈
  for (int i = 0; i < 6; i++) {
    float y = 1.12 + float(i) * 0.075;
    body = smin(body, sdSphere(b - vec3(0.0, y, -0.12 + 0.02 * float(i) * 0.0), 0.022), 0.03);
  }
  if (body < 0.04) body += 0.006 * (fbm3(p * 16.0) - 0.5);
  vec2 r = vec2(body, 8.0);

  // ── 맨팔: 길고 힘줄이 선다
  float arms = sdRoundCone(p, SH_R, EL_R, 0.062, 0.044);
  arms = min(arms, sdRoundCone(p, EL_R, WR_R - normalize(WR_R - EL_R) * 0.06, 0.046, 0.036));
  arms = min(arms, sdRoundCone(p, SH_L, EL_L, 0.062, 0.044));
  arms = min(arms, sdRoundCone(p, EL_L, HAND + vec3(0.0, 0.07, -0.02), 0.046, 0.032));
  arms = smin(arms, sdSphere(p - EL_R, 0.046), 0.02);
  arms = smin(arms, sdSphere(p - EL_L, 0.046), 0.02);
  float neck = sdRoundCone(p, vec3(0.0, 1.5, lean(1.5) + 0.03), HEAD + vec3(0.0, -0.12, -0.08), 0.062, 0.052);
  arms = min(arms, neck);
  if (arms < 0.03) arms += 0.004 * (fbm3(p * 22.0) - 0.5) - 0.004 * smoothstep(0.07, 0.0, ridge(p * vec3(9.0, 3.0, 9.0)));
  r = umin(r, vec2(smin(arms, r.x + 0.01, 0.04), 2.0));
  // 왼손: 사슬을 감아쥔 마른 손
  float hand = sdEllipsoid(p - HAND, vec3(0.042, 0.058, 0.044));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.019;
    hand = smin(hand, sdRoundCone(p, HAND + vec3(0.02, -0.02, o), HAND + vec3(0.036, -0.075, o * 1.2), 0.011, 0.008), 0.01);
  }
  r = umin(r, vec2(hand, 2.0));

  // ── 다리: 왼발을 앞으로 내딛고, 오른발은 뒤에서 땅을 민다
  vec3 knL = vec3(-0.12, 0.52, 0.2);
  vec3 anL = vec3(-0.14, 0.11, 0.13);
  vec3 knR = vec3(0.13, 0.5, -0.12);
  vec3 anR = vec3(0.16, 0.14, -0.33);
  float legs = min(sdRoundCone(p, vec3(-0.095, 0.93, 0.0), knL, 0.09, 0.068), sdRoundCone(p, knL, anL, 0.068, 0.055));
  legs = min(legs, min(sdRoundCone(p, vec3(0.1, 0.93, -0.02), knR, 0.09, 0.068), sdRoundCone(p, knR, anR, 0.068, 0.055)));
  if (legs < 0.03) legs += 0.007 * (noise(p * vec3(12.0, 30.0, 12.0)) - 0.5);
  r = umin(r, vec2(legs, 4.0));
  float boots = sdRoundBox(p - vec3(-0.14, 0.055, 0.19), vec3(0.055, 0.055, 0.12), 0.042);
  boots = smin(boots, sdCappedCone(p - anL - vec3(0.0, 0.04, 0.0), 0.08, 0.06, 0.058), 0.03);
  // 뒷발: 뒤꿈치를 들고 발끝으로 땅을 민다
  vec3 fq = p - vec3(0.17, 0.08, -0.26);
  fq.yz = rot(-0.6) * fq.yz;
  boots = min(boots, sdRoundBox(fq, vec3(0.055, 0.05, 0.12), 0.042));
  boots = smin(boots, sdCappedCone(p - anR - vec3(0.0, 0.03, 0.0), 0.07, 0.06, 0.058), 0.03);
  r = umin(r, vec2(boots, 7.0));

  // ── 가죽 앞치마: 가슴 받이는 몸에 붙고, 허리 아래는 수직으로 늘어진다
  float apron;
  {
    // 가슴 받이 (몸을 따라 기운다)
    vec3 aq = b - vec3(0.0, 0.0, 0.0);
    float shellU = length(aq.xz * vec2(1.0, 1.2)) - (0.175 + 0.02 * smoothstep(1.4, 1.0, aq.y));
    float bib = abs(shellU) - 0.009;
    bib = max(bib, abs(aq.x) - mix(0.17, 0.11, smoothstep(1.12, 1.3, aq.y)));
    bib = max(bib, -aq.z + 0.03);
    bib = max(bib, max(0.95 - aq.y, aq.y - 1.42));
    // 치마 (허리에서 수직으로 늘어져 다리 앞을 가린다)
    vec3 sq = p - vec3(0.0, 0.0, lean(0.98) + 0.03);
    float sk = abs(sq.z - 0.13 - 0.04 * (sq.x * sq.x) * 10.0 + 0.08 * smoothstep(0.95, 0.4, sq.y)) - 0.009;
    sk = max(sk, abs(sq.x) - (0.19 + 0.02 * smoothstep(0.9, 0.4, sq.y)));
    float hemA = 0.4 + 0.05 * fbm3(vec3(sq.x * 9.0, 0.0, 1.0));
    sk = max(sk, max(hemA - sq.y, sq.y - 1.0));
    apron = min(bib, sk);
    if (apron < 0.03) apron += 0.006 * (fbm3(p * vec3(8.0, 3.0, 8.0)) - 0.5);
  }
  float straps = sdCapsule(p, vec3(-0.1, 1.4, lean(1.4) + 0.14), vec3(-0.06, 1.55, lean(1.55) + 0.02), 0.011);
  straps = min(straps, sdCapsule(p, vec3(0.1, 1.4, lean(1.4) + 0.14), vec3(0.06, 1.55, lean(1.55) + 0.02), 0.011));
  r = umin(r, vec2(min(apron, straps), 5.0));

  // ── 마대 자루 두건: 울퉁불퉁하고 위가 무겁게 옆으로 처졌다. 목은 밧줄로 졸라 주름이 모였다
  vec3 hq = p - HEAD;
  float hb = length(hq) - 0.38;
  if (hb < 0.02) {
    hq.yz = rot(0.25) * hq.yz;
    float sack = sdEllipsoid(hq - vec3(0.0, 0.03, -0.02), vec3(0.15, 0.175, 0.15));
    sack = smin(sack, sdEllipsoid(hq - vec3(-0.07, 0.09, -0.02), vec3(0.08, 0.07, 0.09)), 0.05);
    float gather = smoothstep(-0.03, -0.13, hq.y);
    float ang = atan(hq.z, hq.x);
    sack += gather * (0.035 + 0.01 * sin(ang * 11.0 + 2.0 * noise(hq * 20.0)));
    // 자루 위쪽 모서리 둘이 머리 옆으로 축 처졌다
    sack = smin(sack, sdRoundCone(vec3(abs(hq.x), hq.yz), vec3(0.1, 0.12, -0.04), vec3(0.17, 0.02, -0.07), 0.05, 0.022), 0.05);
    if (sack < 0.06) {
      // 구겨진 주름: 밧줄 쪽으로 모이는 골
      float wr = ridge(vec3(ang * 2.2, hq.y * 9.0, 1.0) + 0.6 * noise(hq * 6.0));
      sack += 0.028 * (fbm3(hq * 5.0) - 0.5) - 0.012 * smoothstep(0.25, 0.0, wr) * smoothstep(0.12, -0.1, hq.y) + 0.004 * (noise(hq * 45.0) - 0.5);
    }
    vec3 sq = hq - vec3(0.0, -0.14, -0.02);
    float sr = 0.075 + 0.5 * max(-sq.y, 0.0);
    float skirt = abs(length(sq.xz * vec2(1.0, 1.1)) - sr) - 0.007;
    skirt = max(skirt, sq.y);
    skirt = max(skirt, -sq.y - 0.07 - 0.03 * noise(vec3(ang * 3.0, 0.0, 2.0)));
    sack = min(sack, skirt);
    vec3 h1 = hq - vec3(-0.055, 0.018, 0.13);
    h1.xy = rot(0.35) * h1.xy;
    float holes = min(sdEllipsoid(h1, vec3(0.05, 0.03, 0.08)), sdEllipsoid(hq - vec3(0.058, -0.01, 0.13), vec3(0.034, 0.045, 0.08)));
    holes += 0.016 * (noise(hq * 60.0) - 0.5);
    sack = smax(sack, -holes, 0.004);
    r = umin(r, vec2(sack, 1.0));
    r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, 0.0, 0.03), vec3(0.1, 0.12, 0.08)), 99.0));
    float rope = sdTorus(hq - vec3(0.0, -0.14, -0.01), vec2(0.066, 0.014));
    rope = min(rope, sdRoundCone(hq, vec3(0.055, -0.15, 0.035), vec3(0.075, -0.28, 0.07), 0.012, 0.009));
    rope = min(rope, sdRoundCone(hq, vec3(0.045, -0.15, 0.045), vec3(0.035, -0.25, 0.09), 0.011, 0.008));
    r = umin(r, vec2(rope, 6.0));
  } else {
    r = umin(r, vec2(hb + 0.1, 1.0));
  }

  // ── 갈고리 (오른손 자리)
  vec3 hv = normalize(WR_R - EL_R);
  vec3 hu = normalize(vec3(-0.45, 0.0, 0.9));
  hu = normalize(hu - hv * dot(hu, hv));
  float hbound = length(p - WR_R - hv * 0.12) - 0.3;
  if (hbound < 0.02) {
    r = umin(r, vec2(cargoHook(p, WR_R, hu, hv), 3.0));
    float cuff = sdCapsule(p, WR_R - hv * 0.17, WR_R - hv * 0.06, 0.048);
    cuff = max(cuff, -(abs(fract(dot(p - WR_R, hv) * 22.0) - 0.5) - 0.32));
    r = umin(r, vec2(cuff, 5.0));
  } else {
    r = umin(r, vec2(hbound + 0.05, 3.0));
  }

  // ── 쇠사슬
  if (sdBox(p - vec3(-0.45, 0.47, 0.55), vec3(0.35, 0.5, 0.38)) < 0.05) {
    float ch = 1e5;
    for (int i = 0; i < 21; i++) {
      if (i + 1 >= uBN) break;
      vec3 a = uB[i].xyz;
      vec3 c = uB[i + 1].xyz;
      vec3 m = (a + c) * 0.5;
      vec3 ax = normalize(c - a);
      vec3 sd = normalize(cross(ax, uB[i].w > 0.5 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
      vec3 q = p - m;
      vec3 l = vec3(dot(q, sd), dot(q, ax), dot(q, cross(ax, sd)));
      float half_ = length(c - a) * 0.5;
      vec2 st = vec2(l.x, max(abs(l.y) - half_ * 0.55, 0.0));
      ch = min(ch, length(vec2(length(st) - 0.022, l.z)) - 0.007);
    }
    r = umin(r, vec2(ch, 3.0));
  }
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 젖은 마대: 성긴 올, 얼룩 / 거칠게 꿰맨 입: 검은 실밥과 배어 나온 피
    float weave = 0.72 + 0.28 * abs(sin(p.x * 420.0) * sin(p.y * 420.0));
    float stain = smoothstep(0.45, 0.7, fbm3(p * 7.0));
    vec3 alb = mix(vec3(0.12, 0.095, 0.06), vec3(0.04, 0.012, 0.008), stain * 0.85) * weave;
    vec3 hq = p - HEAD;
    hq.yz = rot(0.25) * hq.yz;
    float my = hq.y + 0.07 + 0.012 * sin(hq.x * 30.0);
    float line = smoothstep(0.006, 0.002, abs(my)) * smoothstep(0.075, 0.05, abs(hq.x)) * step(0.0, hq.z);
    float st = smoothstep(0.004, 0.001, abs(fract(hq.x * 45.0) - 0.5) / 45.0) * smoothstep(0.022, 0.012, abs(my)) * smoothstep(0.075, 0.05, abs(hq.x)) * step(0.0, hq.z);
    float bleed = smoothstep(0.06, 0.0, abs(my) + abs(hq.x) * 0.3) * step(0.0, hq.z) * smoothstep(0.3, 0.6, fbm3(p * 30.0));
    alb = mix(alb, vec3(0.05, 0.006, 0.005), bleed * 0.8);
    alb = mix(alb, vec3(0.006), max(line, st));
    return Mat(alb, 0.95, 0.06, vec3(0.0), 0.0, 0.1, 0.15 + bleed * 0.5);
  }
  if (id < 2.5) {
    float v = smoothstep(0.08, 0.0, ridge(p * 10.0)) * 0.5;
    vec3 alb = mix(vec3(0.085, 0.08, 0.072), vec3(0.04, 0.035, 0.035), v) * (0.7 + 0.45 * fbm3(p * 7.0));
    return Mat(alb, 0.55, 0.35, vec3(0.0), 0.0, 0.35, 0.25);
  }
  if (id < 3.5) {
    float rust = fbm3(p * 16.0);
    float bare = smoothstep(0.6, 0.7, noise(p * 25.0));
    vec3 alb = mix(vec3(0.035, 0.022, 0.016), vec3(0.075, 0.035, 0.018), rust);
    alb = mix(alb, vec3(0.085, 0.085, 0.09), bare);
    return Mat(alb, mix(0.65, 0.22, bare), mix(0.45, 1.5, bare), vec3(0.0), 0.0, 0.0, 0.3);
  }
  if (id < 4.5) return Mat(vec3(0.025, 0.024, 0.022) * (0.7 + 0.6 * fbm3(p * 6.0)), 0.9, 0.08, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 5.5) {
    float blood = smoothstep(0.42, 0.62, fbm3(p * 6.0 + 2.0)) * smoothstep(1.5, 0.5, p.y);
    float scuff = smoothstep(0.55, 0.75, noise(p * 30.0));
    vec3 alb = mix(vec3(0.04, 0.026, 0.017), vec3(0.045, 0.006, 0.005), blood) * (0.85 + 0.3 * scuff);
    return Mat(alb, mix(0.5, 0.22, blood), mix(0.5, 1.2, blood), vec3(0.0), 0.0, 0.0, blood * 0.75);
  }
  if (id < 6.5) return Mat(vec3(0.06, 0.05, 0.035), 0.9, 0.1, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 7.5) return Mat(vec3(0.018, 0.015, 0.012), 0.35, 0.8, vec3(0.0), 0.0, 0.0, 0.6);
  return Mat(vec3(0.045, 0.043, 0.038) * (0.6 + 0.6 * fbm3(p * 9.0)), 0.9, 0.08, vec3(0.0), 0.0, 0.1, 0.15);
}
`,
  };
}
