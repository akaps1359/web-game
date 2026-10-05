// 익사한 선장 (1층 계층군주) — 바다 밑에서 걸어 올라온 거대한 선장.
// 물에 불어난 거구가 어깨를 웅크려 내려다본다. 썩은 프록코트(빛바랜 금 견장, 따개비, 녹조)는 가슴이 벌어져
// 갈비뼈 사이로 바다빛 초록 불이 새어 나오고, 삼각모 그늘 아래 해골 같은 얼굴에선 바늘 끝 같은 두 눈이 탄다.
// 해초 수염이 가슴까지 늘어졌다. 한 손은 제 키만 한 녹슨 닻을 움켜쥐고, 한 손엔 녹슨 커틀러스.
// 아래에서 올려다보는 구도로 크기를 키운다.
// (컴파일 가속: 사슬은 k1-kit 의 동적 반복문, 코어 main 은 KIT_MAIN 으로 대체 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3, rng } from './k1-kit.js';

const K_BEND = 0.42;
const Y_BEND = 1.55;
const bendZ = (y) => K_BEND * Math.max(y - Y_BEND, 0) ** 2;
const W = (x, y, z) => [x, y, z + bendZ(y)];

export default function captain({ seed = 1 } = {}) {
  const R = rng(seed * 977 + 5);
  const head = W(0.0, 2.72, 0.16);
  const sk = new Skel();
  // 다리 + 장화 (재질 6)
  sk.group(6, 0.06, 0.0, (s) => {
    for (const sx of [-1, 1]) {
      s.chain([[0.2 * sx, 1.5, 0.0, 0.16], [0.28 * sx, 0.9, 0.08, 0.13], [0.3 * sx, 0.68, 0.06, 0.16], [0.31 * sx, 0.12, 0.04, 0.135]]);
      s.chain([[0.31 * sx, 0.1, 0.02, 0.1], [0.32 * sx, 0.07, 0.16, 0.085], [0.33 * sx, 0.055, 0.3, 0.06]]);
    }
  });
  // 소매 (외투, 재질 1): 굵은 소매, 소맷부리는 넓게 접혔다
  const shL = W(-0.64, 2.36, 0.0);
  const elL = [-0.86, 1.86, 0.36];
  const wrL = [-0.82, 1.42, 0.62];
  const shR = W(0.64, 2.36, 0.0);
  const elR = [0.98, 1.98, 0.3];
  const wrR = [1.02, 2.06, 0.62];
  sk.group(1, 0.06, 0.1, (s) => {
    s.chain([[...shL, 0.16], [...lerp3(shL, elL, 0.5), 0.14], [...elL, 0.125], [...lerp3(elL, wrL, 0.6), 0.115], [...lerp3(elL, wrL, 0.82), 0.15], [...wrL, 0.155]]);
    s.chain([[...shR, 0.16], [...lerp3(shR, elR, 0.5), 0.14], [...elR, 0.125], [...lerp3(elR, wrR, 0.6), 0.115], [...lerp3(elR, wrR, 0.82), 0.15], [...wrR, 0.155]]);
  });
  // 손 (불어 터진 살갗, 재질 2) — 왼손은 칼자루, 오른손은 닻대를 움켜쥔다
  sk.group(2, 0.02, 0.0, (s) => {
    s.hand(add(wrL, [0.0, -0.13, 0.06]), [0.1, -0.9, 0.3], [-0.9, 0.0, 0.3], { len: 0.24, curl: 1.7, r: 0.032, spread: 0.08, fingers: 3 });
    s.hand(add(wrR, [0.06, 0.02, 0.08]), [0.2, 0.15, 0.95], [0.3, 1.0, 0.0], { len: 0.24, curl: 1.85, r: 0.032, spread: 0.05 });
  });
  // 해초 수염 + 소매에서 늘어진 해초 (재질 5)
  sk.group(5, 0.008, 0.0, (s) => {
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.8;
      const root = add(head, [Math.sin(a) * 0.15, -0.2 + Math.abs(a) * 0.05, 0.13 + Math.cos(a) * 0.05]);
      const L = 0.45 + R() * 0.35;
      s.curve([root, add(root, [0.0, -L * 0.3, 0.06]), add(root, [Math.sin(a) * 0.05 + (R() - 0.5) * 0.06, -L * 0.7, 0.05]), add(root, [(R() - 0.5) * 0.08, -L, 0.0])], 4, 0.034, 0.01, 0.7);
    }
    const hang = (root, L, dx) => s.curve([root, add(root, [dx * 0.3, -L * 0.35, 0.03]), add(root, [dx * 0.8, -L * 0.7, 0.02]), add(root, [dx, -L, 0.0])], 4, 0.022, 0.008, 0.8);
    hang(add(wrL, [-0.13, 0.02, -0.04]), 0.65, -0.06);
    hang(add(elL, [-0.13, 0.0, 0.0]), 0.8, -0.04);
    hang(add(elR, [0.12, -0.05, -0.02]), 0.7, 0.05);
  });
  const arr = sk.pack();
  return {
    preset: 'act1',
    cam: { pos: [-1.3, 0.22, 7.4], target: [0.15, 1.72, 0.15], fov: 1.72 },
    light: { pt: W(0.0, 1.95, 0.75), ptCol: [0.12, 0.6, 0.45], rim: 1.25, exposure: 1.15 },
    arrays: {
      ...arr,
      uL: [
        [head[0] - 0.09, head[1] - 0.074, head[2] + 0.2, 0.009],
        [head[0] + 0.09, head[1] - 0.072, head[2] + 0.2, 0.009],
      ],
      uLC: [
        [0.45, 1.0, 0.85, 3.2],
        [0.45, 1.0, 0.85, 3.2],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});
// 닻 (a: 닻 좌표, 관 y=0.12, 고리 y=2.5)
float anchorD(vec3 a) {
  float sh = length(a.xz) - mix(0.09, 0.07, clamp(a.y / 2.4, 0.0, 1.0));
  sh = max(sh, max(0.1 - a.y, a.y - 2.42));
  float ring = sdTorus((a - vec3(0.0, 2.53, 0.0)).xzy, vec2(0.13, 0.032));
  float stock = sdCapsule(a, vec3(0.0, 2.2, -0.58), vec3(0.0, 2.2, 0.58), 0.055);
  stock = min(stock, length(vec3(a.x, a.y - 2.2, abs(a.z) - 0.59)) - 0.08);
  vec2 c = a.xy - vec2(0.0, 0.82);
  float arm = length(vec2(length(c) - 0.7, a.z)) - mix(0.075, 0.055, smoothstep(0.1, 0.5, a.y));
  arm = max(arm, a.y - 0.52);
  vec3 f = vec3(abs(a.x), a.y, a.z) - vec3(0.59, 0.45, 0.0);
  f.xy = rot(-0.6) * f.xy;
  float fluke = sdEllipsoid(f - vec3(0.0, 0.04, 0.0), vec3(0.17, 0.23, 0.038));
  fluke = min(fluke, sdCapsule(f, vec3(0.0, 0.14, 0.0), vec3(0.0, 0.34, 0.0), 0.024));
  float d = min(min(sh, ring), min(stock, min(arm, fluke)));
  d = min(d, length(a - vec3(0.0, 0.12, 0.0)) - 0.12);
  return d;
}

// 휜 커틀러스: 칼밑에서 아래로, 넓은 면이 앞을 본다
float cutlass(vec3 p) {
  vec3 q = p - vec3(-0.84, 1.2, 0.76);
  q.xy = rot(-0.38) * q.xy;
  q.yz = rot(-0.3) * q.yz;
  q.xz = rot(1.35) * q.xz;
  float t = clamp(-q.y / 1.15, 0.0, 1.0);
  q.z -= 0.12 * t * t;
  float w = mix(0.065, 0.02, t * t);
  float blade = sdBox(q - vec3(0.0, -0.58, 0.0), vec3(0.008, 0.58, w));
  float guard = sdTorus((q - vec3(0.0, 0.03, 0.04)).yxz, vec2(0.08, 0.012));
  float grip = sdCapsule(q, vec3(0.0, 0.04, 0.0), vec3(0.0, 0.25, 0.0), 0.026);
  return min(blade, min(guard, grip));
}

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.1, 0.0, 0.3), vec3(0.1, 3.2, 0.3), 1.5);
  if (bound > 0.3) return vec2(bound, 1.0);
  // ── 프록코트: 꼭 끼는 몸통, 허리 아래 넓게 퍼진 자락은 앞이 갈라졌고, 가슴은 V자로 벌어졌다 ──
  vec3 b = p;
  float hb = max(b.y - ${Y_BEND.toFixed(3)}, 0.0);
  b.z -= ${K_BEND.toFixed(3)} * hb * hb;
  float y = b.y;
  float ang = atan(b.z, b.x);
  float skirt = mix(0.68, 0.46, smoothstep(0.45, 1.55, y));
  float rad = y < 1.55 ? skirt : mix(0.46, 0.47, smoothstep(1.55, 2.35, y));
  rad += 0.055 * smoothstep(1.55, 0.5, y) * (sin(ang * 6.0 + 0.4) * 0.6 + sin(ang * 11.0 + 1.9) * 0.4);
  float coatS = (length(b.xz * vec2(0.92, 1.1)) - rad) * 0.75;
  float shell = abs(coatS) - 0.035;
  float slit = max(abs(b.x) - 0.06 - (1.55 - y) * 0.22, -b.z);
  float vcut = max(max(abs(b.x) - 0.05 - (y - 1.55) * 0.32, -(b.z - 0.08)), 1.55 - y);
  shell = max(shell, y < 1.55 ? -slit : -vcut);
  float hem = 0.5 + 0.09 * sin(ang * 5.0 + 1.0) + 0.05 * sin(ang * 13.0 + 0.3) + 0.03 * sin(ang * 29.0);
  float coat = max(shell, max(hem - y, y - 2.4));
  float shd = sdEllipsoid(b - vec3(0.0, 2.33, -0.02), vec3(0.68, 0.18, 0.3));
  shd = max(shd, -vcut);
  coat = smin(coat, shd, 0.18);
  // 접힌 큰 옷깃 (V자를 따라)
  vec3 lp = vec3(abs(b.x), b.y, b.z);
  float lapel = sdBox(lp - vec3(0.14 + (y - 1.9) * 0.3, 1.95, 0.42), vec3(0.06, 0.42, 0.02));
  lapel = max(lapel, -(lp.x - 0.05 - (y - 1.55) * 0.32));
  coat = smin(coat, lapel, 0.02);
  coat += 0.005 * sin(y * 31.0 + sin(ang * 5.0) * 3.0) * smoothstep(0.5, 1.5, y);
  vec2 r = vec2(coat, 1.0);
  // 벌어진 가슴: 썩은 살 위로 드러난 갈비뼈
  float chest = sdEllipsoid(b - vec3(0.0, 1.95, 0.04), vec3(0.44, 0.5, 0.36));
  chest -= 0.014 * smoothstep(0.2, 0.9, sin(y * 40.0)) * smoothstep(0.32, 0.04, abs(b.x));
  r = umin(r, vec2(chest, 10.0));
  // 견장 (빛바랜 금, 술이 늘어진 판) + 금단추
  vec3 ep = vec3(abs(b.x), b.y, b.z) - vec3(0.55, 2.45, -0.02);
  ep.xy = rot(-0.32) * ep.xy;
  float epa = sdEllipsoid(ep, vec3(0.2, 0.05, 0.17));
  float fringe = sdEllipsoid(ep - vec3(0.07, -0.07, 0.0), vec3(0.15, 0.08, 0.17)) + 0.008 * abs(sin(atan(ep.z, ep.x - 0.07) * 18.0));
  epa = min(epa, max(fringe, ep.y + 0.02));
  vec3 bt = vec3(abs(b.x) - 0.2 - (b.y - 1.6) * 0.18, b.y - 1.7, b.z - 0.4);
  bt.y = mod(bt.y + 0.12, 0.24) - 0.12;
  float buttons = max(length(bt) - 0.032, abs(b.y - 1.95) - 0.38);
  r = umin(r, vec2(min(epa, buttons), 4.0));
  // ── 머리: 숙인 채 썩어 불어난 해골 같은 얼굴 ──
  vec3 h = (p - HEAD) / 1.2;
  h.yz = rot(0.42) * h.yz;
  float head = sdEllipsoid(h, vec3(0.2, 0.24, 0.22));
  head = smin(head, sdCapsule(h, vec3(0.0, -0.32, -0.12), vec3(0.0, -0.1, -0.02), 0.13), 0.08);
  vec3 hs = vec3(abs(h.x), h.y, h.z);
  head = smin(head, sdEllipsoid(hs - vec3(0.1, -0.04, 0.14), vec3(0.075, 0.05, 0.06)), 0.04);
  head = smin(head, sdEllipsoid(hs - vec3(0.07, 0.065, 0.17), vec3(0.075, 0.03, 0.045)), 0.03);
  vec3 jq = h - vec3(0.0, -0.18, 0.07);
  jq.yz = rot(0.4) * jq.yz;
  head = smin(head, sdEllipsoid(jq, vec3(0.14, 0.055, 0.13)), 0.05);
  float sockets = length(hs - vec3(0.075, 0.02, 0.2)) - 0.055;
  float nose = sdEllipsoid(h - vec3(0.0, -0.06, 0.22), vec3(0.03, 0.045, 0.045));
  float mouth = sdEllipsoid(h - vec3(0.0, -0.15, 0.2), vec3(0.09, 0.04, 0.07));
  head = smax(head, -min(min(sockets, nose), mouth), 0.015);
  head += 0.005 * sin(h.x * 50.0) * sin(h.y * 45.0 + h.z * 30.0);
  r = umin(r, vec2(head * 1.2, 2.0));
  float holes = min(length(hs - vec3(0.075, 0.02, 0.165)) - 0.05, sdEllipsoid(h - vec3(0.0, -0.15, 0.17), vec3(0.08, 0.035, 0.06)));
  r = umin(r, vec2(holes * 1.2, 99.0));
  // ── 삼각모: 세 면이 위로 접힌 챙, 앞으로 모서리 하나 ──
  vec3 hq = (p - HEAD - vec3(0.0, 0.25, -0.02)) / 1.2;
  hq.yz = rot(0.3) * hq.yz;
  float crown = sdEllipsoid(hq - vec3(0.0, 0.05, 0.0), vec3(0.23, 0.15, 0.24));
  float hr = length(hq.xz);
  float ha = atan(hq.x, hq.z);
  float phi = mod(ha, 2.0943951) - 1.0471976;
  float RR = 0.3 / max(cos(phi), 0.64);
  float wallH = 0.13 - 0.05 * smoothstep(0.6, 1.0, abs(phi));
  float yb = clamp((hr - 0.2) / (RR - 0.2), 0.0, 1.0);
  float surf = hq.y + 0.03 - wallH * yb * yb;
  float brim = max(abs(surf) * 0.55 - 0.013, max(hr - RR, 0.18 - hr));
  r = umin(r, vec2(min(crown, brim) * 1.2, 7.0));
  // ── 사슬 무리: 다리·소매·손·해초 ──
  r = skel(p, r);
  // ── 닻: 오른편에 세워 움켜쥐었다 ──
  vec3 a = p - vec3(1.12, 0.0, 0.5);
  a.xy = rot(-0.06) * a.xy;
  a.xz = rot(0.35) * a.xz;
  if (length(a - vec3(0.0, 1.3, 0.0)) - 1.45 < r.x) r = umin(r, vec2(anchorD(a), 3.0));
  // ── 커틀러스 ──
  if (length(p - vec3(-0.95, 0.68, 0.9)) - 0.9 < r.x) r = umin(r, vec2(cutlass(p), 9.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  // 따개비 무늬 (흰 혹, 가운데 어두운 구멍)
  vec3 bq = p * 26.0;
  vec3 bf = fract(bq) - 0.5;
  float bh = hash31(floor(bq));
  float barn = step(0.8, bh) * smoothstep(0.42, 0.25, length(bf.xz)) * smoothstep(0.6, 0.85, fbm3(p * 3.0 + 5.0));
  float barnHole = barn * smoothstep(0.1, 0.05, length(bf.xz));
  if (id < 1.5) {
    // 바다에 절은 외투: 검푸른 천, 녹조 얼룩, 소금꽃, 어깨엔 따개비
    float dirt = fbm3(p * vec3(3.0, 1.2, 3.0));
    float algae = smoothstep(0.5, 0.75, fbm3(p * 5.0 + 7.0)) * smoothstep(1.8, 0.4, p.y);
    float salt = smoothstep(0.66, 0.8, fbm3(p * 9.0 + 2.0));
    vec3 alb = vec3(0.02, 0.032, 0.036) * (0.5 + 0.9 * dirt);
    alb = mix(alb, vec3(0.03, 0.06, 0.025), algae);
    alb += vec3(0.05, 0.055, 0.05) * salt;
    float sb = barn * smoothstep(2.2, 2.45, p.y);
    alb = mix(alb, vec3(0.2, 0.2, 0.17) * (1.0 - barnHole), sb);
    return Mat(alb, 0.62 - algae * 0.2 + sb * 0.3, 0.28 + algae * 0.3, vec3(0.0), 0.03, 0.0, 0.35 + algae * 0.3);
  }
  if (id < 2.5) {
    // 불어 터진 익사자 살갗: 회녹색, 검푸른 부패 핏줄
    float bl = fbm3(p * 12.0);
    float vein = smoothstep(0.08, 0.0, ridge(p * 7.0)) * smoothstep(0.3, 0.6, noise(p * 3.0));
    vec3 alb = mix(vec3(0.12, 0.14, 0.12) * (0.7 + 0.5 * bl), vec3(0.03, 0.06, 0.07), vein * 0.8);
    return Mat(alb, 0.38, 0.55, vec3(0.0), 0.05, 0.5, 0.55);
  }
  if (id < 3.5) {
    // 녹슨 쇠: 붉은 녹, 검은 쇠, 녹조, 따개비
    float rust = smoothstep(0.3, 0.7, fbm3(p * 9.0));
    float algae = smoothstep(0.6, 0.8, fbm3(p * 4.0 + 11.0));
    vec3 alb = mix(vec3(0.045, 0.04, 0.036), vec3(0.12, 0.05, 0.02), rust);
    alb = mix(alb, vec3(0.03, 0.06, 0.03), algae);
    alb = mix(alb, vec3(0.2, 0.19, 0.16) * (1.0 - barnHole), barn);
    return Mat(alb, mix(0.4, 0.9, max(rust, barn)), mix(0.8, 0.15, rust), vec3(0.0), 0.0, 0.0, 0.35);
  }
  if (id < 4.5) {
    float verd = smoothstep(0.45, 0.7, fbm3(p * 16.0));
    vec3 alb = mix(vec3(0.18, 0.12, 0.045), vec3(0.05, 0.11, 0.08), verd);
    return Mat(alb, mix(0.3, 0.7, verd), mix(1.1, 0.3, verd), vec3(0.0), 0.0, 0.0, 0.4);
  }
  if (id < 5.5) {
    float v = noise(p * 25.0);
    return Mat(vec3(0.035, 0.045, 0.018) * (0.7 + 0.6 * v), 0.3, 0.6, vec3(0.0), 0.0, 0.7, 0.8);
  }
  if (id < 6.5) return Mat(vec3(0.02, 0.02, 0.02), 0.35, 0.6, vec3(0.0), 0.0, 0.0, 0.7);
  if (id < 7.5) {
    float wear = fbm3(p * 8.0);
    vec3 alb = vec3(0.018, 0.02, 0.022) * (0.6 + 0.8 * wear);
    alb = mix(alb, vec3(0.2, 0.2, 0.17) * (1.0 - barnHole), barn * 0.8);
    return Mat(alb, 0.75, 0.25, vec3(0.0), 0.0, 0.0, 0.35);
  }
  if (id > 9.5) {
    // 벌어진 가슴: 갈비뼈가 드러나고, 그 틈 속에서 초록 불이 탄다
    float s = sin((p.y + 0.9 * p.x * p.x) * 38.0);
    float rib = smoothstep(-0.2, 0.35, s) * smoothstep(0.03, 0.06, abs(p.x));
    float gap = smoothstep(-0.6, -0.95, s);
    float mid = smoothstep(0.16, 0.0, abs(p.x)) * 0.9 + 0.1;
    vec3 alb = mix(vec3(0.01, 0.015, 0.013), vec3(0.16, 0.165, 0.13) * (0.7 + 0.5 * fbm3(p * 20.0)), rib);
    float glow = max(gap, 1.0 - rib) * mid * smoothstep(1.6, 1.9, p.y) * smoothstep(2.3, 2.0, p.y);
    return Mat(alb, 0.5, 0.4, vec3(0.2, 0.9, 0.6) * glow * 1.1, 0.0, 0.25, 0.5);
  }
  // 녹슨 칼날
  float rust = smoothstep(0.35, 0.7, fbm3(p * 14.0));
  return Mat(mix(vec3(0.03, 0.03, 0.03), vec3(0.055, 0.025, 0.01), rust), mix(0.62, 0.9, rust), mix(0.35, 0.1, rust), vec3(0.0), 0.0, 0.0, 0.15);
}
${KIT_MAIN}
`,
  };
}
