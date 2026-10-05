// 안개 속 사냥꾼 (1층 추적자) — 안개 속에서만 모습을 드러내는 길쭉한 사냥꾼.
// 창백하고 반쯤 비치는 앙상한 몸이 짐승처럼 웅크렸다. 눈 없는 길쭉한 머리에서 턱이 아래로 늘어지고,
// 움푹 꺼진 눈자리 깊은 곳에 바늘 끝 같은 흰빛. 무릎까지 닿는 긴 팔 끝엔 칼날 같은 손가락.
// 어깨에 걸친 수의는 찢어진 띠가 되어 늘어지고, 다리는 아래로 갈수록 안개처럼 풀려 사라진다.
// (셰이더 컴파일이 무거워지지 않게 sdf 안에서는 해시 잡음·둥근 원뿔을 쓰지 않는다 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3, rng } from './k1-kit.js';

export default function fogstalker({ seed = 1 } = {}) {
  const R = rng(seed * 37 + 11);
  const head = [0.02, 1.62, 0.78];
  const sk = new Skel();
  // 등뼈: 엉덩이에서 굽은 등을 지나 앞으로 뻗은 목까지
  sk.group(2, 0.06, 0.1, (s) => {
    s.curve([[0.0, 0.95, -0.1], [0.0, 1.45, -0.12], [0.0, 1.75, 0.25], add(head, [0.0, -0.04, -0.14])], 8, 0.13, 0.05, 0.9);
  });
  // 팔: 앞으로 뻗은 왼팔, 치켜든 오른팔 (가늘고 길다)
  const shL = [-0.26, 1.62, 0.22];
  const elL = [-0.55, 1.2, 0.62];
  const wrL = [-0.42, 0.98, 1.18];
  const shR = [0.26, 1.64, 0.2];
  const elR = [0.72, 1.86, 0.2];
  const wrR = [0.92, 2.15, 0.5];
  sk.group(2, 0.03, 0.06, (s) => {
    s.chain([[...shL, 0.065], [...lerp3(shL, elL, 0.5), 0.05], [...elL, 0.04], [...lerp3(elL, wrL, 0.5), 0.038], [...wrL, 0.03]]);
    s.chain([[...shR, 0.065], [...lerp3(shR, elR, 0.5), 0.05], [...elR, 0.04], [...lerp3(elR, wrR, 0.5), 0.038], [...wrR, 0.03]]);
  });
  // 칼날 손가락
  sk.group(2, 0.008, 0.01, (s) => {
    s.hand(add(wrL, [0.0, -0.02, 0.06]), [0.05, -0.35, 1.0], [0.0, 1.0, 0.35], { len: 0.42, curl: 0.5, r: 0.012, spread: 0.2, palm: 0.6, thumb: 0.8 });
    s.hand(add(wrR, [0.03, 0.05, 0.05]), [0.25, 0.6, 0.8], [-0.3, 0.6, -0.7], { len: 0.42, curl: 0.65, r: 0.012, spread: 0.22, palm: 0.6, thumb: 0.8 });
  });
  // 다리: 웅크려 접힌 다리가 아래로 갈수록 가늘게 풀린다 (재질 3: 흩어지는 살)
  sk.group(3, 0.04, 0.08, (s) => {
    s.chain([[-0.16, 0.95, -0.05, 0.09], [-0.3, 0.62, 0.42, 0.06], [-0.26, 0.3, 0.05, 0.035], [-0.3, 0.02, 0.25, 0.008]]);
    s.chain([[0.16, 0.95, -0.05, 0.09], [0.34, 0.58, 0.32, 0.06], [0.3, 0.26, -0.05, 0.035], [0.36, 0.02, 0.12, 0.008]]);
  });
  // 수의의 찢어진 띠 (재질 1)
  sk.group(1, 0.01, 0.0, (s) => {
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.1 + (i / 8) * 0.8);
      const root = [Math.cos(a) * 0.3, 1.42 + R() * 0.12, -Math.sin(a) * 0.22 + 0.02];
      const L = 0.75 + R() * 0.6;
      const sw = (R() - 0.5) * 0.12;
      s.curve([root, add(root, [sw * 0.3, -L * 0.35, -0.04]), add(root, [sw, -L * 0.7, -0.08]), add(root, [sw * 1.5, -L, -0.06])], 4, 0.045, 0.012, 0.6);
    }
  });
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [-1.3, 0.45, 5.4], target: [0.05, 1.12, 0.35], fov: 1.72 },
    light: { keyCol: [0.85, 1.1, 1.25], rimCol: [0.75, 0.95, 1.15], rim: 1.6, fillCol: [0.16, 0.2, 0.24], pt: [0.0, 1.3, 1.6], ptCol: [0.12, 0.16, 0.2] },
    arrays: {
      ...arr,
      uL: [
        [head[0] - 0.062, head[1] - 0.02, head[2] + 0.06, 0.006],
        [head[0] + 0.062, head[1] - 0.02, head[2] + 0.06, 0.006],
      ],
      uLC: [
        [0.85, 0.95, 1.0, 2.0],
        [0.85, 0.95, 1.0, 2.0],
      ],
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 40
#define VOLUME_FAR 14.0
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.1, 0.0, 0.4), vec3(0.2, 2.2, 0.4), 1.15);
  if (bound > 0.3) return vec2(bound, 2.0);
  // ── 앙상한 가슴: 갈비뼈가 물결처럼 드러난다 ──
  vec3 c = p - vec3(0.0, 1.5, 0.12);
  c.yz = rot(-0.6) * c.yz;
  float chest = sdEllipsoid(c, vec3(0.22, 0.28, 0.15));
  chest -= 0.012 * smoothstep(0.2, 0.9, sin(c.y * 48.0)) * smoothstep(0.05, 0.18, abs(c.x));
  float pelvis = sdEllipsoid(p - vec3(0.0, 0.98, -0.06), vec3(0.17, 0.11, 0.12));
  vec2 r = vec2(smin(chest, pelvis, 0.15), 2.0);
  // ── 머리: 눈 없이 길쭉한 두개골이 아래로 숙였고, 턱이 길게 늘어졌다 ──
  vec3 h = p - HEAD;
  h.yz = rot(0.75) * h.yz;
  float skull = sdEllipsoid(h - vec3(0.0, 0.02, -0.03), vec3(0.075, 0.09, 0.2));
  vec3 hs = vec3(abs(h.x), h.y, h.z);
  // 움푹 꺼진 관자놀이와 눈자리 (구멍이 아니라 그늘진 골)
  skull = smax(skull, -sdEllipsoid(hs - vec3(0.07, 0.02, 0.06), vec3(0.03, 0.025, 0.07)), 0.02);
  float jaw = sdEllipsoid(h - vec3(0.0, -0.085, 0.06), vec3(0.05, 0.03, 0.16));
  skull = smin(skull, jaw, 0.035);
  float mouth = sdEllipsoid(h - vec3(0.0, -0.055, 0.15), vec3(0.03, 0.022, 0.09));
  skull = smax(skull, -mouth, 0.008);
  skull += 0.002 * sin(h.z * 90.0) * smoothstep(0.0, 0.1, h.z);
  r = umin(r, vec2(skull, 2.0));
  r = umin(r, vec2(sdEllipsoid(h - vec3(0.0, -0.055, 0.13), vec3(0.024, 0.016, 0.08)), 99.0));
  // ── 어깨에 걸친 수의 ──
  vec3 kq = p - vec3(0.0, 1.66, 0.12);
  kq.yz = rot(-0.5) * kq.yz;
  float ka = atan(kq.z, kq.x);
  float ct = clamp(-kq.y / 0.5, 0.0, 1.0);
  float crad = mix(0.2, 0.36, pow(ct, 0.7)) + 0.025 * sin(ka * 7.0 + kq.y * 4.0);
  float shroud = abs(length(kq.xz * vec2(0.9, 1.1)) - crad) - 0.01;
  float shem = -0.3 - 0.18 * (0.5 + 0.5 * sin(ka * 5.0 + 1.0)) - 0.05 * sin(ka * 13.0);
  shroud = max(shroud, max(shem - kq.y, kq.y - 0.04));
  shroud = max(shroud, kq.z - 0.1);
  r = umin(r, vec2(shroud, 1.0));
  // 사슬 무리: 등뼈·팔·손가락·다리·수의 띠
  r = skel(p, r);
  return r;
}

// 다리를 삼키는 안개: 발치에 낮게 깔리고 위로 갈수록 옅어진다 (사인 물결로 흐트러짐)
vec4 volume(vec3 p) {
  vec3 q = (p - vec3(0.05, 0.25, 0.3)) * vec3(0.9, 1.9, 1.1);
  float r = length(q);
  float w = 0.55 + 0.45 * sin(p.x * 5.0 + sin(p.z * 4.0) * 2.0) * sin(p.z * 6.0 - p.y * 3.0 + 1.0);
  float d = smoothstep(1.05, 0.15, r) * w;
  vec3 c = vec3(0.45, 0.52, 0.56);
  return vec4(c * d * 1.3, d * 1.7);
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 바랜 수의: 잿빛, 젖어 비친다, 아래로 갈수록 안개처럼 희미하게 빛난다
    float dirt = fbm3(p * vec3(5.0, 2.0, 5.0));
    float fade = smoothstep(1.1, 0.3, p.y);
    vec3 alb = vec3(0.07, 0.075, 0.08) * (0.5 + 0.7 * dirt);
    return Mat(alb, 0.75, 0.15, vec3(0.03, 0.04, 0.045) * fade, 0.0, 0.35, 0.2);
  }
  if (id < 2.5) {
    // 창백하고 반쯤 비치는 살갗: 푸른 핏줄이 비친다, 젖은 광택
    float vein = smoothstep(0.07, 0.0, ridge(p * 6.0)) * smoothstep(0.35, 0.6, noise(p * 2.5));
    vec3 alb = mix(vec3(0.11, 0.12, 0.13) * (0.75 + 0.4 * fbm3(p * 9.0)), vec3(0.03, 0.05, 0.08), vein * 0.7);
    return Mat(alb, 0.45, 0.45, vec3(0.0), 0.0, 0.3, 0.4);
  }
  // 다리: 아래로 갈수록 살이 안개로 풀린다 (희미한 자체 발광)
  float fade = smoothstep(0.9, 0.0, p.y);
  vec3 alb = mix(vec3(0.1, 0.11, 0.12), vec3(0.04, 0.05, 0.06), fade);
  return Mat(alb, 0.5, 0.3, vec3(0.05, 0.07, 0.085) * fade, 0.0, 0.3, 0.3);
}
${KIT_MAIN}
`,
  };
}
