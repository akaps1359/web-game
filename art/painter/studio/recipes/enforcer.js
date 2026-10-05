// 교단 집행자 (1층 정예) — 교단의 처형인. 굽은 신도들 사이에서 홀로 꼿꼿하게 선 거구.
// 어깨까지 덮는 뾰족한 검보라 두건(눈구멍 속에 자홍빛), 드러낸 잿빛 맨가슴엔 '아래의 목소리'의 낙인이
// 살 속에서 빛난다. 가죽 끈이 가슴을 가로지르고, 허리 아래는 무겁게 늘어진 법복.
// 오른손엔 초승달 날의 처형 도끼를 세워 쥐었고, 왼팔엔 쇠사슬을 감아 늘어뜨렸다.
// (셰이더 컴파일이 무거워지지 않게 sdf 안에서는 해시 잡음·둥근 원뿔을 쓰지 않는다 — k1-kit.js 참고)
import { Skel, KIT_GLSL, KIT_MAIN, add, lerp3 } from './k1-kit.js';

export default function enforcer() {
  const sk = new Skel();
  // 팔 (맨살, 재질 2): 굵은 근육
  const shL = [-0.42, 1.72, 0.0];
  const elL = [-0.56, 1.3, 0.1];
  const wrL = [-0.5, 0.95, 0.3];
  const shR = [0.42, 1.72, 0.0];
  const elR = [0.6, 1.36, 0.16];
  const wrR = [0.62, 1.2, 0.44];
  sk.group(2, 0.06, 0.1, (s) => {
    s.chain([[...shL, 0.13], [...lerp3(shL, elL, 0.4), 0.115], [...elL, 0.085], [...lerp3(elL, wrL, 0.35), 0.09], [...wrL, 0.065]]);
    s.chain([[...shR, 0.13], [...lerp3(shR, elR, 0.4), 0.115], [...elR, 0.085], [...lerp3(elR, wrR, 0.35), 0.09], [...wrR, 0.065]]);
  });
  sk.group(2, 0.016, 0.02, (s) => {
    s.hand(add(wrR, [0.03, 0.0, 0.07]), [-0.9, 0.05, 0.3], [0.0, 0.3, 1.0], { len: 0.14, curl: 1.9, r: 0.022, spread: 0.04 });
    s.hand(add(wrL, [0.0, -0.08, 0.05]), [0.05, -1.0, 0.2], [-0.9, 0.0, 0.3], { len: 0.15, curl: 1.0, r: 0.021, spread: 0.12 });
  });
  // 도끼 자루 (재질 8): 오른손을 지나 바닥에서 머리 위까지
  const haftBot = [0.7, 0.0, 0.62];
  const haftTop = [0.6, 2.25, 0.4];
  sk.group(8, 0.0, 0.0, (s) => {
    const pts = [];
    for (let i = 0; i < 5; i++) pts.push([...lerp3(haftBot, haftTop, i / 4), 0.026]);
    s.chain(pts);
  });
  // 왼팔에 감긴 쇠사슬 (재질 3): 아래팔을 감고 바닥으로
  sk.group(3, 0.0, 0.0, (s) => {
    const pts = [];
    // 손목에 두 바퀴 감긴 뒤, 허리띠까지 축 늘어진 고리
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const c = lerp3(elL, wrL, 0.55 + t * 0.4);
      const a = t * Math.PI * 4;
      pts.push([c[0] + Math.cos(a) * 0.085, c[1] + Math.sin(a) * 0.015, c[2] + Math.sin(a) * 0.085, 0.017]);
    }
    const a0 = pts[pts.length - 1];
    const b0 = [-0.3, 1.02, 0.24];
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const q = lerp3(a0, b0, t);
      pts.push([q[0], q[1] - Math.sin(t * Math.PI) * 0.38, q[2] + Math.sin(t * Math.PI) * 0.06, 0.017]);
    }
    s.chain(pts);
  });
  // 가슴을 가로지르는 가죽 끈 (재질 7)
  sk.group(7, 0.0, 0.0, (s) => {
    s.chain([[0.38, 1.72, 0.12, 0.018], [0.15, 1.48, 0.27, 0.018], [-0.1, 1.25, 0.27, 0.018], [-0.32, 1.06, 0.15, 0.018]]);
  });
  const arr = sk.pack();
  const head = [0.0, 1.98, 0.04];
  return {
    preset: 'act1',
    cam: { pos: [-0.7, 0.55, 6.0], target: [0.05, 1.15, 0.1], fov: 1.75 },
    light: { pt: [0.0, 1.45, 0.75], ptCol: [0.5, 0.1, 0.42], fillCol: [0.3, 0.2, 0.3], rim: 1.25 },
    arrays: {
      ...arr,
      uL: [
        [-0.052, 1.98, 0.15, 0.014],
        [0.052, 1.98, 0.15, 0.014],
      ],
      uLC: [
        [1.0, 0.3, 0.85, 1.9],
        [1.0, 0.3, 0.85, 1.9],
      ],
    },
    glsl: /* glsl */ `
${KIT_GLSL}
const vec3 HEAD = vec3(${head.join(', ')});

// 초승달 도끼날 (자루 꼭대기 근처)
float axeHead(vec3 p) {
  vec3 q = p - vec3(${lerp3(haftBot, haftTop, 0.86).join(', ')});
  q.xy = rot(0.045) * q.xy;
  q.xz = rot(0.35) * q.xz;
  // 날: 큰 원에서 작은 원을 빼낸 초승달, 바깥(+x)으로 휜다
  vec2 c = q.xy;
  float outer = length(c - vec2(0.02, 0.0)) - 0.34;
  float inner = length(c - vec2(-0.22, 0.0)) - 0.36;
  float blade = max(outer, -inner);
  blade = max(blade, -c.x + 0.02);
  float thick = 0.012 + 0.014 * smoothstep(0.32, 0.05, c.x);
  blade = max(blade, abs(q.z) - thick);
  // 자루를 감싼 쇠 소켓 + 뒤쪽 가시
  float sock = sdCapsule(q, vec3(0.0, -0.12, 0.0), vec3(0.0, 0.12, 0.0), 0.045);
  float spike = sdCapsule(q, vec3(-0.02, 0.0, 0.0), vec3(-0.2, 0.05, 0.0), 0.02);
  return min(blade, min(sock, spike));
}

vec2 sdf(vec3 p) {
  float bound = sdCapsule(p, vec3(0.1, 0.0, 0.2), vec3(0.1, 2.5, 0.2), 1.0);
  if (bound > 0.3) return vec2(bound, 2.0);
  // ── 맨몸통: 넓은 가슴, 단단한 배 ──
  float chest = sdEllipsoid(p - vec3(0.0, 1.52, 0.03), vec3(0.37, 0.3, 0.24));
  vec3 ps = vec3(abs(p.x), p.y, p.z);
  chest = smin(chest, sdEllipsoid(ps - vec3(0.14, 1.56, 0.13), vec3(0.15, 0.12, 0.1)), 0.06);
  float belly = sdEllipsoid(p - vec3(0.0, 1.2, 0.04), vec3(0.3, 0.28, 0.21));
  float torso = smin(chest, belly, 0.12);
  torso = smin(torso, sdEllipsoid(p - vec3(0.0, 1.72, -0.02), vec3(0.44, 0.13, 0.2)), 0.1);
  torso += 0.004 * sin(p.y * 38.0) * smoothstep(1.35, 1.05, p.y) * smoothstep(0.2, 0.0, abs(p.x));
  vec2 r = vec2(torso, 2.0);
  // ── 법복: 허리 아래로 무겁게 늘어져 바닥을 쓴다 ──
  float y = p.y;
  float t = clamp(y / 1.05, 0.0, 1.0);
  float ang = atan(p.z, p.x);
  float rad = mix(0.48, 0.3, pow(t, 0.8)) + 0.04 * (1.0 - t) * (sin(ang * 7.0 + 0.4) * 0.6 + sin(ang * 13.0 + 1.9) * 0.4);
  float robe = (length(p.xz * vec2(0.95, 1.1)) - rad) * 0.75;
  robe = max(robe, max(-y, y - 1.08));
  robe = smin(robe, sdTorus(p - vec3(0.0, 1.02, 0.02), vec2(0.31, 0.035)), 0.03);
  r = umin(r, vec2(robe, 1.0));
  // ── 뾰족 두건 (머리에 붙는 원뿔) + 어깨를 덮는 짧은 망토 ──
  vec3 h = p - HEAD;
  float ht = clamp((h.y + 0.12) / 0.62, 0.0, 1.0);
  float hrad = mix(0.155, 0.012, pow(ht, 0.9));
  vec3 hb = h;
  hb.z += 0.12 * ht * ht;
  float hood = (length(hb.xz * vec2(1.0, 0.95)) - hrad) * 0.85;
  hood = max(hood, max(-(h.y + 0.14), h.y - 0.52));
  vec3 kq = p - vec3(0.0, 1.86, 0.0);
  float ka = atan(kq.z, kq.x);
  float ct = clamp(-kq.y / 0.3, 0.0, 1.0);
  float crad = mix(0.16, 0.46, pow(ct, 0.6)) + 0.012 * sin(ka * 9.0);
  float cape = abs((length(kq.xz * vec2(0.95, 1.15)) - crad) * 0.8) - 0.014;
  float chem = -0.22 - 0.06 * sin(ka * 7.0 + 1.0) - 0.03 * sin(ka * 15.0);
  cape = max(cape, max(chem - kq.y, kq.y - 0.04));
  hood = smin(hood, cape, 0.05);
  float ha = atan(h.z, h.x);
  hood += 0.003 * sin(ha * 14.0 + h.y * 8.0);
  vec3 eh = vec3(abs(h.x) - 0.052, h.y, h.z - 0.135);
  float eyes = sdEllipsoid(eh, vec3(0.035, 0.022, 0.08));
  hood = smax(hood, -eyes, 0.01);
  r = umin(r, vec2(hood, 1.0));
  r = umin(r, vec2(sdEllipsoid(eh + vec3(0.0, 0.0, 0.03), vec3(0.03, 0.018, 0.04)), 99.0));
  // ── 사슬 무리: 팔·손·도끼 자루·쇠사슬·가죽 끈 ──
  r = skel(p, r);
  // ── 도끼날 ──
  if (length(p - vec3(0.62, 1.95, 0.44)) - 0.55 < r.x) r = umin(r, vec2(axeHead(p), 3.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검보라 두꺼운 천: 거칠고 바랬다, 밑단은 젖었다
    float dirt = fbm3(p * vec3(5.0, 2.0, 5.0));
    float weave = 0.85 + 0.15 * noise(p * vec3(140.0, 40.0, 140.0));
    float wetHem = smoothstep(0.35, 0.0, p.y);
    vec3 alb = vec3(0.045, 0.028, 0.05) * (0.5 + 0.8 * dirt) * weave;
    return Mat(alb, 0.85 - wetHem * 0.4, 0.12 + wetHem * 0.4, vec3(0.0), 0.0, 0.0, wetHem * 0.6);
  }
  if (id < 2.5) {
    // 잿빛 맨살: 흉터, 핏줄. 가슴엔 살 속에서 빛나는 낙인 (원과 세로 갈래)
    float bl = fbm3(p * 10.0);
    float vein = smoothstep(0.06, 0.0, ridge(p * 8.0)) * 0.6;
    vec3 alb = mix(vec3(0.075, 0.07, 0.078) * (0.7 + 0.5 * bl), vec3(0.03, 0.022, 0.035), vein);
    vec2 s = vec2(p.x, p.y - 1.5);
    float ring = smoothstep(0.009, 0.0, abs(length(s) - 0.11)) + smoothstep(0.008, 0.0, abs(length(s) - 0.06));
    float rays = smoothstep(0.01, 0.0, abs(s.x)) * step(length(s), 0.19) + smoothstep(0.01, 0.0, abs(abs(s.x) - abs(s.y) * 0.7)) * step(length(s), 0.17) * step(s.y, 0.0);
    float sig = clamp(ring + rays, 0.0, 1.0) * step(0.0, n.z) * smoothstep(0.24, 0.18, length(s));
    float burn = smoothstep(0.24, 0.0, length(s)) * 0.5;
    alb = mix(alb, vec3(0.05, 0.015, 0.03), burn);
    vec3 emi = vec3(1.25, 0.18, 0.75) * sig * (0.55 + 0.45 * noise(p * 30.0));
    return Mat(alb, 0.5, 0.35, emi, 0.0, 0.4, 0.25);
  }
  if (id < 3.5) {
    // 검게 그을린 쇠, 날 끝만 닦여 빛난다
    float rust = smoothstep(0.4, 0.75, fbm3(p * 12.0));
    vec3 alb = mix(vec3(0.07, 0.068, 0.072), vec3(0.09, 0.045, 0.025), rust);
    return Mat(alb, mix(0.25, 0.8, rust), mix(1.4, 0.3, rust), vec3(0.0), 0.0, 0.0, 0.3);
  }
  if (id < 7.5) return Mat(vec3(0.05, 0.03, 0.02), 0.5, 0.4, vec3(0.0), 0.0, 0.0, 0.3);
  // 검은 나무 자루
  float grain = noise(vec3(p.x * 70.0, p.y * 3.0, p.z * 70.0));
  return Mat(vec3(0.045, 0.03, 0.02) * (0.6 + 0.6 * grain), 0.55, 0.35, vec3(0.0), 0.0, 0.0, 0.2);
}
${KIT_MAIN}
`,
  };
}
