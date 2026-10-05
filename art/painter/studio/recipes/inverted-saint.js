// 거꾸로 매달린 성인 (2층 균열 수호자) — 균열 너머의 수도원에선 모든 것이 뒤집혀 있다.
// 그곳의 성인은 거꾸로 매달린 채 거꾸로 된 기적을 행한다.
// 허공에 뜬 거꾸로 선 숯빛 십자가. 앙상하고 창백한 성인이 머리를 아래로 못 박혀 있고, 팔은 아래쪽 가로대에 벌려졌다.
// 늘어진 머리카락, 머리 아래(땅 쪽)에 뜬 창백한 후광. 못 자국에서 흐른 피는 위로 떨어진다.

export default function invertedSaint({ seed = 1 } = {}) {
  // 위로 떠오르는 핏방울 (손과 발에서)
  const drops = [];
  const lc = [];
  const src = [
    [-0.84, 1.0, 0.18],
    [0.84, 1.0, 0.18],
    [0.0, 2.92, 0.2],
  ];
  let k = 1;
  const R = () => {
    k = (k * 16807) % 2147483647;
    return k / 2147483647;
  };
  for (let i = 0; i < 12; i++) {
    const s = src[i % 3];
    const up = 0.12 + R() * (i % 3 === 2 ? 0.5 : 0.75);
    drops.push([s[0] + (R() - 0.5) * 0.08, s[1] + up, s[2] + (R() - 0.5) * 0.06, 0.008 + R() * 0.007]);
    lc.push([1.0, 0.08, 0.05, 0.35]);
  }
  return {
    preset: 'act2',
    cam: { pos: [1.4, 0.55, 8.4], target: [0.0, 1.75, 0.0], fov: 1.55 },
    light: {
      key: [-0.45, 0.65, -0.6],
      keyCol: [1.2, 1.12, 1.08],
      fillCol: [0.16, 0.1, 0.07],
      amb: [0.022, 0.018, 0.02],
      rim: 1.35,
      pt: [0.0, 0.7, 0.2],
      ptCol: [0.38, 0.34, 0.36],
      exposure: 1.2,
    },
    frame: { fill: 0.92, bottom: 0.03 },
    arrays: {
      uL: [[0.0, 0.84, -0.06, 0.32], ...drops],
      uLC: [[1.0, 0.9, 0.95, 0.06], ...lc],
      uA: drops,
    },
    glsl: /* glsl */ `
#define NO_GROUND
const float CBAR = 0.98;   // 가로대 높이 (뒤집힌 십자가: 아래쪽)

float limb(vec3 p, vec3 a, vec3 b, vec3 c, float r0, float r1, float r2) {
  float d = sdRoundCone(p, a, b, r0, r1);
  d = smin(d, sdRoundCone(p, b, c, r1, r2), r1 * 0.4);
  d = smin(d, sdSphere(p - b, r1 * 1.08), r1 * 0.4);
  return d;
}
float hand(vec3 p, vec3 c, float sx) {
  float d = sdEllipsoid(p - c, vec3(0.05, 0.045, 0.022));
  for (int i = 0; i < 4; i++) {
    float o = (float(i) - 1.5) * 0.022;
    vec3 k = c + vec3(sx * 0.04, o, 0.0);
    vec3 m = k + vec3(sx * 0.05, o * 0.4, 0.02);
    vec3 e = m + vec3(sx * 0.02, o * 0.2, 0.045);   // 못 박힌 채 오그라든 손가락
    d = smin(d, min(sdRoundCone(p, k, m, 0.011, 0.009), sdRoundCone(p, m, e, 0.009, 0.006)), 0.008);
  }
  return d;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  // ── 뒤집힌 십자가: 긴 기둥 + 아래쪽 가로대, 숯처럼 그을려 갈라졌다 ──
  float cross = sdBox(p - vec3(0.0, 1.9, -0.13), vec3(0.12, 1.6, 0.08));
  cross = min(cross, sdBox(p - vec3(0.0, CBAR, -0.13), vec3(1.15, 0.1, 0.08)));
  cross += 0.012 * (fbm3(p * vec3(6.0, 2.0, 6.0)) - 0.5) + 0.006 * ridge(p * vec3(30.0, 4.0, 30.0));
  // 아래 끝은 부러졌다
  cross = max(cross, -(p.y - 0.3 - 0.15 * fbm3(p * 14.0)));
  r = vec2(cross, 1.0);

  // ── 성인의 몸 (머리가 아래) ──
  // 발: 위쪽에서 한 못에 겹쳐 박힘
  vec3 ft = vec3(0.0, 2.95, 0.05);
  float body = limb(p, vec3(-0.08, 2.0, 0.07), vec3(-0.05, 2.5, 0.12), ft + vec3(-0.02, 0.0, 0.0), 0.085, 0.06, 0.045);
  body = min(body, limb(p, vec3(0.08, 2.0, 0.07), vec3(0.06, 2.48, 0.13), ft + vec3(0.02, -0.03, 0.02), 0.085, 0.06, 0.045));
  body = smin(body, sdRoundCone(p, ft + vec3(0.0, 0.02, 0.02), ft + vec3(0.0, 0.16, 0.07), 0.045, 0.025), 0.03);
  // 골반과 몸통 (거꾸로): 엉덩이가 위, 가슴이 아래
  body = smin(body, sdEllipsoid(p - vec3(0.0, 1.95, 0.06), vec3(0.17, 0.12, 0.11)), 0.08);
  vec3 tq = p - vec3(0.0, 1.55, 0.07);
  // 갈비 우리 (어깨 쪽, 아래) + 가는 허리 (위)
  float torso = sdEllipsoid(tq - vec3(0.0, -0.13, 0.0), vec3(0.2, 0.24, 0.13));
  torso = smin(torso, sdEllipsoid(tq - vec3(0.0, 0.2, -0.01), vec3(0.13, 0.18, 0.09)), 0.1);
  // 골반뼈 돌출
  torso = smin(torso, sdSphere(p - vec3(0.12, 1.88, 0.12), 0.04), 0.05);
  torso = smin(torso, sdSphere(p - vec3(-0.12, 1.88, 0.12), 0.04), 0.05);
  // 흉골
  torso = smin(torso, sdCapsule(p, vec3(0.0, 1.25, 0.18), vec3(0.0, 1.5, 0.18), 0.02), 0.04);
  float ribG = abs(fract(p.y * 11.0 + 0.3) - 0.5);
  torso -= 0.016 * smoothstep(0.2, 0.45, ribG) * smoothstep(0.05, 0.15, abs(tq.x)) * smoothstep(1.66, 1.45, p.y) * smoothstep(1.18, 1.28, p.y);
  // 움푹 꺼진 배 (거꾸로라 위쪽)
  torso = smax(torso, -sdEllipsoid(p - vec3(0.0, 1.78, 0.17), vec3(0.11, 0.09, 0.05)), 0.04);
  body = smin(body, torso, 0.08);
  // 어깨 (아래쪽)
  body = smin(body, sdEllipsoid(p - vec3(0.0, 1.2, 0.06), vec3(0.24, 0.07, 0.09)), 0.07);
  // 팔: 어깨에서 아래 가로대로 벌려 못 박힘
  vec3 hR = vec3(0.84, CBAR, 0.08);
  vec3 hL = vec3(-0.84, CBAR, 0.08);
  float arms = limb(p, vec3(0.22, 1.19, 0.06), vec3(0.52, 1.07, 0.08), hR - vec3(0.06, 0.0, 0.0), 0.05, 0.038, 0.03);
  arms = min(arms, limb(p, vec3(-0.22, 1.19, 0.06), vec3(-0.52, 1.07, 0.08), hL + vec3(0.06, 0.0, 0.0), 0.05, 0.038, 0.03));
  arms = min(arms, min(hand(p, hR, 1.0), hand(p, hL, -1.0)));
  body = smin(body, arms, 0.04);
  // 목과 머리 (아래로 늘어짐, 얼굴은 앞)
  body = smin(body, sdRoundCone(p, vec3(0.0, 1.18, 0.07), vec3(0.0, 1.0, 0.1), 0.05, 0.045), 0.04);
  vec3 hq = p - vec3(0.0, 0.86, 0.12);
  float head = sdEllipsoid(hq, vec3(0.1, 0.13, 0.11));
  vec3 he = hq;
  he.x = abs(he.x);
  head = smax(head, -sdSphere(he - vec3(0.04, -0.01, 0.1), 0.025), 0.012);
  head = smin(head, sdRoundCone(hq, vec3(0.0, 0.0, 0.1), vec3(0.0, 0.05, 0.12), 0.015, 0.02), 0.01);
  body = smin(body, head, 0.04);
  body += 0.003 * (fbm3(p * 22.0) - 0.5);
  r = umin(r, vec2(body, 2.0));
  // 늘어진 머리카락 (아래로)
  float hair = 1e5;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float a = (fi / 8.0 - 0.5) * 2.6;
    vec3 h0 = vec3(sin(a) * 0.09, 0.82, 0.08 + cos(a) * 0.05 - 0.04);
    vec3 h1 = h0 + vec3(sin(a) * 0.05 + 0.02 * sin(fi * 3.0), -0.32 - 0.1 * hash11(fi), -0.03);
    hair = min(hair, sdRoundCone(p, h0, h1, 0.03, 0.006));
  }
  r = umin(r, vec2(hair, 3.0));
  // 허리에 감긴 천: 중력을 거슬러 위로 나부낀다
  vec3 cq = p - vec3(0.0, 1.98, 0.07);
  float cloth = sdEllipsoid(cq, vec3(0.2, 0.09, 0.14));
  float flap = sdRoundBox(cq - vec3(0.04, 0.22, 0.1), vec3(0.09, 0.2, 0.012), 0.01);
  flap = max(flap, cq.y - 0.38 - 0.06 * fbm3(cq * 12.0));
  cloth = smin(cloth, flap, 0.05);
  r = umin(r, vec2(cloth, 4.0));
  // 못 셋
  float nails = min(sdCapsule(p, hR + vec3(0.0, 0.0, 0.04), hR + vec3(0.0, 0.0, -0.08), 0.012), sdCapsule(p, hL + vec3(0.0, 0.0, 0.04), hL + vec3(0.0, 0.0, -0.08), 0.012));
  nails = min(nails, sdCapsule(p, ft + vec3(0.0, 0.06, 0.1), ft + vec3(0.0, 0.06, -0.12), 0.013));
  nails = min(nails, min(sdCylinder((p - hR - vec3(0.0, 0.0, 0.045)).xzy, 0.006, 0.022), sdCylinder((p - hL - vec3(0.0, 0.0, 0.045)).xzy, 0.006, 0.022)));
  r = umin(r, vec2(nails, 5.0));
  // ── 후광: 머리 아래의 창백한 고리 ──
  vec3 gq = p - vec3(0.0, 0.84, -0.02);
  float halo = length(vec2(length(gq.xy) - 0.24, gq.z)) - 0.012;
  r = umin(r, vec2(halo, 6.0));
  // ── 위로 떨어지는 핏방울 ──
  float dr = 1e5;
  for (int i = 0; i < 12; i++) {
    vec3 c = uA[i].xyz;
    vec3 q = p - c;
    dr = min(dr, sdEllipsoid(q - vec3(0.0, -0.01, 0.0), vec3(uA[i].w, uA[i].w * 1.8, uA[i].w)));
  }
  r = umin(r, vec2(dr, 7.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 숯처럼 그을린 나무, 갈라진 결
    float grain = noise(p * vec3(40.0, 3.0, 40.0));
    float crack = smoothstep(0.08, 0.0, ridge(p * vec3(10.0, 2.0, 10.0)));
    vec3 alb = vec3(0.06, 0.048, 0.038) * (0.6 + 0.6 * grain) * (1.0 - crack * 0.7);
    return Mat(alb, 0.8, 0.3, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 창백한 성인의 살갗, 손발과 옆구리의 상처
    float wound = smoothstep(0.12, 0.03, length(p - vec3(0.84, 0.98, 0.1))) + smoothstep(0.12, 0.03, length(p - vec3(-0.84, 0.98, 0.1)));
    wound += smoothstep(0.1, 0.02, length(p - vec3(0.0, 2.98, 0.1)));
    wound += smoothstep(0.08, 0.02, length((p - vec3(0.15, 1.6, 0.15)) / vec3(0.5, 1.0, 1.0)));
    float mot = fbm3(p * 6.0);
    vec3 alb = mix(vec3(0.12, 0.115, 0.11), vec3(0.09, 0.085, 0.095), mot) * (0.75 + 0.35 * fbm3(p * 18.0));
    alb = mix(alb, vec3(0.12, 0.01, 0.01), clamp(wound, 0.0, 1.0));
    return Mat(alb, 0.5, 0.35, vec3(0.0), 0.0, 0.75, clamp(wound, 0.0, 1.0) * 0.8);
  }
  if (id < 3.5) return Mat(vec3(0.03, 0.025, 0.022), 0.6, 0.4, vec3(0.0), 0.0, 0.0, 0.2);
  if (id < 4.5) {
    float dirt = fbm3(p * 8.0);
    return Mat(vec3(0.14, 0.13, 0.12) * (0.6 + 0.5 * dirt), 0.85, 0.1, vec3(0.0), 0.0, 0.4, 0.0);
  }
  if (id < 5.5) return Mat(vec3(0.05, 0.035, 0.03), 0.5, 0.8, vec3(0.0), 0.0, 0.0, 0.1);
  if (id < 6.5) return Mat(vec3(0.0), 1.0, 0.0, vec3(2.4, 2.1, 2.2), 0.0, 0.0, 0.0);
  return Mat(vec3(0.08, 0.004, 0.004), 0.1, 1.6, vec3(0.18, 0.006, 0.005), 0.0, 0.6, 1.0);
}
`,
  };
}
