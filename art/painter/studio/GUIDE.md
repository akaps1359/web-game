# 코드 그림 작업실 안내 (art/painter/studio)

몬스터·배경 그림을 **코드로** 그린다. GLSL 광선 추적(부호 거리장, SDF)으로 3D 형체를 만들고, 젖은 살갗·역광·안개·빛나는 눈으로 어둡고 무서운 분위기를 낸다. AI 이미지나 외부 그림은 쓰지 않는다.

## 돌리는 법
1. 개발 서버(Vite, http://localhost:8642)가 떠 있어야 한다.
2. 브라우저로 `http://localhost:8642/art/painter/studio/render.htm?r=<레시피>&mode=<모드>` 를 연다.
   - `mode=sprite` (기본): 투명 배경, 형체를 찾아 바닥에 맞추고 크기를 맞춘 게임용 1024² 그림.
   - `mode=sample`: 바닥과 배경이 있는 견본 (확인용).
   - `mode=bg`: 세로 배경 1080×1920 (레시피가 장면 전체를 그림).
   - `seed=2` 로 무작위 배치를 바꿀 수 있다. `ss=1.5`(기본)는 초과 표본 배율.
3. 다 그려지면 `window.__done === true` (오류면 `window.__error`에 셰이더 오류와 해당 줄).
   - 스프라이트가 화면 밖으로 잘렸으면 `window.__clipped === true` → 카메라를 뒤로 물린다.
4. 저장: 페이지에서 `await window.save('<id>', 'art')` → `art/incoming/<id>.png`. 견본은 `window.save('<이름>', 'sample')` → `sim/out/samples/`.
5. 게임에 넣기: `npm run art` → `public/art/enemies/<id>.webp` (배경은 `public/art/bg/<id>.webp`). 개발 서버가 자동으로 목록을 갱신한다.
   - 파일 이름 = **적 id** (src/content의 `id`). 변신 형태는 `<id>@2`, `<id>@3` (form 1이 @2). 배경은 `bg-title`, `bg-haven`, `bg-act1`~`bg-act5`.
6. 확인: 저장된 PNG를 직접 보고(Read), **작게 줄여서도** 본다 — 게임에서는 적이 폰 화면에서 150~300px 정도로 보인다. 실루엣과 빛이 작은 크기에서 읽혀야 한다.
   - 줄여 보기: `ffmpeg -v error -y -i art/incoming/<id>.png -vf "scale=256:-1" sim/out/samples/<id>-small.png`

브라우저 탭은 **자기 탭만** 쓴다 (다른 작업자도 같은 브라우저를 쓴다). 렌더 한 장은 보통 1~10초. 20초가 넘으면 SDF를 단순하게.

## 레시피 구조 (recipes/<id>.js)
```js
export default function ({ seed, mode }) {
  return {
    preset: 'act1',                 // 층별 조명·색 (presets.js): act1~act5
    cam: { pos: [x, y, z], target: [x, y, z], fov: 1.8 },   // 카메라는 +z 쪽에서 원점을 본다
    light: { ... },                 // 프리셋 일부 덮어쓰기: key, keyCol, fill, fillCol, amb, rimCol, rim, fog, glow, exposure, eyeEmit, pt(점광원 위치), ptCol
    frame: { fill: 0.9, bottom: 0.025 },  // 스프라이트 자동 구도 (선택)
    arrays: { uA, uB, uE, uG, uL, uLC, uP },  // 아래 참고 (각 원소는 [x, y, z, w])
    glsl: `... vec2 sdf(vec3 p) ...  Mat material(float id, vec3 p, vec3 n) ...`,
  };
}
```
- 좌표: 바닥 y=0, 형체는 원점 근처에서 **카메라(+z) 쪽을 향해** 선다. 사람 크기 ≈ 1.7, 큰 괴물 3~4.
- `sdf(p)`는 `vec2(거리, 재질 id)`를 돌려준다. 재질 id: 1~98 = 레시피 재질(`material()`에서 정의), **99 = 빛을 먹는 완전한 어둠**(두건 속 얼굴, 아가리 안), 100+ = 눈(자동).
- `material()`은 `Mat(alb, rough, spec, emi, irid, sss, wet)`:
  - `alb` 바탕색 — **어둡게** (0.01~0.25). 밝은 건 빛나는 부분뿐.
  - `rough` 0 매끈~1 거침, `spec` 반사 세기, `emi` 스스로 내는 빛, `irid` 무지갯빛 기름막, `sss` 빛이 살 속으로 스밈(창백한 살갗·막·촉수), `wet` 젖은 반사.
  - 간단히 `mat(alb, rough, spec, wet)`.
- 배열 (셰이더 uniform):
  - `uA` 덩어리 [x,y,z,반지름] → `blobs(p, k)` 로 녹여 붙인 살덩이 (최대 64).
  - `uB` 사슬 [x,y,z,반지름], 반지름 0이면 끊김 → `chains(p, k)` 촉수·다리·꼬리·탯줄 (최대 160).
  - `uE` 눈 [x,y,z,반지름] + `uG` 시선 [dx,dy,dz,종류] — 형체 위의 진짜 눈알 (최대 48). 종류: 0 초록, 1 호박, 2 창백, 3 핏빛, 4 보라, 5 금, +10 = 둥근 동공(아니면 세로 동공).
  - `uL` 빛나는 점 [x,y,z,크기] + `uLC` 색 [r,g,b,세기] — 형체 없는 빛 (두건 속 눈빛, 등불 불꽃, 떠도는 불티) (최대 24).
  - `uP` 자유 매개변수 (최대 16).
- 쓸 수 있는 함수 (core.glsl): `noise fbm fbm3 ridge hash31 rot smin smax umin usmin sdSphere sdEllipsoid sdBox sdRoundBox sdCapsule sdRoundCone sdTorus sdCylinder sdCappedCone polarRep blobs chains sdRobe sdHood`.
- 선택 기능 (`#define`):
  - `NO_GROUND` 견본에서 바닥을 뺀다 (떠 있는 존재, 우주).
  - `HAS_VOLUME` + `VOLUME_STEPS` + `VOLUME_FAR` + `vec4 volume(vec3 p)` → (빛 rgb, 밀도): 안개·성운·연기·오라.
  - `HAS_OVERLAY` + `vec4 overlay(vec3 ro, vec3 rd, float tHit)` → 얇은 막·후광 같은 덧칠 (분석적으로).
  - `HAS_BG` + `vec3 background(vec3 rd)` → 배경. `uScene`: 0 스프라이트(배경은 `vec3(0)`을 돌려줄 것), 1 견본, 2 세로 배경 그림(`mode=bg`).
- 배경 그림(`mode=bg`, 1080×1920): 장면 전체(벽·바닥·하늘·안개)를 `sdf`/`background`/`volume`으로 그린다. 바닥(y=0)은 레시피가 직접 만든다(자동 바닥은 견본 모드만). 게임에서 **아래 40%는 UI가 덮으니** 어둡고 단순하게, 시선을 끄는 것은 위쪽 절반에. 천천히 확대·이동(켄 번스)되므로 가장자리에 여유를 둔다.
- 본보기: `recipes/initiate.js` (사람형: 굽은 몸·로브·두건·마른 손·소품·점광원), `recipes/star-fetus.js` (우주형: 막·성운·빛나는 탯줄), `recipes/shoggoth.js` (덩어리+촉수+수많은 눈, 다른 레시피가 가져다 쓰는 공용 빌더 포함).

## 그림 방향 — "초딩 그림"처럼 보이면 실패
사용자 요청: 몬스터가 **실사에 가깝거나 공포스럽고 신비롭고 위대해야** 한다. 귀엽거나 장난감 같으면 안 된다.
- **조명이 반이다.** 뒤에서 비추는 역광(테두리 빛)으로 실루엣을 세우고, 앞은 어둡게. 빛나는 건 눈·등불·핏줄 정도로 아낀다. 전체적으로 어둡고, 밝은 부분은 작게.
- **비율**: 길쭉하고, 굽고, 비대칭. 머리가 크고 눈이 동그란 비율(아기·마스코트)은 피한다. 팔다리는 너무 길거나 마디가 많게. 사람형은 등을 굽히고(좌표 변환), 고개를 숙이게.
- **재질**: 젖은 살갗(wet+spec), 기름막(irid), 해진 천(밑단을 잡음으로 들쭉날쭉하게 잘라냄), 녹슨 금속, 뼈. 표면에 잡음 변위(`fbm3(p*k)*작은 값`)로 질감.
- **색**: 바탕은 거의 검정에 가까운 회색·갈색·녹흑색. 분홍·하늘색 같은 파스텔 금지. 층 프리셋의 색을 따른다.
- **눈**: 너무 많고 크면 만화 같다. 작고 날카롭게, 일부는 반쯤 감기거나 그늘 속에서만 빛나게.
- **위대함**: 보스는 아래에서 올려다보는 카메라(낮은 pos.y, 높은 target.y), 거대한 덩치, 몸에 붙은 작은 것들(촉수, 사슬, 눈)로 크기감.
- **작게 봐도 읽히는가**: 256px로 줄였을 때 무엇인지 알아볼 수 있어야 한다. 가는 소품보다 큰 덩어리와 빛.
- 층별 분위기는 docs/FLOORS.md, 각 적의 생김새는 src/content의 `name`·`desc`·기믹(특성·행동)과 기존 `visual`(tint/glow 색)을 참고.

## 레시피 작성 요령
- 처음엔 큰 덩어리로 실루엣부터 → 렌더(sample) → 확인 → 세부. 한 장에 3~6번 고치는 게 보통.
- `smin` k값이 클수록 부드럽게 녹아 붙는다 (살덩이 0.1~0.4, 관절 0.03~0.08).
- 표면 변위(`d += 0.005 * (fbm3(p * 20.0) - 0.5)`)는 작게. 크면 광선 추적이 깨진다(점박이 구멍) → 그럴 땐 값을 줄인다.
- 루프가 많은 SDF(덩어리 64개 + 사슬 160개)는 느리다. 필요한 만큼만.
- 같은 종류(무리·하수인)는 seed만 바꿔 변형을 줘도 된다.
- 변신 형태(@2, @3)는 같은 레시피 파일에서 `mode`나 별도 파일로.
