// 빠져나온 악령 (2층 하수인) — 빙의된 수도사의 입에서 기어 나온 검은 것. 깃들 몸이 없어 오래 버티지 못한다.
// 앙상한 검은 상체가 앞으로 기울어 긴 팔을 뻗는다. 해골 같은 얼굴은 비명처럼 길게 찢어진 입, 핏빛 바늘 같은 눈.
// 허리 아래는 검은 연기로 풀려 꼬리처럼 흘러내린다.
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;

export default function looseSpirit() {
  const head = [0.0, 1.32, 0.18];
  return {
    preset: 'act2',
    cam: { pos: [0.4, 1.05, 3.7], target: [0.0, 0.95, 0.0], fov: 1.85 },
    light: {
      key: [-0.4, 0.65, -0.75],
      rim: 1.6,
      rimCol: [1.0, 0.6, 0.55],
      fillCol: [0.1, 0.05, 0.03],
      pt: [head[0], head[1] - 0.1, head[2] + 0.12],
      ptCol: [0.7, 0.04, 0.06],
      exposure: 1.2,
      glow: 0.06,
    },
    frame: { fill: 0.92 },
    arrays: {
      uL: [
        [head[0] - 0.032, head[1] + 0.012, head[2] + 0.075, 0.004],
        [head[0] + 0.032, head[1] + 0.012, head[2] + 0.075, 0.004],
        [head[0], head[1] - 0.07, head[2] + 0.06, 0.008],
      ],
      uLC: [
        [1.0, 0.1, 0.12, 1.6],
        [1.0, 0.1, 0.12, 1.6],
        [1.0, 0.08, 0.1, 0.5],
      ],
    },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 150
#define VOLUME_FAR 10.0
#define HAS_BG

const vec3 HEAD = ${v3(head)};

float claw(vec3 p, vec3 w, vec3 f, vec3 u, float s, float curl) {
  float bd = length(p - w);
  if (bd > 0.35 * s) return bd - 0.26 * s;
  f = normalize(f);
  u = normalize(u - f * dot(u, f));
  vec3 sd = cross(f, u);
  vec3 pc = w + f * 0.045 * s;
  vec3 q = p - pc;
  float d = sdEllipsoid(vec3(dot(q, sd), dot(q, u), dot(q, f)), vec3(0.04, 0.012, 0.05) * s);
  for (int i = 0; i < 4; i++) {
    float fi = float(i) - 1.5;
    vec3 a = pc + f * 0.04 * s + sd * fi * 0.02 * s;
    vec3 dd = normalize(f + sd * fi * 0.3);
    float len = 0.075 * s;
    float r = 0.009 * s;
    for (int k = 0; k < 3; k++) {
      vec3 b = a + dd * len;
      d = smin(d, sdRoundCone(p, a, b, r, r * 0.75), 0.004 * s);
      a = b;
      r *= 0.75;
      len *= 0.9;
      dd = normalize(dd - u * curl);
    }
  }
  return d;
}

vec2 sdf(vec3 p) {
  float bound = length(p - vec3(0.0, 1.0, 0.1)) - 0.85;
  if (bound > 0.2) return vec2(bound, 1.0);
  // ── 앙상한 상체: 갈비뼈가 드러난 가슴, 꼬리로 가늘어진다
  float chest = sdEllipsoid(p - vec3(0.0, 1.1, 0.04), vec3(0.13, 0.13, 0.09));
  float rib = 0.5 + 0.5 * cos(p.y * 110.0);
  chest -= 0.006 * rib * smoothstep(0.04, 0.09, abs(p.x)) * smoothstep(0.95, 1.02, p.y) * smoothstep(1.2, 1.12, p.y);
  float spine = sdRoundCone(p, vec3(0.0, 1.1, 0.0), vec3(0.0, 0.85, -0.04), 0.07, 0.045);
  spine = smin(spine, sdRoundCone(p, vec3(0.0, 0.85, -0.04), vec3(0.06, 0.6, -0.1), 0.045, 0.02), 0.04);
  spine = smin(spine, sdRoundCone(p, vec3(0.06, 0.6, -0.1), vec3(0.0, 0.38, -0.2), 0.02, 0.002), 0.03);
  float body = smin(chest, spine, 0.06);
  // 어깨·팔: 지나치게 길다, 앞으로 뻗었다
  float arms = 1e5;
  for (int s = 0; s < 2; s++) {
    float sx = s == 0 ? -1.0 : 1.0;
    vec3 sh = vec3(sx * 0.13, 1.18, 0.02);
    vec3 el = vec3(sx * 0.3, 1.05, 0.2);
    vec3 wr = vec3(sx * 0.26, 1.08, 0.48 + (s == 0 ? 0.0 : -0.06));
    float a = sdRoundCone(p, sh, el, 0.04, 0.022);
    a = smin(a, sdRoundCone(p, el, wr, 0.022, 0.015), 0.015);
    a = smin(a, claw(p, wr, normalize(wr - el) + vec3(0.0, 0.1, 0.0), vec3(0.0, 1.0, 0.0), 1.15, 0.3), 0.01);
    arms = min(arms, a);
  }
  body = smin(body, arms, 0.04);
  body = smin(body, sdRoundCone(p, vec3(0.0, 1.18, 0.04), HEAD + vec3(0.0, -0.08, -0.04), 0.04, 0.035), 0.03);
  // ── 머리: 해골 같고, 입이 비명처럼 길게 찢어졌다
  vec3 hq = p - HEAD;
  hq.yz = rot(-0.15) * hq.yz;
  float skull = sdEllipsoid(hq - vec3(0.0, 0.02, -0.01), vec3(0.07, 0.085, 0.08));
  vec3 ha = vec3(abs(hq.x), hq.y, hq.z);
  skull = smax(skull, -sdEllipsoid(ha - vec3(0.03, 0.012, 0.07), vec3(0.022, 0.018, 0.02)), 0.01);
  skull = smin(skull, sdEllipsoid(ha - vec3(0.045, -0.015, 0.05), vec3(0.02, 0.014, 0.02)), 0.012);
  float jaw = sdEllipsoid(hq - vec3(0.0, -0.1, 0.035), vec3(0.045, 0.06, 0.045));
  skull = smin(skull, jaw, 0.03);
  float mouth = sdEllipsoid(hq - vec3(0.0, -0.075, 0.065), vec3(0.026, 0.065, 0.04));
  skull = smax(skull, -mouth, 0.008);
  body = smin(body, skull, 0.02);
  body += 0.003 * (fbm3(p * 30.0) - 0.5);
  vec2 r = vec2(body, 1.0);
  r = umin(r, vec2(sdEllipsoid(hq - vec3(0.0, -0.075, 0.045), vec3(0.02, 0.055, 0.03)), 99.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  // 검은 그을음 같은 살갗: 빛을 거의 먹고, 가장자리만 기름처럼 번들거린다
  float n1 = fbm3(p * 20.0);
  vec3 alb = vec3(0.018, 0.014, 0.016) * (0.6 + 0.8 * n1);
  float vein = smoothstep(0.03, 0.0, ridge(p * 18.0)) * smoothstep(0.55, 0.75, fbm3(p * 4.0));
  vec3 emi = vec3(0.25, 0.005, 0.015) * vein * 0.25;
  return Mat(alb, 0.35, 0.9, emi, 0.4, 0.0, 0.3);
}

vec3 background(vec3 rd) {
  if (uScene == 0) return vec3(0.0);
  vec3 L1 = normalize(uKeyDir);
  vec3 bg = mix(vec3(0.0), uFogCol * 0.5, smoothstep(-0.3, 0.6, rd.y)) * 0.6;
  bg += uFogCol * 0.9 * pow(max(dot(rd, normalize(vec3(-L1.x, L1.y * 0.25, -L1.z))), 0.0), 5.0);
  return bg;
}

// 몸을 감싸고 아래로 흘러 꼬리가 되는 검은 연기 + 머리와 어깨를 덮은 연기 수의
vec4 volume(vec3 p) {
  if (p.y < 0.1 || p.y > 1.6 || abs(p.x) > 0.8 || abs(p.z) > 0.8) return vec4(0.0);
  float h = 1.3 - p.y;
  float s = clamp(h, 0.0, 1.2);
  vec2 c = vec2(0.03 * sin(s * 5.0) + 0.05 * s, -0.03 - 0.18 * s * s);
  float rad = mix(0.2, 0.06, smoothstep(0.25, 1.1, s)) + 0.03 * sin(s * 7.0);
  vec3 w = p * 5.0 + vec3(0.0, s * 2.0, 0.0);
  vec3 warp = vec3(fbm3(w), fbm3(w + 3.1), fbm3(w + 7.7)) - 0.5;
  vec3 pw = p + warp * 0.18;
  float dc = length(pw.xz - c) / rad;
  float tend = 1.0 - smoothstep(0.0, 0.3, ridge(pw * vec3(9.0, 4.0, 9.0)));
  float tail = smoothstep(1.0, 0.25, dc) * (0.35 + 0.9 * tend) * smoothstep(0.05, 0.3, h) * smoothstep(1.15, 0.7, s);
  float shell = length((pw - vec3(0.0, 1.2, 0.02)) * vec3(1.0, 0.85, 1.15)) - 0.2;
  float shroud = smoothstep(0.08, 0.0, abs(shell)) * smoothstep(0.35, 0.7, fbm3(pw * 7.0)) * smoothstep(0.95, 1.15, p.y) * step(p.z, 0.12);
  float dens = tail * 11.0 + shroud * 7.0;
  if (dens < 0.001) return vec4(0.0);
  float lit = 0.4 + 0.6 * tend;
  vec3 col = vec3(0.03, 0.026, 0.028) + vec3(0.075, 0.07, 0.07) * lit * smoothstep(0.2, 1.0, s + shroud) + vec3(0.1, 0.004, 0.008) * smoothstep(0.25, 0.0, abs(s - 0.2)) * tend * 0.5;
  if (uScene == 0) col *= 1.3;
  return vec4(col, dens);
}
`,
  };
}
