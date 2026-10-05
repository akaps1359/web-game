// 밀수꾼 (1층) — 어깨망토가 달린 발목까지 오는 젖은 유포 외투, 챙 넓은 모자를 깊이 눌러쓰고
// 목도리로 얼굴 아래를 가렸다. 그늘 속엔 창백한 눈빛 두 점. 한 손엔 방금 쏜 수발총(총구에서 연기),
// 어깨엔 불룩한 밀수품 자루. 발치엔 연막이 깔린다.
export default function smuggler() {
  const head = [0.02, 1.6, 0.2];
  return {
    preset: 'act1',
    cam: { pos: [1.35, 0.6, 4.9], target: [0.0, 0.95, 0.1], fov: 1.85 },
    light: { rim: 2.2, fillCol: [0.22, 0.15, 0.09], amb: [0.022, 0.03, 0.034] },
    frame: { fill: 0.92 },
    arrays: {
      uL: [
        [head[0] - 0.04, head[1] + 0.0, head[2] + 0.108, 0.004],
        [head[0] + 0.038, head[1] - 0.004, head[2] + 0.11, 0.004],
      ],
      uLC: [
        [0.7, 0.85, 1.0, 0.55],
        [0.7, 0.85, 1.0, 0.55],
      ],
    },
    glsl: /* glsl */ `
#define HAS_VOLUME
#define VOLUME_STEPS 56
#define VOLUME_FAR 9.0
const vec3 HEAD = vec3(${head.join(', ')});
const vec3 GUN = vec3(0.36, 1.12, 0.52);
const vec3 GUN_DIR = normalize(vec3(-0.62, -0.08, 0.78));

float bend(float y) { float h = max(y - 1.0, 0.0); return 0.32 * h * h; }

float folds(vec3 q, float freq, float amp) {
  float a = atan(q.z, q.x);
  return amp * (sin(a * freq + 2.5 * noise(q * 3.0)) * 0.6 + sin(a * freq * 2.3 + 1.7 + 3.0 * noise(q * 5.0)) * 0.4);
}

vec2 sdf(vec3 p) {
  vec3 b = p;
  b.z -= bend(b.y);
  // ── 유포 외투: 좁은 어깨, 발목까지 퍼지는 자락, 앞이 갈라졌다
  float coat = sdEllipsoid(b - vec3(0.0, 1.36, 0.0), vec3(0.22, 0.22, 0.15));
  coat = smin(coat, min(sdSphere(b - vec3(-0.2, 1.45, 0.0), 0.08), sdSphere(b - vec3(0.2, 1.45, 0.0), 0.08)), 0.07);
  float yy = b.y;
  float rr = mix(0.34, 0.19, smoothstep(0.15, 1.2, yy));
  float sk0 = (length(b.xz * vec2(1.0, 1.25)) - rr) * 0.7;
  if (sk0 < 0.08) rr += folds(b, 8.0, 0.025 * (1.0 - smoothstep(0.3, 1.15, yy)));
  float skirt = (length(b.xz * vec2(1.0, 1.25)) - rr) * 0.7;
  float hem = 0.17 + 0.09 * fbm3(vec3(b.x * 6.0, 0.0, b.z * 6.0)) - 0.06 * smoothstep(0.0, -0.3, b.z);
  skirt = max(skirt, max(hem - yy, yy - 1.32));
  skirt = max(skirt, -sdBox(b - vec3(0.03, 0.35, 0.32), vec3(0.025 + 0.09 * smoothstep(0.95, 0.2, yy), 0.4, 0.16)));
  coat = smin(coat, skirt, 0.06);
  // 어깨망토: 팔꿈치까지 덮는 짧은 망토 (밑단이 물결친다)
  vec3 cq = b - vec3(0.0, 1.0, -0.01);
  float cy = cq.y;
  float cr = mix(0.37, 0.2, smoothstep(0.18, 0.5, cy));
  float cape = (length(cq.xz * vec2(1.0, 1.2)) - cr - folds(cq, 9.0, 0.018)) * 0.7;
  cape = max(cape, max(0.17 + 0.03 * sin(atan(cq.z, cq.x) * 9.0) - cy, cy - 0.52));
  cape = max(cape, -sdBox(cq - vec3(0.0, 0.3, 0.33), vec3(0.03 + 0.08 * smoothstep(0.5, 0.15, cy), 0.3, 0.14)));
  cape = abs(cape + 0.012) - 0.012;
  coat = smin(coat, cape, 0.02);
  // 소매
  vec3 eR = vec3(0.34, 1.2, 0.27);
  coat = smin(coat, sdRoundCone(p, vec3(0.2, 1.44, 0.04 + bend(1.44)), eR, 0.08, 0.065), 0.04);
  coat = smin(coat, sdRoundCone(p, eR, GUN + vec3(0.04, 0.03, -0.13), 0.065, 0.058), 0.03);
  vec3 eL = vec3(-0.32, 1.2, 0.08);
  coat = smin(coat, sdRoundCone(p, vec3(-0.2, 1.43, 0.02 + bend(1.43)), eL, 0.08, 0.065), 0.04);
  coat = smin(coat, sdRoundCone(p, eL, vec3(-0.25, 1.47, 0.0), 0.065, 0.058), 0.03);
  if (coat < 0.03) coat += 0.003 * (fbm3(p * 25.0) - 0.5);
  vec2 r = vec2(coat, 1.0);

  // ── 다리와 무릎 장화 (외투 트임 사이로)
  float legs = min(sdRoundCone(p, vec3(-0.09, 0.9, 0.0), vec3(-0.11, 0.48, 0.07), 0.082, 0.066), sdRoundCone(p, vec3(-0.11, 0.48, 0.07), vec3(-0.12, 0.08, 0.04), 0.066, 0.056));
  legs = min(legs, min(sdRoundCone(p, vec3(0.1, 0.9, 0.0), vec3(0.13, 0.48, -0.02), 0.082, 0.066), sdRoundCone(p, vec3(0.13, 0.48, -0.02), vec3(0.15, 0.08, -0.08), 0.066, 0.056)));
  legs = min(legs, sdRoundBox(p - vec3(-0.12, 0.045, 0.1), vec3(0.05, 0.045, 0.11), 0.038));
  legs = min(legs, sdRoundBox(p - vec3(0.15, 0.045, -0.02), vec3(0.05, 0.045, 0.11), 0.038));
  r = umin(r, vec2(legs, 4.0));

  // ── 머리: 챙 넓은 모자와 목도리 (얼굴은 어둠)
  vec3 hq = p - HEAD;
  float hb = length(hq) - 0.35;
  if (hb < 0.02) {
    r = umin(r, vec2(sdEllipsoid(hq, vec3(0.095, 0.115, 0.105)), 99.0));
    float scarf = sdEllipsoid(hq - vec3(0.0, -0.075, 0.005), vec3(0.118, 0.07, 0.122));
    scarf = smin(scarf, sdEllipsoid(hq - vec3(0.0, -0.15, -0.01), vec3(0.11, 0.06, 0.11)), 0.04);
    scarf += 0.005 * sin(hq.y * 110.0 + hq.x * 25.0 + 2.0 * noise(hq * 20.0));
    r = umin(r, vec2(scarf, 3.0));
    // 모자: 둥근 꼭대기 + 앞뒤로 처진 넓은 챙
    vec3 cq = hq - vec3(0.0, 0.085, 0.0);
    cq.yz = rot(0.14) * cq.yz;
    cq.xy = rot(-0.1) * cq.xy;
    float crown = sdCappedCone(cq - vec3(0.0, 0.065, 0.0), 0.065, 0.105, 0.088) - 0.014;
    crown = smax(crown, -sdEllipsoid(cq - vec3(0.0, 0.15, 0.0), vec3(0.025, 0.03, 0.075)), 0.02);
    float br = length(cq.xz * vec2(1.0, 0.95));
    // 챙: 앞은 깊이 처지고, 옆은 살짝 들렸다
    float front = smoothstep(-0.05, 0.25, cq.z);
    float droop = br * br * (0.75 + 0.9 * front - 0.3 * smoothstep(0.1, 0.2, abs(cq.x))) + 0.008 * sin(atan(cq.z, cq.x) * 5.0);
    float brim = max(abs(cq.y + droop) - 0.006, br - 0.25 - 0.012 * noise(cq * 25.0));
    brim *= 0.8;
    float hat = min(crown, brim);
    r = umin(r, vec2(hat, 2.0));
  } else {
    r = umin(r, vec2(hb + 0.08, 2.0));
  }

  // ── 수발총: 긴 총신, 휜 나무 손잡이, 공이
  vec3 gq = p - GUN;
  if (length(gq) < 0.45) {
    vec3 gx = GUN_DIR;
    vec3 gy = normalize(vec3(0.0, 1.0, 0.0) - gx * gx.y);
    vec3 gz = cross(gx, gy);
    vec3 lq = vec3(dot(gq, gz), dot(gq, gy), dot(gq, gx));
    float barrel = sdCapsule(lq, vec3(0.0, 0.03, 0.0), vec3(0.0, 0.03, 0.4), 0.02);
    barrel = min(barrel, sdCapsule(lq, vec3(0.0, 0.03, 0.38), vec3(0.0, 0.03, 0.41), 0.026));
    barrel = min(barrel, sdCapsule(lq, vec3(0.0, 0.028, 0.0), vec3(0.0, 0.028, 0.03), 0.02));
    float stock = sdRoundCone(lq, vec3(0.0, 0.01, 0.02), vec3(0.0, -0.085, -0.075), 0.022, 0.032);
    stock = smin(stock, sdBox(lq - vec3(0.0, 0.016, 0.15), vec3(0.02, 0.018, 0.15)), 0.01);
    float hammer = sdRoundCone(lq, vec3(0.0, 0.045, 0.0), vec3(0.0, 0.075, -0.025), 0.009, 0.006);
    float guard = sdTorus((lq - vec3(0.0, -0.01, 0.04)).yxz, vec2(0.02, 0.004));
    r = umin(r, vec2(min(barrel, min(hammer, guard)), 5.0));
    r = umin(r, vec2(stock, 6.0));
    float glove = sdEllipsoid(lq - vec3(0.0, -0.035, -0.035), vec3(0.042, 0.055, 0.05));
    r = umin(r, vec2(glove, 7.0));
  }

  // ── 밀수품 자루: 왼쪽 어깨에 둘러멨다
  vec3 sq = p - vec3(-0.27, 1.5, -0.22);
  if (length(sq) < 0.45) {
    sq.xy = rot(-0.6) * sq.xy;
    float sack = sdEllipsoid(sq, vec3(0.16, 0.24, 0.15));
    sack = smin(sack, sdEllipsoid(sq - vec3(0.06, -0.13, 0.03), vec3(0.13, 0.13, 0.12)), 0.06);
    sack += 0.016 * (fbm3(sq * 9.0) - 0.5);
    float neck = sdRoundCone(sq, vec3(0.0, 0.19, 0.0), vec3(0.03, 0.3, 0.1), 0.06, 0.035);
    sack = smin(sack, neck, 0.03);
    float rope = sdTorus((sq - vec3(0.012, 0.235, 0.04)).xzy, vec2(0.048, 0.011));
    r = umin(r, vec2(sack, 8.0));
    r = umin(r, vec2(rope, 9.0));
  }
  float gloveL = sdEllipsoid(p - vec3(-0.25, 1.49, -0.01), vec3(0.048, 0.055, 0.05));
  r = umin(r, vec2(gloveL, 7.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 기름 먹인 유포: 번들거리고, 주름에 소금기
    float salt = smoothstep(0.62, 0.8, fbm3(p * 9.0));
    vec3 alb = mix(vec3(0.026, 0.031, 0.036), vec3(0.08, 0.085, 0.085), salt * 0.5) * (0.75 + 0.5 * fbm3(p * 3.0));
    return Mat(alb, 0.38, 0.75, vec3(0.0), 0.03, 0.0, 0.45);
  }
  // 펠트 모자
  if (id < 2.5) return Mat(vec3(0.026, 0.024, 0.022) * (0.8 + 0.4 * noise(p * 60.0)), 0.92, 0.06, vec3(0.0), 0.0, 0.0, 0.0);
  if (id < 3.5) {
    float knit = 0.8 + 0.2 * sin(p.y * 260.0);
    return Mat(vec3(0.05, 0.03, 0.026) * knit, 0.95, 0.05, vec3(0.0), 0.0, 0.0, 0.05);
  }
  if (id < 4.5) return Mat(vec3(0.018, 0.017, 0.016), 0.45, 0.6, vec3(0.0), 0.0, 0.0, 0.45);
  if (id < 5.5) return Mat(vec3(0.07, 0.07, 0.075), 0.22, 1.5, vec3(0.0), 0.0, 0.0, 0.4);
  if (id < 6.5) return Mat(vec3(0.05, 0.026, 0.013) * (0.8 + 0.4 * noise(p * vec3(20.0, 200.0, 20.0))), 0.4, 0.7, vec3(0.0), 0.0, 0.0, 0.2);
  if (id < 7.5) return Mat(vec3(0.022, 0.018, 0.015), 0.5, 0.5, vec3(0.0), 0.0, 0.0, 0.3);
  if (id < 8.5) {
    // 젖은 범포 자루
    float weave = 0.8 + 0.2 * noise(p * 150.0);
    float wet = smoothstep(0.4, 0.7, fbm3(p * 5.0));
    return Mat(vec3(0.06, 0.053, 0.04) * weave * (1.0 - wet * 0.4), 0.85 - wet * 0.4, 0.1 + wet * 0.4, vec3(0.0), 0.0, 0.15, wet * 0.5);
  }
  return Mat(vec3(0.05, 0.042, 0.03), 0.9, 0.1, vec3(0.0), 0.0, 0.0, 0.1);
}

vec4 volume(vec3 p) {
  // 발치에 깔린 연막 + 총구에서 피어오르는 연기
  if (p.y > 1.7 || length(p.xz) > 1.4) return vec4(0.0);
  float ground = smoothstep(0.6, 0.0, p.y) * smoothstep(1.2, 0.3, length(p.xz * vec2(0.85, 1.0) - vec2(0.05, 0.05)));
  float wisp = fbm3(p * vec3(2.4, 3.2, 2.4) + vec3(0.0, -0.4, uSeed));
  float smoke = ground * smoothstep(0.4, 0.72, wisp);
  vec3 mz = GUN + GUN_DIR * 0.44;
  vec3 mq = p - mz;
  float h = mq.y;
  vec2 off = mq.xz - vec2(-0.06, 0.02) * max(h, 0.0) * 3.0;
  float rad = 0.04 + 0.13 * clamp(h, 0.0, 0.5);
  float muzzle = smoothstep(rad, 0.0, length(off)) * smoothstep(-0.04, 0.02, h) * smoothstep(0.6, 0.15, h) * smoothstep(0.3, 0.6, fbm3(p * 9.0));
  float d = smoke * 1.3 + muzzle * 2.5;
  vec3 c = vec3(0.05, 0.068, 0.068) * (0.6 + 0.8 * wisp);
  return vec4(c * d, d);
}
`,
  };
}
