#version 300 es
// 코드 그림 작업실 — 부호 거리장(SDF)으로 만든 괴물을 젖은 살갗·역광·안개로 그리는 광선 추적기
// 레시피는 아래 RECIPE 표시 자리에 들어간다: vec2 sdf(vec3 p) 와 Mat material(float id, vec3 p, vec3 n) 를 반드시 정의.
precision highp float;

uniform vec2 uRes;
uniform int uScene;      // 0 = 투명 배경 스프라이트, 1 = 바닥·배경이 있는 견본, 2 = 세로 배경 그림
uniform float uSeed;

uniform vec3 uCamPos;
uniform vec3 uCamTarget;
uniform float uFov;      // 초점 거리 (클수록 망원)
uniform vec3 uKeyDir;    // 열쇠 빛 방향 (표면 → 빛). 뒤쪽 위에서 비추면 역광 테두리가 산다
uniform vec3 uKeyCol;
uniform vec3 uFillDir;
uniform vec3 uFillCol;
uniform vec3 uAmbCol;
uniform vec3 uRimCol;
uniform vec3 uFogCol;
uniform float uRim;
uniform float uGlow;
uniform float uExposure;
uniform float uEyeEmit;
uniform vec3 uPtPos;    // 점광원 (등불 등) — 색이 0이면 꺼짐
uniform vec3 uPtCol;

// 레시피용 자료 배열
uniform vec4 uA[64];   // 덩어리 (xyz, 반지름)
uniform int uAN;
uniform vec4 uB[160];  // 사슬 (촉수·다리): xyz, 반지름 — 반지름 0 이하가 끊는 표시
uniform int uBN;
uniform vec4 uE[48];   // 눈 (xyz, 반지름)
uniform int uEN;
uniform vec4 uG[48];   // 눈의 시선 (xyz) + 종류 (w: 0 초록 1 호박 2 창백 3 핏빛 4 보라 5 금, +10 = 둥근 동공)
uniform int uGN;
uniform vec4 uL[24];   // 빛나는 점 (xyz, 크기) — 형체 없이 빛만 (두건 속 눈, 등불 등)
uniform int uLN;
uniform vec4 uLC[24];  // 빛나는 점 색 (rgb, 세기)
uniform int uLCN;
uniform vec4 uP[16];   // 레시피 자유 매개변수
uniform int uPN;

out vec4 fragColor;

struct Mat {
  vec3 alb;    // 바탕색 (어둡게: 0.01~0.2)
  float rough; // 0 매끈 ~ 1 거침
  float spec;  // 반사 세기
  vec3 emi;    // 스스로 내는 빛
  float irid;  // 무지갯빛 막 0~1
  float sss;   // 빛이 살 속으로 스미는 정도 0~1
  float wet;   // 젖은 반사 0~1
};

Mat mat(vec3 alb, float rough, float spec, float wet) {
  return Mat(alb, rough, spec, vec3(0.0), 0.0, 0.0, wet);
}

// ───────── 잡음 ─────────
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float hash11(float n) { return fract(sin(n) * 43758.5453123); }
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1, 0, 0)), f.x), mix(hash31(i + vec3(0, 1, 0)), hash31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0, 0, 1)), hash31(i + vec3(1, 0, 1)), f.x), mix(hash31(i + vec3(0, 1, 1)), hash31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
float fbm3(vec3 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
// 주름·핏줄용 골짜기 잡음 (0 근처가 골)
float ridge(vec3 p) { return abs(noise(p) - 0.5) * 2.0; }

// ───────── 도형 ─────────
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
vec2 umin(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
/** 부드럽게 붙이되 재질은 가까운 쪽 */
vec2 usmin(vec2 a, vec2 b, float k) {
  float d = smin(a.x, b.x, k);
  return vec2(d, a.x < b.x ? a.y : b.y);
}
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdRoundBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}
float sdCylinder(vec3 p, float h, float r) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float sdCappedCone(vec3 p, float h, float r1, float r2) {
  vec2 q = vec2(length(p.xz), p.y);
  vec2 k1 = vec2(r2, h);
  vec2 k2 = vec2(r2 - r1, 2.0 * h);
  vec2 ca = vec2(q.x - min(q.x, (q.y < 0.0) ? r1 : r2), abs(q.y) - h);
  vec2 cb = q - k1 + k2 * clamp(dot(k1 - q, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}
/** 각도 반복 (이빨·촉수 고리): p.xz를 n등분한 조각 하나로 접는다 */
vec3 polarRep(vec3 p, float n) {
  float an = 6.2831853 / n;
  float a = atan(p.z, p.x) + an * 0.5;
  a = mod(a, an) - an * 0.5;
  float r = length(p.xz);
  return vec3(r * cos(a), p.y, r * sin(a));
}

// ───────── 부품 ─────────
/** 덩어리 배열(uA)을 녹여 붙인 살덩이 */
float blobs(vec3 p, float k) {
  float d = 1e5;
  for (int i = 0; i < 64; i++) {
    if (i >= uAN) break;
    d = smin(d, length(p - uA[i].xyz) - uA[i].w, k);
  }
  return d;
}
/** 사슬 배열(uB)의 촉수·다리. k: 몸과 붙는 부드러움 */
float chains(vec3 p, float k) {
  float d = 1e5;
  for (int i = 0; i < 159; i++) {
    if (i + 1 >= uBN) break;
    vec4 a = uB[i];
    vec4 b = uB[i + 1];
    if (a.w <= 0.0 || b.w <= 0.0) continue;
    d = smin(d, sdRoundCone(p, a.xyz, b.xyz, a.w, b.w), k);
  }
  return d;
}
/**
 * 두건 달린 로브 (바닥 y=0 기준, 높이 h). 아래로 퍼지고 주름이 진다.
 * 반환: x 거리. 머리·팔은 레시피에서 따로.
 */
float sdRobe(vec3 p, float h, float rTop, float rBot, float folds, float foldAmp) {
  float y = clamp(p.y / h, 0.0, 1.0);
  float r = mix(rBot, rTop, pow(y, 0.7));
  float ang = atan(p.z, p.x);
  r += foldAmp * (1.0 - y * 0.8) * (sin(ang * folds + y * 4.0) * 0.6 + sin(ang * folds * 2.3 + 1.7) * 0.4);
  float d = (length(p.xz) - r) * 0.7;
  return max(d, max(-p.y, p.y - h));
}
/** 두건: 앞이 뚫린 껍데기. c = 머리 중심, r = 크기 */
float sdHood(vec3 p, vec3 c, float r) {
  vec3 q = p - c;
  float shell = abs(sdEllipsoid(q, vec3(r * 0.95, r * 1.15, r))) - r * 0.09;
  float face = sdEllipsoid(q - vec3(0.0, -r * 0.1, r * 0.75), vec3(r * 0.62, r * 0.8, r * 0.7));
  shell = max(shell, -face);
  // 뾰족한 꼭대기
  float tip = sdRoundCone(q, vec3(0.0, r * 0.6, -r * 0.2), vec3(0.0, r * 1.45, -r * 0.65), r * 0.55, r * 0.05);
  return smin(shell, tip, r * 0.3);
}

// ───────── 레시피 ─────────
/*RECIPE*/

// x: 거리, y: 재질 (0 바닥, 1~98 레시피 재질, 99 완전한 어둠, 100+ 눈)
vec2 map(vec3 p) {
  vec2 r = sdf(p);
  for (int i = 0; i < 48; i++) {
    if (i >= uEN) break;
    float de = length(p - uE[i].xyz) - uE[i].w;
    if (de < r.x) r = vec2(de, 100.0 + float(i));
  }
#ifndef NO_GROUND
  if (uScene == 1) {
    float g = p.y + 0.02 * noise(p * 3.0);
    if (g < r.x) r = vec2(g, 0.0);
  }
#endif
  return r;
}

vec3 calcNormal(vec3 p, float t) {
  vec2 e = vec2(0.0008 + 0.0004 * t, 0.0);
  return normalize(vec3(map(p + e.xyy).x - map(p - e.xyy).x, map(p + e.yxy).x - map(p - e.yxy).x, map(p + e.yyx).x - map(p - e.yyx).x));
}
float calcAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 6; i++) {
    float h = 0.02 + 0.14 * float(i);
    float d = map(p + h * n).x;
    occ += (h - d) * sca;
    sca *= 0.8;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}
float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  for (int i = 0; i < 56; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.02, 0.3);
    if (res < 0.002 || t > 10.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 eyeColor(float kind) {
  float k = mod(kind, 10.0);
  if (k < 0.5) return vec3(0.55, 1.0, 0.38);
  if (k < 1.5) return vec3(1.0, 0.62, 0.16);
  if (k < 2.5) return vec3(0.78, 0.92, 1.0);
  if (k < 3.5) return vec3(1.0, 0.2, 0.12);
  if (k < 4.5) return vec3(0.75, 0.4, 1.0);
  return vec3(1.0, 0.85, 0.4);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 shadeMat(Mat m, vec3 p, vec3 n, vec3 rd, float ao, float sh) {
  vec3 V = -rd;
  vec3 L1 = normalize(uKeyDir);
  vec3 L2 = normalize(uFillDir);
  float nl1 = dot(n, L1);
  float dif1 = max(nl1, 0.0) * sh;
  float wrap = max((nl1 + m.sss) / (1.0 + m.sss), 0.0) * mix(sh, 1.0, m.sss * 0.6);
  float dif2 = max(dot(n, L2), 0.0);
  vec3 H1 = normalize(L1 + V);
  vec3 H2 = normalize(L2 + V);
  float sp = mix(160.0, 6.0, m.rough);
  float sp1 = pow(max(dot(n, H1), 0.0), sp) * sh;
  float sp2 = pow(max(dot(n, H2), 0.0), sp * 0.7);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 irid = 0.5 + 0.5 * cos(6.2831 * (fres * 1.4 + n.y * 0.25 + noise(p * 2.0) * 0.5 + vec3(0.0, 0.33, 0.67)));
  vec3 st = mix(vec3(1.0), irid, m.irid);
  vec3 col = m.alb * ((m.sss > 0.0 ? wrap : dif1) * uKeyCol + dif2 * uFillCol + uAmbCol * ao);
  // 살 속으로 스민 빛 (역광일 때 가장자리가 붉게/푸르게 비친다)
  col += m.alb * m.sss * 2.0 * pow(max(dot(V, -L1), 0.0), 3.0) * uKeyCol * (0.3 + 0.7 * fres);
  col += (sp1 * uKeyCol + sp2 * uFillCol * 0.6) * m.spec * st * (0.25 + 0.75 * mix(1.0, fres, 0.4));
  vec3 R = reflect(rd, n);
  vec3 env = uFogCol * 1.3 * smoothstep(-0.2, 0.9, R.y) + uKeyCol * 0.7 * pow(max(dot(R, L1), 0.0), 22.0) + uFillCol * 0.4 * pow(max(dot(R, L2), 0.0), 14.0);
  col += env * m.wet * st * (0.05 + 0.95 * fres) * (0.3 + 0.7 * ao);
  col += fres * irid * m.irid * 0.06 * ao;
  col += pow(fres, 1.6) * max(nl1 + 0.4, 0.0) * uRimCol * uRim * (0.4 + 0.6 * sh);
  // 점광원: 가까울수록 밝다 (그림자 없음)
  vec3 lp = uPtPos - p;
  float ld = length(lp);
  float pdif = max(dot(n, lp / ld), 0.0) / (1.0 + ld * ld * 6.0);
  col += m.alb * pdif * uPtCol * (m.sss > 0.0 ? 1.4 : 1.0);
  col += pow(max(dot(n, normalize(lp / ld + V)), 0.0), sp) * m.spec * uPtCol * 0.3 / (1.0 + ld * ld * 6.0);
  col *= mix(0.3, 1.0, ao);
  return col + m.emi;
}

vec3 shadeEye(int i, vec3 p, vec3 n, vec3 rd, float sh) {
  vec3 c = uE[i].xyz;
  vec3 g = normalize(uG[i].xyz);
  float kind = uG[i].w;
  vec3 q = normalize(p - c);
  float a = acos(clamp(dot(q, g), -1.0, 1.0));
  vec3 up = normalize(cross(g, vec3(1.0, 0.0, 0.0)));
  vec3 side = normalize(cross(g, up));
  float u = dot(q, side);
  float irisR = 0.75;
  float iris = smoothstep(irisR, irisR - 0.08, a);
  float pupil = kind >= 10.0 ? smoothstep(0.32, 0.27, a) : smoothstep(0.075, 0.035, abs(u)) * step(a, irisR * 0.92);
  vec3 ic = eyeColor(kind);
  float fib = 0.55 + 0.45 * noise(vec3(atan(dot(q, up), u) * 6.0, a * 18.0, float(i)));
  vec3 emi = ic * ic * fib * (1.25 - a / irisR) * uEyeEmit * iris * (1.0 - pupil);
  vec3 V = -rd;
  vec3 L1 = normalize(uKeyDir);
  vec3 L2 = normalize(uFillDir);
  vec3 col = vec3(0.05, 0.035, 0.03) * (max(dot(n, L1), 0.0) * sh * uKeyCol + max(dot(n, L2), 0.0) * uFillCol + 0.05) * (1.0 - iris) + emi;
  col += pow(max(dot(n, normalize(L2 + V)), 0.0), 220.0) * 2.5 + pow(max(dot(n, normalize(L1 + V)), 0.0), 200.0) * 1.6 * sh;
  return col;
}

#ifndef HAS_BG
vec3 background(vec3 rd) {
  vec3 L1 = normalize(uKeyDir);
  vec3 bg = mix(vec3(0.0), uFogCol * 0.5, smoothstep(-0.3, 0.6, rd.y)) * 0.6;
  bg += uFogCol * 0.9 * pow(max(dot(rd, normalize(vec3(-L1.x, L1.y * 0.25, -L1.z))), 0.0), 5.0);
  return bg;
}
#endif

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec3 ro = uCamPos;
  vec3 ww = normalize(uCamTarget - ro);
  vec3 uu = normalize(cross(ww, vec3(0, 1, 0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + uFov * ww);

  vec3 bg = background(rd);

  float t = 0.2;
  float m = -1.0;
  for (int i = 0; i < 300; i++) {
    vec3 p = ro + rd * t;
    vec2 h = map(p);
    if (abs(h.x) < 0.0006 * t) {
      m = h.y;
      break;
    }
    t += h.x * 0.6;
    if (t > 60.0) break;
  }

  vec3 col = bg;
  float alpha = 0.0;
  if (m >= 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p, t);
    float ao = calcAO(p, n);
    float sh = softShadow(p + n * 0.01, normalize(uKeyDir));
    if (m < 0.5) {
      vec3 alb = vec3(0.025, 0.03, 0.032) * (0.6 + 0.6 * fbm3(p * 3.0));
      // 견본용 바닥: 테두리광·환경 반사 없이 어둡게
      vec3 lp = uPtPos - p;
      float ld = length(lp);
      col = alb * (max(dot(n, normalize(uKeyDir)), 0.0) * sh * uKeyCol * 0.5 + uAmbCol * ao + uPtCol * max(dot(n, lp / ld), 0.0) / (1.0 + ld * ld * 6.0));
    } else if (m > 98.5 && m < 99.5) {
      col = vec3(0.0); // 99 = 빛을 먹는 어둠 (두건 속 얼굴 등)
    } else if (m < 99.5) {
      col = shadeMat(material(m, p, n), p, n, rd, ao, sh);
    } else {
      col = shadeEye(int(m - 100.0 + 0.5), p, n, rd, sh);
    }
    alpha = 1.0;
    float fog = 1.0 - exp(-0.0015 * t * t);
    col = mix(col, bg, uScene > 0 ? fog : 0.0);
  }

#ifdef HAS_OVERLAY
  // 레시피 덧칠: (색, 불투명도) — 예: 광선과 구의 교차로 그린 얇은 막
  {
    vec4 ov = overlay(ro, rd, m >= 0.0 ? t : 1e5);
    col += ov.rgb;
    alpha = max(alpha, ov.a);
  }
#endif

#ifdef HAS_VOLUME
  // 부피 (성운·안개·빛): 카메라에서 맞은 곳까지 밀도를 쌓는다
  {
    float tEnd = m >= 0.0 ? t : VOLUME_FAR;
    float dt = tEnd / float(VOLUME_STEPS);
    float tr = 1.0;
    vec3 acc = vec3(0.0);
    float jitter = hash31(vec3(gl_FragCoord.xy, uSeed));
    for (int i = 0; i < VOLUME_STEPS; i++) {
      vec3 q = ro + rd * (dt * (float(i) + jitter));
      vec4 v = volume(q);
      float a = 1.0 - exp(-v.w * dt);
      acc += tr * a * v.rgb;
      tr *= 1.0 - a;
      if (tr < 0.02) break;
    }
    col = col * tr + acc;
    alpha = 1.0 - (1.0 - alpha) * tr;
  }
#endif

  // 눈과 빛나는 점의 빛 번짐
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    if (i >= uEN) break;
    vec3 c = uE[i].xyz;
    float along = dot(c - ro, rd);
    if (along < 0.0) continue;
    float dperp = length(c - ro - rd * along);
    float vis = (m < 0.0 || t > along - uE[i].w * 1.2) ? 1.0 : 0.2;
    glow += eyeColor(uG[i].w) * exp(-dperp / (uE[i].w * 0.9)) * uGlow * vis;
  }
  for (int i = 0; i < 24; i++) {
    if (i >= uLN) break;
    vec3 c = uL[i].xyz;
    float along = dot(c - ro, rd);
    if (along < 0.0) continue;
    float dperp = length(c - ro - rd * along);
    float vis = (m < 0.0 || t > along - uL[i].w) ? 1.0 : 0.15;
    float k = exp(-dperp / uL[i].w);
    glow += uLC[i].rgb * uLC[i].w * (k * 0.6 + pow(k, 6.0) * 2.0) * vis;
  }
  col += glow;
  alpha = max(alpha, clamp(dot(glow, vec3(0.33)) * 1.6, 0.0, 1.0));

  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  if (uScene > 0) {
    vec2 q = gl_FragCoord.xy / uRes;
    col *= 0.35 + 0.65 * pow(16.0 * q.x * q.y * (1.0 - q.x) * (1.0 - q.y), 0.3);
    alpha = 1.0;
  }
  col += (hash31(vec3(gl_FragCoord.xy, uSeed)) - 0.5) * 0.03 * alpha;
  fragColor = vec4(col, alpha);
}
