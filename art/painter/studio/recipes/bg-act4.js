// 4층 배경 — 별들의 궁정.
// 지붕 없이 별하늘에 열린 검은 옥좌의 전당. 끝이 보이지 않는 흑요석 기둥이 줄지어 서고, 금 상감이 별빛을 받아 반짝인다.
// 계단 단 위 거대한 빈 옥좌 뒤로 검은 별(금빛 코로나를 두른 일식)이 떠 있다. 거울 같은 검은 바닥에 그 빛이 길게 비친다.
// 바닥 한가운데 아주 작은 순례자 하나 — 규모를 가늠할 유일한 것.
// 기법: 음영은 material()의 emi에서 직접(코로나 역광 + 별빛), 바닥은 반사 광선 추적, 코어 안개는 되돌림.

export default function bgAct4({ seed = 1 } = {}) {
  return {
    preset: 'act4',
    cam: { pos: [0.0, 1.35, 14.0], target: [0.0, 5.6, -30.0], fov: 1.02 },
    light: { key: [0, -1, 0], keyCol: [0, 0, 0], fillCol: [0, 0, 0], amb: [0, 0, 0], rim: 0, fog: [0, 0, 0], glow: 0.0, exposure: 1.15 },
    arrays: { uP: [[seed === 99 ? 1 : 0, 0, 0, 0]] },
    glsl: /* glsl */ `
#define HAS_BG
#define HAS_VOLUME
#define VOLUME_STEPS 64
#define VOLUME_FAR 58.0

const float CX = 6.4;      // 기둥 줄 (x = ±CX)
const float CP = 5.6;      // 기둥 간격
const float CR = 1.2;      // 기둥 반지름
const vec3 THRONE = vec3(0.0, 0.0, -30.0);
const vec3 GOLDC = vec3(1.0, 0.72, 0.32);
const vec3 SUN = vec3(0.0, 0.5, -1.0);    // 검은 별의 방향

vec3 sunD() { return normalize(SUN); }
float rep(float x, float s) { return x - s * floor(x / s + 0.5); }

// ───── 하늘: 촘촘한 별, 비스듬한 은하, 금빛 코로나를 두른 검은 별 ─────
vec3 stars(vec3 rd, float scale, float th) {
  vec3 g = rd * scale;
  vec3 c = floor(g);
  float h = hash31(c);
  float d = length(fract(g) - 0.5);
  float b = step(th, h) * smoothstep(0.45, 0.0, d);
  float tint = hash31(c + 5.0);
  return mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.6), tint) * b * (0.3 + 1.2 * hash31(c + 9.0));
}
vec3 sky(vec3 rd) {
  vec3 col = vec3(0.004, 0.003, 0.012);
  // 은하: 비스듬한 띠
  vec3 gn = normalize(vec3(0.55, 0.3, 0.75));
  float gb = exp(-pow(dot(rd, gn) / 0.22, 2.0));
  float dust = fbm(rd * 6.0 + 2.0);
  col += mix(vec3(0.05, 0.02, 0.09), vec3(0.12, 0.08, 0.05), dust) * gb * (0.4 + 0.8 * dust);
  col *= 1.0 - 0.7 * gb * smoothstep(0.55, 0.7, fbm(rd * 14.0));
  col += stars(rd, 260.0, 0.985) * 0.9 + stars(rd, 520.0, 0.99) * 0.5 * (0.5 + gb);
  // 검은 별: 완전한 검은 원반, 금빛 코로나와 가는 빛살
  vec3 sd = sunD();
  float g = dot(rd, sd);
  float ang = acos(clamp(g, -1.0, 1.0));
  float R = 0.075;
  vec3 up = normalize(cross(sd, vec3(1.0, 0.0, 0.0)));
  vec3 side = cross(sd, up);
  float th = atan(dot(rd, up), dot(rd, side));
  float streak = 0.55 + 0.45 * noise(vec3(th * 6.0, ang * 4.0, 1.0)) + 0.35 * pow(noise(vec3(th * 23.0, 0.0, 3.0)), 3.0);
  float cor = exp(-(ang - R) / 0.035) * step(R, ang) * streak;
  cor += exp(-(ang - R) / 0.12) * step(R, ang) * 0.12;
  col += GOLDC * cor * 2.0;
  col += vec3(1.0, 0.92, 0.75) * exp(-abs(ang - R) / 0.004) * 2.0;
  col *= smoothstep(R - 0.002, R + 0.002, ang);
  return col;
}
vec3 background(vec3 rd) { return sky(rd); }
vec3 hazeCol(vec3 rd) {
  float g = max(dot(rd, sunD()), 0.0);
  return vec3(0.005, 0.004, 0.012) + GOLDC * pow(g, 30.0) * 0.08;
}
vec3 applyFog(vec3 c, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  return mix(c, hazeCol(rd), 1.0 - exp(-t * 0.018));
}
vec3 undoFog(vec3 want, vec3 p) {
  vec3 rd = normalize(p - uCamPos);
  float t = length(p - uCamPos);
  float f = 1.0 - exp(-0.0015 * t * t);
  return (want - background(rd) * f) / max(1.0 - f, 0.03);
}

// ───── 전당 ─────
float column(vec3 p) {
  float zr = rep(p.z, CP);
  vec3 q = vec3(abs(p.x) - CX, p.y, zr);
  // 경계 바깥에서는 경계까지 거리 + 여유 (기둥은 경계보다 1 이상 안쪽에 있다)
  if (p.z < -27.95 || p.z > 19.55) return max(-27.95 - p.z, p.z - 19.55) + 1.0;
  if (abs(abs(p.x) - CX) > 2.5) return abs(abs(p.x) - CX) - 2.0;
  float a = atan(q.z, q.x);
  float r = CR + 0.04 * cos(a * 18.0) - 0.08 * smoothstep(0.0, 40.0, q.y);
  float d = length(q.xz) - r;
  d = max(d, -p.z - 25.2 - CR);
  // 받침: 두 단의 육중한 사각 대좌
  d = min(d, sdBox(q - vec3(0.0, 0.6, 0.0), vec3(1.75, 0.6, 1.75)));
  d = min(d, sdBox(q - vec3(0.0, 1.5, 0.0), vec3(1.5, 0.3, 1.5)));
  // 금 띠 (얕게 튀어나온 고리)
  d = min(d, max(length(q.xz) - r - 0.04, abs(q.y - 4.6) - 0.45));
  return d;
}
float throne(vec3 p) {
  vec3 q = p - THRONE;
  if (length(q - vec3(0.0, 8.0, 0.0)) > 17.0) return length(q - vec3(0.0, 8.0, 0.0)) - 16.0;
  // 계단 단: 앞으로 갈수록 넓은 여섯 단
  float st = clamp(floor(q.y / 0.45), 0.0, 5.0);
  float dais = sdBox(q - vec3(0.0, 1.35, 0.0), vec3(6.5, 1.35, 4.5));
  float stepd = max(dais, max(abs(q.x) - (6.5 - st * 0.6), q.z - (4.5 - st * 0.75)));
  stepd = max(stepd, q.y - (st + 1.0) * 0.45);
  float d = stepd;
  // 옥좌: 높은 등받이(위가 뾰족하게 갈라짐), 팔걸이, 앉는 자리
  vec3 t = q - vec3(0.0, 2.7, -1.0);
  float back = sdBox(t - vec3(0.0, 7.0, -1.3), vec3(2.5, 7.0, 0.6));
  float notch = (t.y - 11.0) - abs(t.x) * 1.6;
  back = max(back, -max(-notch, abs(t.x) - 1.2));
  float horn = sdRoundCone(vec3(abs(t.x), t.y, t.z), vec3(2.2, 13.5, -1.3), vec3(3.3, 17.0, -1.3), 0.45, 0.05);
  back = min(back, horn);
  float seat = sdBox(t - vec3(0.0, 1.1, 0.3), vec3(2.3, 1.1, 1.6));
  float arms = sdBox(vec3(abs(t.x) - 2.5, t.y - 2.3, t.z - 0.3), vec3(0.45, 0.5, 1.8));
  d = min(d, min(min(back, seat), arms));
  return d;
}
float pilgrim(vec3 p) {
  vec3 b = p - vec3(0.75, 0.0, -5.0);
  if (length(b - vec3(0.0, 0.9, 0.0)) > 1.4) return length(b - vec3(0.0, 0.9, 0.0)) - 1.3;
  float robe = sdRobe(b, 1.55, 0.17, 0.32, 8.0, 0.025);
  robe = smin(robe, sdHood(b, vec3(0.0, 1.72, -0.02), 0.15), 0.05);
  // 끌리는 망토 자락
  robe = smin(robe, sdEllipsoid(b - vec3(0.0, 0.05, 0.45), vec3(0.32, 0.06, 0.6)), 0.1);
  return robe;
}

vec2 sdfDry(vec3 p) {
  vec2 r = vec2(column(p), 2.0);
  r = umin(r, vec2(throne(p), 3.0));
  r = umin(r, vec2(pilgrim(p), 4.0));
  return r;
}
vec2 sdf(vec3 p) { return umin(vec2(p.y, 1.0), sdfDry(p)); }

// ───── 빛 ─────
float softSh(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.3 + 0.3 * hash31(vec3(gl_FragCoord.xy, 7.0));
  for (int i = 0; i < 30; i++) {
    float h = sdfDry(ro + rd * t).x;
    res = min(res, 4.0 * h / t);
    t += clamp(h, 0.25, 4.0);
    if (res < 0.02 || t > 60.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
vec3 shade(vec3 p, vec3 n, vec3 V, vec3 alb, float rough, float spec, float shadowed) {
  vec3 sd = sunD();
  float sh = shadowed > 0.5 ? softSh(p + n * 0.05, sd) : 1.0;
  vec3 c = alb * GOLDC * 1.6 * max(dot(n, sd), 0.0) * sh;
  // 별빛: 위에서 내려오는 차가운 보랏빛
  c += alb * vec3(0.05, 0.045, 0.09) * (0.3 + 0.7 * max(n.y, 0.0));
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  c += GOLDC * 0.5 * fres * max(dot(n, sd) + 0.45, 0.0) * sh;
  c += GOLDC * spec * pow(max(dot(n, normalize(sd + V)), 0.0), mix(200.0, 12.0, rough)) * sh * 1.5;
  return c;
}

// 금 상감 무늬
float inlayFloor(vec3 p) {
  // 옥좌를 향해 뻗은 줄과 가로줄, 바퀴 같은 원
  float l1 = smoothstep(0.035, 0.0, abs(abs(p.x) - 2.9));
  float l2 = smoothstep(0.03, 0.0, abs(rep(p.z, CP))) * step(abs(p.x), 4.9);
  float l3 = smoothstep(0.04, 0.0, abs(p.x));
  vec2 c = vec2(p.x, rep(p.z + CP * 0.5, CP));
  float ring = smoothstep(0.035, 0.0, abs(length(c) - 1.7)) * step(abs(p.x), 2.6);
  return max(max(l1, l2 * 0.8), max(l3 * 0.5, ring)) * step(p.z, 16.0) * step(-25.0, p.z);
}

vec3 simpleShade(vec3 q, float id, vec3 rd) {
  vec2 e = vec2(0.02, -0.02);
  vec3 n = normalize(e.xyy * sdfDry(q + e.xyy).x + e.yyx * sdfDry(q + e.yyx).x + e.yxy * sdfDry(q + e.yxy).x + e.xxx * sdfDry(q + e.xxx).x);
  return shade(q, n, -rd, vec3(0.03, 0.028, 0.032), 0.3, 0.6, 0.0);
}
vec3 traceRefl(vec3 ro, vec3 rd, float t0) {
  float t = 0.05;
  vec3 col = vec3(-1.0);
  for (int i = 0; i < 110; i++) {
    vec3 q = ro + rd * t;
    vec2 h = sdfDry(q);
    if (h.x < 0.002 * t) {
      col = simpleShade(q, h.y, rd);
      break;
    }
    t += h.x * 0.85;
    if (t > 80.0) break;
  }
  if (col.x < 0.0) col = sky(rd);
  else col = mix(col, hazeCol(rd), 1.0 - exp(-(t + t0) * 0.018));
  return col;
}

Mat material(float id, vec3 p, vec3 n) {
  vec3 V = normalize(uCamPos - p);
  float tc = length(uCamPos - p);
  vec3 want;
  if (id < 1.5) {
    // 거울 같은 검은 대리석: 살짝 흐린 반사 + 금 상감
    vec3 wn = normalize(vec3((noise(p * 0.7) - 0.5) * 0.012, 1.0, (noise(p * 0.7 + 4.0) - 0.5) * 0.012));
    vec3 R = reflect(-V, wn);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(wn, V), 0.0), 5.0);
    vec3 refl = traceRefl(p + wn * 0.02, R, tc);
    float vein = smoothstep(0.08, 0.0, ridge(vec3(p.x * 0.15, 0.0, p.z * 0.15)) - 0.02) * 0.4;
    vec3 base = vec3(0.004, 0.004, 0.006) + vec3(0.02, 0.018, 0.02) * vein;
    float inl = inlayFloor(p);
    // 가까운 바닥은 반사가 약해 어둡다 (아래쪽은 UI가 덮는다)
    want = base + refl * mix(0.07, 1.0, fres) * (1.0 - inl * 0.6) * mix(0.35, 1.0, smoothstep(5.0, 16.0, tc));
    want += GOLDC * inl * (0.05 + 0.6 * pow(max(dot(reflect(-V, vec3(0.0, 1.0, 0.0)), sunD()), 0.0), 6.0));
  } else {
    vec3 alb = vec3(0.025, 0.023, 0.028);
    float rough = 0.25;
    float spec = 0.9;
    vec3 emi = vec3(0.0);
    if (id < 2.5) {
      // 흑요석 기둥: 금 띠에 상형 문자
      float band = step(abs(p.y - 4.6), 0.45);
      float a = atan(rep(p.z, CP), abs(p.x) - CX);
      vec2 g = vec2(a * 9.0, (p.y - 4.6) * 4.0 + 0.5);
      vec2 cg = floor(g);
      vec2 fg = fract(g) - 0.5;
      float gl = step(0.45, hash31(vec3(cg, 1.0))) * smoothstep(0.1, 0.05, abs(fg.x)) * step(abs(fg.y), 0.36);
      gl = max(gl, step(0.55, hash31(vec3(cg, 2.0))) * smoothstep(0.1, 0.05, abs(fg.y)) * step(abs(fg.x), 0.34));
      gl = max(gl, step(0.65, hash31(vec3(cg, 3.0))) * smoothstep(0.1, 0.05, abs(length(fg) - 0.24)));
      alb = mix(alb, vec3(0.35, 0.24, 0.08), band * (0.4 + 0.6 * gl));
      rough = mix(0.2, 0.35, band);
      spec = mix(0.8, 1.6, band);
      emi += GOLDC * 0.04 * band * gl;
    } else if (id < 3.5) {
      alb = vec3(0.02, 0.019, 0.024);
      rough = 0.3;
    } else {
      alb = vec3(0.02, 0.018, 0.016);
      rough = 0.8;
      spec = 0.1;
    }
    want = shade(p, n, V, alb, rough, spec, id > 3.5 ? 0.0 : 1.0) + emi;
  }
  want = applyFog(want, p);
  if (uP[0].x > 0.5) want = vec3(fract(id * 0.37), fract(id * 0.61), fract(id * 0.83));
  return Mat(vec3(0.0), 1.0, 0.0, undoFog(want, p), 0.0, 0.0, 0.0);
}

vec4 volume(vec3 p) {
  if (uP[0].x > 0.5) return vec4(0.0);
  // 별빛 먼지: 옥좌 쪽을 볼 때 금빛으로 번진다 (전방 산란)
  vec3 rd = normalize(p - uCamPos + vec3(0.0, 0.0, 1e-4));
  float ph = pow(max(dot(rd, sunD()), 0.0), 20.0);
  // 밀도는 매끈하게 (해 쪽은 빛이 세서 표본 흔들림이 얼룩으로 보인다)
  float dens = 0.0016 + 0.0012 * exp(-max(p.y, 0.0) / 8.0);
  vec3 L = vec3(0.01, 0.008, 0.025) + GOLDC * (0.015 + 0.5 * pow(max(dot(rd, sunD()), 0.0), 40.0));
  return vec4(L, dens);
}
`,
  };
}
