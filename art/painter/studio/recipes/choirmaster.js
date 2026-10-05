// 성가대장 (2층 정예) — 재를 토하는 아이들을 지휘하는 자. 그가 지휘봉을 들면 재에 묻힌 모든 입이 동시에 열린다.
// 떠 있는, 지나치게 길고 마른 몸. 검은 수단 위에 재에 전 흰 중백의, 주름 잡힌 높은 깃. 두 팔을 높이 들어 지휘하고,
// 뼈 지휘봉 끝엔 작은 촛불. 머리는 뒤로 젖혀졌고 턱이 빠질 만큼 벌어진 목구멍에서 창백한 금빛 노래가 새어 나온다.
// 옷자락 끝은 해져 재처럼 흩어진다.

export default function choirmaster() {
  const mouth = [0.0, 2.7, 0.2];
  const tip = [0.98, 3.75, 0.3];
  return {
    preset: 'act2',
    cam: { pos: [1.6, 0.7, 8.8], target: [0.0, 2.0, 0.0], fov: 1.55 },
    light: {
      key: [-0.45, 0.65, -0.6],
      keyCol: [1.25, 1.15, 1.05],
      fillCol: [0.1, 0.075, 0.055],
      amb: [0.022, 0.018, 0.016],
      rim: 1.35,
      pt: [0.0, 2.95, 0.6],
      ptCol: [0.55, 0.42, 0.22],
      exposure: 1.2,
    },
    frame: { fill: 0.92, bottom: 0.04 },
    arrays: {
      uL: [
        [tip[0], tip[1] + 0.04, tip[2], 0.03],
        [0.0, 2.48, 0.1, 0.07],
      ],
      uLC: [
        [1.0, 0.75, 0.35, 1.1],
        [1.0, 0.8, 0.45, 1.6],
      ],
    },
    glsl: /* glsl */ `
#define NO_GROUND
#define HAS_VOLUME
#define VOLUME_STEPS 36
#define VOLUME_FAR 16.0
const vec3 MOUTH = vec3(${mouth.join(', ')});
const vec3 TIP = vec3(${tip.join(', ')});
const vec3 HANDR = vec3(0.66, 3.2, 0.22);
const vec3 HANDL = vec3(-0.7, 3.12, 0.18);

float hand(vec3 p, vec3 c, vec3 f, vec3 u, float curl, float spread) {
  float bd = length(p - c) - 0.3;
  if (bd > 0.1) return bd;
  f = normalize(f);
  vec3 s = normalize(cross(f, u));
  u = normalize(cross(s, f));
  float d = sdEllipsoid(p - c, vec3(0.045, 0.055, 0.025));
  for (int i = 0; i < 4; i++) {
    float o = float(i) - 1.5;
    vec3 k = c + f * 0.045 + s * o * 0.022;
    float L = 0.14 - abs(o) * 0.02;
    vec3 m = k + normalize(f - u * curl * 0.5 + s * o * spread) * L * 0.55;
    vec3 e = m + normalize(f - u * curl * 1.3 + s * o * spread) * L * 0.5;
    d = smin(d, min(sdRoundCone(p, k, m, 0.01, 0.008), sdRoundCone(p, m, e, 0.008, 0.004)), 0.008);
  }
  d = smin(d, sdRoundCone(p, c - s * 0.04, c - s * 0.08 + f * 0.06, 0.012, 0.006), 0.01);
  return d;
}
// 들어 올린 팔 아래로 늘어진 소매 자락
float drape(vec3 p, vec3 a, vec3 b, float drop, float th) {
  vec2 ab = b.xz - a.xz;
  float h = clamp(dot(p.xz - a.xz, ab) / dot(ab, ab), 0.0, 1.0);
  vec3 c = mix(a, b, h);
  vec2 nrm = normalize(vec2(-ab.y, ab.x));
  float lat = dot(p.xz - c.xz, nrm) + 0.025 * sin(h * 16.0 + p.y * 7.0);
  float bottom = c.y - drop * (0.3 + 0.7 * h) - 0.08 * fbm3(p * 9.0);
  float d = max(abs(lat) - th, max(p.y - c.y, bottom - p.y));
  float L = length(ab);
  float along = dot(p.xz - a.xz, ab) / L;
  d = max(d, max(along - L - 0.04, -along - 0.04));
  return d * 0.8;
}

vec2 sdf(vec3 p) {
  vec2 r = vec2(1e5, 0.0);
  // ── 수단: 길고 좁은 검은 옷, 끝은 길게 찢어진 넝마 ──
  float yy = clamp((p.y - 0.2) / 2.15, 0.0, 1.0);
  float rad = mix(0.48, 0.19, pow(yy, 0.6));
  float ang = atan(p.x, p.z);
  rad += 0.035 * (1.0 - yy) * sin(ang * 9.0 + p.y * 2.0);
  float robe = (length(p.xz * vec2(1.0, 1.2)) - rad) * 0.75;
  // 해진 끝단: 각도마다 길이가 다른 넝마 가닥
  float strip = noise(vec3(ang * 4.5, 0.0, 1.0)) * 0.6 + 0.4 * noise(vec3(ang * 11.0, 3.0, 2.0));
  float hemY = 0.25 + 0.55 * strip * (0.4 + 0.6 * noise(vec3(ang * 6.0, 2.0, 0.0))) + 0.1 * fbm3(p * 6.0);
  robe = max(robe, max(hemY - p.y, p.y - 2.36));
  r = vec2(robe, 1.0);
  // ── 중백의: 어깨에서 허리 아래까지, 넓은 소매 ──
  float yy2 = clamp((p.y - 1.25) / 1.1, 0.0, 1.0);
  float rad2 = mix(0.4, 0.22, pow(yy2, 0.7));
  rad2 += 0.025 * (1.0 - yy2) * sin(ang * 14.0 + p.y * 3.0);
  float surp = (length(p.xz * vec2(1.0, 1.15)) - rad2) * 0.75;
  surp = max(surp, -(length(p.xz * vec2(1.0, 1.15)) - rad2 + 0.05));
  float sHem = 1.22 + 0.16 * noise(vec3(ang * 6.0, 0.0, 4.0)) + 0.05 * fbm3(p * 9.0);
  surp = max(surp, max(sHem - p.y, p.y - 2.38));
  // 어깨
  surp = smin(surp, sdEllipsoid(p - vec3(0.0, 2.28, 0.0), vec3(0.3, 0.1, 0.18)), 0.08);
  // 팔 위로 흘러내린 넓은 소매
  vec3 shR = vec3(0.24, 2.3, 0.0);
  vec3 elR = vec3(0.58, 2.72, 0.12);
  vec3 shL = vec3(-0.24, 2.3, 0.0);
  vec3 elL = vec3(-0.6, 2.66, 0.1);
  float sl = min(sdRoundCone(p, shR, elR, 0.09, 0.07), sdRoundCone(p, shL, elL, 0.09, 0.07));
  sl = smin(sl, drape(p, shR + vec3(0.0, -0.04, 0.0), elR, 0.7, 0.012), 0.04);
  sl = smin(sl, drape(p, shL + vec3(0.0, -0.04, 0.0), elL, 0.65, 0.012), 0.04);
  surp = min(surp, sl);
  surp += 0.003 * (fbm3(p * 24.0) - 0.5);
  r = umin(r, vec2(surp, 2.0));
  // 옷 앞섶에 꿰매 붙인 작은 입들: 모두 노래하듯 벌어져 있다
  float lips = 1e5;
  float inner = 1e5;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float my = 2.12 - fi * 0.15;
    float mx = (mod(fi, 2.0) - 0.5) * 0.09;
    float t2 = clamp((my - 1.25) / 1.1, 0.0, 1.0);
    float rz = mix(0.4, 0.22, pow(t2, 0.7)) / 1.15;
    vec3 mc = vec3(mx, my, sqrt(max(rz * rz - mx * mx, 0.0)) + 0.005);
    vec3 mq = p - mc;
    float sz = 0.75 + 0.35 * hash11(fi * 2.3);
    mq.xy = rot((hash11(fi * 5.1) - 0.5) * 0.5) * mq.xy;
    vec2 e = vec2(mq.x / (0.05 * sz), mq.y / (0.02 * sz));
    float ring = length(vec2((length(e) - 1.0) * 0.022 * sz, mq.z)) - 0.012 * sz;
    lips = min(lips, ring);
    inner = min(inner, sdEllipsoid(mq + vec3(0.0, 0.0, 0.004), vec3(0.045, 0.017, 0.02) * sz));
  }
  r = umin(r, vec2(inner, 99.0));
  r = umin(r, vec2(lips, 8.0));
  // ── 맨 팔뚝과 손: 아주 길고 마른 ──
  float arms = min(sdRoundCone(p, elR, HANDR, 0.038, 0.026), sdRoundCone(p, elL, HANDL, 0.038, 0.026));
  arms = smin(arms, hand(p, HANDR, vec3(0.3, 1.0, 0.1), vec3(0.0, 0.0, 1.0), 1.1, 0.05), 0.02);
  arms = smin(arms, hand(p, HANDL, vec3(-0.35, 1.0, 0.15), vec3(0.0, 0.0, 1.0), 0.4, 0.22), 0.02);
  // 목
  arms = min(arms, sdRoundCone(p, vec3(0.0, 2.3, 0.0), vec3(0.0, 2.52, -0.06), 0.06, 0.05));
  r = umin(r, vec2(arms, 3.0));
  // ── 주름 깃: 높이 선 원반 주름 ──
  vec3 cq = p - vec3(0.0, 2.42, -0.02);
  float ca = atan(cq.z, cq.x);
  float pleat = 0.018 * sin(ca * 34.0);
  float ruff = length(vec2(length(cq.xz) - 0.17, cq.y * 1.6)) - 0.075 - pleat;
  r = umin(r, vec2(ruff, 4.0));
  // ── 머리: 뒤로 젖혀졌고, 턱이 빠질 만큼 벌어졌다 ──
  vec3 hq = (p - vec3(0.0, 2.64, -0.04)) / 1.3;
  hq.yz = rot(-0.2) * hq.yz;   // 얼굴이 앞을 향하고 조금 들림
  float skull = sdEllipsoid(hq - vec3(0.0, 0.05, -0.03), vec3(0.085, 0.13, 0.11));
  vec3 he = hq;
  he.x = abs(he.x);
  skull = smax(skull, -sdSphere(he - vec3(0.045, 0.05, 0.1), 0.036), 0.012);
  skull = smin(skull, sdEllipsoid(he - vec3(0.06, -0.02, 0.07), vec3(0.025, 0.03, 0.03)), 0.02);
  // 길게 늘어난 아래턱
  vec3 jq = hq - vec3(0.0, -0.06, 0.02);
  jq.yz = rot(0.55) * jq.yz;
  float jaw = sdRoundCone(jq, vec3(0.0, 0.0, 0.0), vec3(0.0, -0.36, 0.08), 0.07, 0.04);
  jaw = smax(jaw, -sdEllipsoid(jq - vec3(0.0, -0.17, 0.06), vec3(0.045, 0.18, 0.05)), 0.015);
  float head = smin(skull, jaw, 0.03);
  float throat = sdEllipsoid(hq - vec3(0.0, -0.16, 0.08), vec3(0.05, 0.19, 0.06));
  head = smax(head, -throat, 0.015);
  head += 0.003 * (fbm3(p * 30.0) - 0.5);
  r = umin(r, vec2(head * 1.3, 3.0));
  r = umin(r, vec2((throat + 0.02) * 1.3, 99.0));
  // ── 뼈 지휘봉 + 촛불 받침 ──
  float baton = sdRoundCone(p, HANDR + vec3(0.02, 0.05, 0.0), TIP, 0.012, 0.007);
  baton = min(baton, sdCylinder(p - TIP + vec3(0.0, 0.0, 0.0), 0.022, 0.016));
  r = umin(r, vec2(baton, 6.0));
  return r;
}

Mat material(float id, vec3 p, vec3 n) {
  if (id < 1.5) {
    // 검은 수단: 재가 묻은 끝단
    float ash = smoothstep(1.0, 0.3, p.y) * fbm3(p * 6.0);
    vec3 alb = vec3(0.022, 0.02, 0.022) * (0.7 + 0.5 * fbm3(p * 5.0));
    alb = mix(alb, vec3(0.09, 0.088, 0.085), ash * 0.8);
    return Mat(alb, 0.8, 0.2, vec3(0.0), 0.0, 0.0, 0.0);
  }
  if (id < 2.5) {
    // 중백의: 바랜 흰 천에 재와 그을음
    float dirt = fbm3(p * 5.0);
    float soot = smoothstep(1.7, 1.25, p.y) * 0.5 + smoothstep(0.55, 0.8, fbm3(p * 3.0 + 4.0)) * 0.4;
    vec3 alb = vec3(0.13, 0.13, 0.125) * (0.65 + 0.45 * dirt) * (1.0 - soot * 0.6);
    return Mat(alb, 0.85, 0.12, vec3(0.0), 0.0, 0.35, 0.0);
  }
  if (id < 3.5) {
    // 죽은 잿빛 살갗
    vec3 alb = vec3(0.1, 0.098, 0.095) * (0.7 + 0.45 * fbm3(p * 20.0));
    return Mat(alb, 0.72, 0.15, vec3(0.0), 0.0, 0.5, 0.05);
  }
  if (id < 4.5) {
    // 주름 깃: 누렇게 바랜 풀 먹인 리넨
    vec3 alb = vec3(0.16, 0.15, 0.13) * (0.75 + 0.3 * fbm3(p * 18.0));
    return Mat(alb, 0.7, 0.2, vec3(0.0), 0.0, 0.4, 0.0);
  }
  if (id < 5.5) {
    // 목구멍 속: 노래가 빛으로 새어 나온다
    return Mat(vec3(0.0), 1.0, 0.0, vec3(1.3, 0.95, 0.45), 0.0, 0.0, 0.0);
  }
  if (id > 6.5 && id < 7.5) return Mat(vec3(0.0), 1.0, 0.0, vec3(0.9, 0.6, 0.25) * (0.5 + 0.5 * noise(p * 40.0)), 0.0, 0.0, 0.0);
  if (id > 7.5) return Mat(vec3(0.13, 0.06, 0.055), 0.4, 0.6, vec3(0.0), 0.0, 0.6, 0.6);
  return Mat(vec3(0.17, 0.15, 0.11), 0.45, 0.4, vec3(0.0), 0.0, 0.3, 0.0);
}

// 끝단에서 흩어지는 재 가루 + 입에서 피어오르는 금빛 숨
vec4 volume(vec3 p) {
  vec4 v = vec4(0.0);
  float rr = length(p.xz);
  if (p.y < 1.0 && p.y > -0.4 && rr < 0.8) {
    float w = fbm3(p * vec3(3.0, 1.5, 3.0) + vec3(0.0, uSeed, 0.0));
    float dn = smoothstep(0.8, 0.2, rr) * smoothstep(1.0, 0.4, p.y) * smoothstep(-0.4, 0.2, p.y) * pow(max(w - 0.35, 0.0), 1.4) * 4.0;
    v = vec4(vec3(0.09, 0.085, 0.08), dn);
  }
  vec3 q = p - MOUTH;
  if (false) {
    float spread = 0.05 + q.y * 0.3;
    float c = smoothstep(spread, spread * 0.2, length(q.xz - vec2(0.0, q.y * 0.15)));
    float w = fbm3(p * 5.0 + 2.0);
    float dn = c * smoothstep(1.1, 0.2, q.y) * (0.2 + w) * 1.2;
    vec3 col = vec3(1.0, 0.82, 0.5) * 1.6;
    float tot = v.w + dn;
    if (tot > 0.0) v = vec4((v.rgb * v.w + col * dn) / tot, tot);
  }
  return v;
}
`,
  };
}
