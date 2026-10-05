// 바다 무덤의 망령 (1층 균열 수호자) — 물에 잠긴 무덤에서 떠오른 익사한 여자의 망령.
// 물속에서처럼 위로 풀어져 떠도는 긴 머리칼, 뒤로 젖혀진 머리와 길게 찢어진 채 울부짖는 입,
// 텅 빈 눈과 입 속의 청록빛. 앙상한 두 팔을 앞으로 뻗고, 손목엔 끊어진 쇠사슬 수갑.
// 다리는 없다 — 해진 수의가 해파리처럼 긴 띠가 되어 아래로 흩어진다. 반쯤 비치는 창백한 살.
// (셰이더 컴파일이 무거워지지 않게 sdf 안에서는 해시 잡음·둥근 원뿔을 쓰지 않는다 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3, rng } from './k1-kit.js';

export default function wraith({ seed = 1 } = {}) {
  const R = rng(seed * 19 + 23);
  const head = [0.0, 2.02, 0.1];
  const sk = new Skel();
  // 물속처럼 위로 떠올라 한쪽으로 흘러가는 머리칼 (재질 5)
  sk.group(5, 0.014, 0.0, (s) => {
    for (let i = 0; i < 8; i++) {
      const a = -1.3 + (i / 7) * 2.6;
      const root = add(head, [Math.sin(a) * 0.08, 0.07 + Math.cos(a) * 0.03, -0.04 - Math.cos(a) * 0.04]);
      const L = 0.7 + R() * 0.4;
      const drift = -0.35 - R() * 0.25 + Math.sin(a) * 0.15;
      s.curve([
        root,
        add(root, [Math.sin(a) * 0.12, L * 0.3, -0.12]),
        add(root, [drift * 0.6 + Math.sin(a) * 0.1, L * 0.6, -0.2 + (R() - 0.5) * 0.15]),
        add(root, [drift, L * 0.62 + (R() - 0.5) * 0.2, -0.12 + (R() - 0.5) * 0.25]),
      ], 6, 0.022, 0.004, 0.6, (t) => [0, Math.sin(t * 9.0 + i * 1.7) * 0.03 * t, Math.cos(t * 8.0 + i) * 0.03 * t]);
    }
  });
  // 팔: 앞으로 뻗어 움켜쥐려 한다
  const shL = [-0.22, 1.72, 0.0];
  const elL = [-0.42, 1.55, 0.4];
  const wrL = [-0.36, 1.58, 0.85];
  const shR = [0.22, 1.72, 0.0];
  const elR = [0.46, 1.68, 0.36];
  const wrR = [0.42, 1.82, 0.78];
  sk.group(2, 0.03, 0.06, (s) => {
    s.chain([[...shL, 0.06], [...elL, 0.04], [...wrL, 0.03]]);
    s.chain([[...shR, 0.06], [...elR, 0.04], [...wrR, 0.03]]);
  });
  sk.group(2, 0.008, 0.01, (s) => {
    s.hand(add(wrL, [0.0, 0.0, 0.06]), [0.05, -0.15, 1.0], [0.0, 1.0, 0.15], { len: 0.22, curl: 0.7, r: 0.011, spread: 0.28, fingers: 3 });
    s.hand(add(wrR, [0.0, 0.01, 0.06]), [0.0, 0.1, 1.0], [0.0, 1.0, -0.1], { len: 0.22, curl: 0.8, r: 0.011, spread: 0.26, fingers: 3 });
  });
  // 수의 자락이 해파리처럼 늘어진 띠 (재질 1)
  sk.group(1, 0.02, 0.05, (s) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + R() * 0.3;
      const root = [Math.cos(a) * 0.24, 1.15, Math.sin(a) * 0.18];
      const L = 0.75 + R() * 0.35;
      const sw = (R() - 0.5) * 0.25;
      s.curve([root, add(root, [Math.cos(a) * 0.12, -L * 0.35, Math.sin(a) * 0.1]), add(root, [Math.cos(a) * 0.1 + sw, -L * 0.7, Math.sin(a) * 0.08]), add(root, [sw * 1.6, -L, 0.0])], 5, 0.06, 0.004, 0.6, (t) => [Math.sin(t * 6.0 + i * 2.1) * 0.1 * t, 0, Math.cos(t * 5.0 + i) * 0.08 * t]);
    }
  });
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [-0.5, 0.65, 6.0], target: [0.0, 1.25, 0.2], fov: 1.75 },
    light: { keyCol: [0.6, 1.0, 1.25], rimCol: [0.5, 1.0, 1.25], rim: 1.7, fillCol: [0.3, 0.3, 0.32], pt: [0.0, 1.6, 0.9], ptCol: [0.15, 0.5, 0.6], glow: 0.12 },
    arrays: {
      ...arr,
      uL: [
        [head[0] - 0.034, head[1] + 0.03, head[2] + 0.065, 0.012],
        [head[0] + 0.034, head[1] + 0.03, head[2] + 0.065, 0.012],
        [head[0], head[1] - 0.09, head[2] + 0.1, 0.03],
      ],
      uLC: [
        [0.5, 1.0, 1.0, 1.8],
        [0.5, 1.0, 1.0, 1.8],
        [0.5, 1.0, 1.0, 0.8],
      ],
    },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 36
#define VOLUME_FAR 14.0
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.0, 0.0, 0.2), vec3(0.0, 2.8, 0.0), 1.2);
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 몸통: 앙상한 가슴, 쇄골 ──
  float chest = sdEllipsoid(p - vec3(0.0, 1.58, 0.0), vec3(0.2, 0.24, 0.13));
  chest -= 0.008 * smoothstep(0.3, 0.9, sin(p.y * 50.0)) * smoothstep(0.04, 0.14, abs(p.x)) * step(1.42, p.y);
  float neck = sdCapsule(p, vec3(0.0, 1.72, 0.0), vec3(0.0, 1.92, 0.06), 0.045);
  vec2 r = vec2(smin(chest, neck, 0.06), 2.0);
  // ── 수의: 가슴 아래부터 허리까지 감싸고 아래로 퍼지며 찢어진다 ──
  float y = p.y;
  float ang = atan(p.z, p.x);
  float t = clamp((y - 1.05) / 0.45, 0.0, 1.0);
  float rad = mix(0.3, 0.17, t) + 0.03 * (1.0 - t) * sin(ang * 7.0 + y * 6.0);
  float dress = abs((length(p.xz * vec2(1.0, 1.2)) - rad) * 0.8) - 0.012;
  dress = max(dress, max(1.05 + 0.06 * sin(ang * 6.0) - y, y - 1.52));
  r = umin(r, vec2(dress, 1.0));
  // ── 머리: 뒤로 젖혀진 앙상한 얼굴, 아래로 길게 빠진 턱 ──
  vec3 h = p - HEAD;
  h.yz = rot(-0.35) * h.yz;
  float skull = sdEllipsoid(h - vec3(0.0, 0.03, -0.01), vec3(0.075, 0.1, 0.09));
  vec3 hs = vec3(abs(h.x), h.y, h.z);
  skull = smin(skull, sdEllipsoid(hs - vec3(0.045, -0.02, 0.05), vec3(0.03, 0.022, 0.03)), 0.02);
  float jaw = sdEllipsoid(h - vec3(0.0, -0.13, 0.03), vec3(0.045, 0.08, 0.05));
  skull = smin(skull, jaw, 0.035);
  float sock = sdEllipsoid(hs - vec3(0.034, 0.012, 0.07), vec3(0.022, 0.016, 0.03));
  float mouth = sdEllipsoid(h - vec3(0.0, -0.11, 0.065), vec3(0.022, 0.07, 0.035));
  skull = smax(skull, -min(sock, mouth), 0.012);
  skull -= 0.004 * smoothstep(0.02, 0.0, abs(hs.x - 0.055)) * step(h.y, 0.0);
  r = umin(r, vec2(skull, 2.0));
  r = umin(r, vec2(min(sdEllipsoid(hs - vec3(0.034, 0.012, 0.055), vec3(0.018, 0.013, 0.02)), sdEllipsoid(h - vec3(0.0, -0.11, 0.05), vec3(0.018, 0.062, 0.025))), 99.0));
  // 사슬 무리: 머리칼·팔·손·수의 띠·쇠사슬
  r = skel(p, r);
  return r;
}

// 몸을 감싼 희미한 청록빛 기운 (아래로 갈수록 짙게 흩어진다)
vec4 volume(vec3 p) {
  float dc = sdCapsule(p, vec3(0.0, 0.35, 0.1), vec3(0.0, 2.1, 0.05), 0.0);
  float w = 0.6 + 0.4 * sin(p.y * 7.0 + sin(p.x * 6.0) * 2.0) * sin(p.x * 5.0 - p.z * 4.0);
  float d = smoothstep(0.75, 0.08, dc) * w * mix(1.0, 0.45, smoothstep(0.6, 2.0, p.y));
  return vec4(vec3(0.18, 0.5, 0.6) * d * 0.55, d * 0.7);
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 바랜 수의: 물에 젖어 비친다, 아래로 갈수록 청록빛으로 흩어진다
    float fade = smoothstep(1.1, 0.1, p.y);
    float dirt = fbm3(p * vec3(5.0, 2.0, 5.0));
    vec3 alb = vec3(0.05, 0.065, 0.075) * (0.6 + 0.6 * dirt);
    return Mat(alb, 0.65, 0.25, vec3(0.03, 0.12, 0.15) * fade, 0.0, 0.4, 0.4);
  }
  if (id < 2.5) {
    // 창백하게 비치는 망자의 살갗: 푸른 핏줄, 속에서 희미한 청록빛
    float vein = smoothstep(0.07, 0.0, ridge(p * 6.0)) * smoothstep(0.35, 0.6, noise(p * 2.5));
    vec3 alb = mix(vec3(0.1, 0.13, 0.14), vec3(0.03, 0.06, 0.09), vein * 0.7);
    return Mat(alb, 0.4, 0.5, vec3(0.012, 0.04, 0.05), 0.0, 0.4, 0.4);
  }
  if (id < 3.5) {
    float rust = smoothstep(0.4, 0.75, fbm3(p * 12.0));
    return Mat(mix(vec3(0.05, 0.055, 0.06), vec3(0.09, 0.05, 0.03), rust), 0.6, 0.6, vec3(0.0), 0.0, 0.0, 0.5);
  }
  // 물속처럼 떠도는 검은 머리칼 (끝은 청록빛으로 풀린다)
  float tip = smoothstep(2.4, 2.9, p.y);
  return Mat(vec3(0.012, 0.016, 0.02), 0.35, 0.7, vec3(0.05, 0.25, 0.3) * tip, 0.1, 0.4, 0.6);
}
${KIT_MAIN}
`,
  };
}
