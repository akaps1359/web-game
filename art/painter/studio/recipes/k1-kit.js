// 1층 보스·정예 레시피 공용 도구 (등대지기·두목·어부·선장·도살자·집행자·게·사냥꾼·망령).
// 레시피 파일이 아니다 (render.htm?r= 로 열지 않는다).
//
// 왜: 손가락·팔다리를 셰이더 안에 상수 반복문으로 쓰면 ANGLE(D3D) 컴파일러가 map()을 부르는 곳마다
// 펼쳐 넣어 컴파일이 수십 초~분 단위로 걸린다. 그래서 사슬을 자바스크립트에서 계산해 uB에 넣고,
// 셰이더는 평평한 동적 반복문 하나로 그린다 (중첩 반복문은 인텔 GPU에서 극도로 느려진다).
//
// 배치:
//   uB  무리마다 머리 항목 [마디 k, 재질 + 몸과 녹는 정도(소수부), 무리 끝 번호, -(무리 번호 + 1)]
//       그 뒤로 사슬 점 [x,y,z,반지름], 반지름 0 = 끊김
//   uA  [0, nG) = 무리별 경계 구 [x,y,z,r],  [nG, nG+nBlob) = 살덩이 구
//   uP  uP[15] = [무리 수, 살덩이 시작, 살덩이 끝, uB 항목 수],  uP[0..14] = 레시피 자유

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => mul(a, 1 / (len(a) || 1));
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mix = (a, b, t) => a + (b - a) * t;

/** 3차 베지어 점 */
export function bez(P, t) {
  const m = 1 - t;
  return [0, 1, 2].map((j) => m * m * m * P[0][j] + 3 * m * m * t * P[1][j] + 3 * m * t * t * P[2][j] + t * t * t * P[3][j]);
}

/** 결정적 난수 */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Skel {
  constructor() {
    this.B = [];
    this.groups = [];
    this.blobs = [];
  }
  /** 무리: mat 재질 id, k 마디끼리 녹는 정도, blend 이미 그린 몸과 녹는 정도(0~0.95) */
  group(mat, k, blend, fn) {
    const head = this.B.length;
    this.B.push([k, mat + Math.min(blend, 0.95), 0, -(this.groups.length + 1)]);
    fn(this);
    const end = this.B.length;
    const pts = this.B.slice(head + 1, end).filter((p) => p[3] > 0);
    if (!pts.length) {
      this.B.length = head;
      return;
    }
    this.B[head][2] = end;
    let lo = [1e9, 1e9, 1e9];
    let hi = [-1e9, -1e9, -1e9];
    for (const p of pts) {
      for (let j = 0; j < 3; j++) {
        lo[j] = Math.min(lo[j], p[j] - p[3]);
        hi[j] = Math.max(hi[j], p[j] + p[3]);
      }
    }
    const c = mul(add(lo, hi), 0.5);
    let r = 0;
    for (const p of pts) r = Math.max(r, len(sub(p, c)) + p[3]);
    this.groups.push([...c, r + 0.01]);
  }
  /** 점 목록을 사슬 하나로 */
  chain(pts) {
    for (const p of pts) this.B.push([p[0], p[1], p[2], p[3]]);
    this.B.push([0, 0, 0, 0]);
  }
  /** 베지어를 따라 가늘어지는 사슬 */
  curve(P, n, r0, r1, pow = 1, wob = null) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let q = bez(P, t);
      if (wob) q = add(q, wob(t, i));
      pts.push([...q, r1 + (r0 - r1) * Math.pow(1 - t, pow)]);
    }
    this.chain(pts);
  }
  /**
   * 앙상한 손: c 손등 중심, f 손가락 방향, u 손등이 보는 방향, len 손가락 길이, curl 굽힘(라디안), r 굵기, spread 벌어짐
   * 손바닥 사슬 둘 + 손가락 4 + 엄지
   */
  hand(c, f, u, { len: L = 0.16, curl = 0.8, r = 0.014, spread = 0.18, palm = 1.0, thumb = 1.0, nails = 0, fingers = 4 } = {}) {
    f = norm(f);
    const s = norm(cross(f, u));
    u = norm(cross(s, f));
    for (const o of [-0.8, 0.8]) {
      this.chain([
        [...add(c, add(mul(f, -L * 0.35 * palm), mul(s, o * r * 1.0))), r * 1.9],
        [...add(c, add(mul(f, L * 0.22 * palm), mul(s, o * r * 1.6))), r * 1.75],
      ]);
    }
    for (let i = 0; i < fingers; i++) {
      const o = fingers === 4 ? i - 1.5 : (i - (fingers - 1) / 2) * (3 / Math.max(1, fingers - 1));
      const fl = L * (1 - Math.abs(o + 0.4) * 0.13);
      const k = add(c, add(mul(f, L * 0.3 * palm), mul(s, o * r * 2.1)));
      const dir = (a) => norm(add(add(mul(f, Math.cos(a)), mul(u, -Math.sin(a))), mul(s, o * spread)));
      const m1 = add(k, mul(dir(curl * 0.45), fl * 0.48));
      const m2 = add(m1, mul(dir(curl * 1.15), fl * 0.32));
      const e = add(m2, mul(dir(curl * 1.8), fl * 0.24 + nails));
      this.chain([
        [...k, r * 1.05],
        [...m1, r * 0.92],
        [...m2, r * 0.75],
        [...e, r * 0.32],
      ]);
    }
    if (thumb > 0) {
      const tk = add(c, add(mul(f, -L * 0.12 * palm), mul(s, -r * 3.0)));
      const tm = add(tk, mul(norm(add(add(f, mul(s, -0.9)), mul(u, -0.5))), L * 0.32 * thumb));
      const te = add(tm, mul(norm(add(add(f, mul(s, -0.2)), mul(u, -0.7))), L * 0.25 * thumb));
      this.chain([
        [...tk, r * 1.2],
        [...tm, r * 0.85],
        [...te, r * 0.35],
      ]);
    }
  }
  /** 살덩이 구 */
  blob(x, y, z, r) {
    this.blobs.push([x, y, z, r]);
  }
  /** 셰이더 배열로 묶는다. params: uP[0..] 레시피 자유 */
  pack(params = []) {
    if (this.groups.length > 24) throw new Error('무리 24개 초과');
    this.B.push([0, 0, 0, 0]);
    if (this.B.length > 160) throw new Error(`사슬 ${this.B.length} > 160`);
    const uA = this.groups.concat(this.blobs);
    if (uA.length > 64) throw new Error('uA 초과');
    const uP = [];
    for (let i = 0; i < 16; i++) uP.push([0, 0, 0, 0]);
    params.forEach((p, i) => (uP[i] = p));
    uP[15] = [this.groups.length, this.groups.length, this.groups.length + this.blobs.length, this.B.length - 1];
    return { uB: this.B, uA, uP };
  }
}

/**
 * 컴파일 가속: 레시피 glsl 맨 끝(material 뒤)에 붙인다.
 * D3D(ANGLE) 컴파일러는 코어의 상수 반복문(그림자 56번, AO 6번, 눈 48개…)을 펼쳐 map()=sdf()를 수십 번 복사해 넣어
 * 컴파일이 분 단위로 걸린다. 여기서 코어와 똑같은 map()·main()을 시작값이 동적인 반복문으로 다시 정의하고,
 * 코어의 map/main 은 매크로로 이름을 바꿔 아무도 부르지 않게 한다 (죽은 코드로 버려진다).
 * 그림 결과는 코어와 같다 (법선만 사면체 차분). core.glsl 의 main 이 바뀌면 여기도 맞춰야 한다.
 */
export const KIT_MAIN = /* glsl */ `
vec3 shadeMat(Mat m, vec3 p, vec3 n, vec3 rd, float ao, float sh);
vec3 shadeEye(int i, vec3 p, vec3 n, vec3 rd, float sh);
vec3 eyeColor(float kind);
vec3 aces(vec3 x);
vec3 background(vec3 rd);
#define KZ min(uEN, 0)
vec2 map(vec3 p) {
  vec2 r = sdf(p);
  for (int i = KZ; i < uEN; i++) {
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
vec3 kNormal(vec3 p, float t) {
  float h = 0.0008 + 0.0004 * t;
  vec3 n = vec3(0.0);
  for (int i = KZ; i < 4; i++) {
    vec3 e = 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
    n += e * map(p + e * h).x;
  }
  return normalize(n);
}
float kAO(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = KZ; i < 6; i++) {
    float h = 0.02 + 0.14 * float(i);
    float d = map(p + h * n).x;
    occ += (h - d) * sca;
    sca *= 0.8;
  }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}
float kShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.03;
  for (int i = KZ; i < 56; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 9.0 * h / t);
    t += clamp(h, 0.02, 0.3);
    if (res < 0.002 || t > 10.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
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
  for (int i = KZ; i < 300; i++) {
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
    vec3 n = kNormal(p, t);
    float ao = kAO(p, n);
    float sh = kShadow(p + n * 0.01, normalize(uKeyDir));
    if (m < 0.5) {
      vec3 alb = vec3(0.025, 0.03, 0.032) * (0.6 + 0.6 * fbm3(p * 3.0));
      vec3 lp = uPtPos - p;
      float ld = length(lp);
      col = alb * (max(dot(n, normalize(uKeyDir)), 0.0) * sh * uKeyCol * 0.5 + uAmbCol * ao + uPtCol * max(dot(n, lp / ld), 0.0) / (1.0 + ld * ld * 6.0));
    } else if (m > 98.5 && m < 99.5) {
      col = vec3(0.0);
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
  {
    vec4 ov = overlay(ro, rd, m >= 0.0 ? t : 1e5);
    col += ov.rgb;
    alpha = max(alpha, ov.a);
  }
#endif
#ifdef HAS_VOLUME
  {
    float tEnd = m >= 0.0 ? t : VOLUME_FAR;
    float dt = tEnd / float(VOLUME_STEPS);
    float tr = 1.0;
    vec3 acc = vec3(0.0);
    float jitter = hash31(vec3(gl_FragCoord.xy, uSeed));
    for (int i = KZ; i < VOLUME_STEPS; i++) {
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
  vec3 glow = vec3(0.0);
  for (int i = KZ; i < uEN; i++) {
    vec3 c = uE[i].xyz;
    float along = dot(c - ro, rd);
    if (along < 0.0) continue;
    float dperp = length(c - ro - rd * along);
    float vis = (m < 0.0 || t > along - uE[i].w * 1.2) ? 1.0 : 0.2;
    glow += eyeColor(uG[i].w) * exp(-dperp / (uE[i].w * 0.9)) * uGlow * vis;
  }
  for (int i = KZ; i < uLN; i++) {
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
#define main kCoreMain
#define map kCoreMap
`;

/** 셰이더 쪽 도구: 레시피 glsl 앞에 붙인다 */
export const KIT_GLSL = /* glsl */ `
// 반지름이 선형으로 변하는 캡슐 (둥근 원뿔 근사, 싸다)
float segD(vec3 p, vec4 a, vec4 b) {
  vec3 pa = p - a.xyz;
  vec3 ba = b.xyz - a.xyz;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - mix(a.w, b.w, h);
}
vec2 skelFlush(vec2 r, float d, float mw) {
  float kb = fract(mw);
  if (kb > 0.001) return usmin(r, vec2(d, floor(mw)), kb);
  return d < r.x ? vec2(d, floor(mw)) : r;
}
// 사슬 무리 전부를 r에 합친다 (평평한 동적 반복 하나)
vec2 skel(vec3 p, vec2 r) {
  int n = int(uP[15].w + 0.5);
  float d = 1e5;
  float k = 0.02;
  float mw = 1.0;
  for (int i = 0; i < n; i++) {
    vec4 a = uB[i];
    if (a.w < 0.0) {
      r = skelFlush(r, d, mw);
      d = 1e5;
      k = a.x;
      mw = a.y;
      vec4 bs = uA[int(-a.w - 0.5)];
      if (length(p - bs.xyz) - bs.w > r.x + fract(mw)) i = int(a.z + 0.5) - 1;
      continue;
    }
    vec4 b = uB[i + 1];
    if (a.w > 0.0 && b.w > 0.0) {
      float sd = segD(p, a, b);
      d = k > 0.0001 ? smin(d, sd, k) : min(d, sd);
    }
  }
  return skelFlush(r, d, mw);
}
// 살덩이 구 (uA 뒤쪽)
float blobR(vec3 p, float k) {
  int b0 = int(uP[15].y + 0.5);
  int b1 = int(uP[15].z + 0.5);
  float d = 1e5;
  for (int j = b0; j < b1; j++) {
    d = smin(d, length(p - uA[j].xyz) - uA[j].w, k);
  }
  return d;
}
`;
