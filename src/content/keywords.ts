import { regKeywords, regRuneKeywords } from '../engine/keywords';

/**
 * 상처의 문법 — 계열을 잇는 키워드 표 (engine/keywords.ts). 안쪽 설계용이다.
 * 플레이어에게는 새 용어 없이 스킬 설명의 조건 한 줄("대상이 출혈 중이면 …")로만 보인다.
 *
 * 1차: 지금 주인 · 2차: 가끔, 약하게 만드는 계열 하나 · 읽는 계열: 1차 계열을 뺀 둘 이상.
 * 새 계열 스킬은 makes/reads를 달고, 계열 스킬의 약 1/3은 남의 키워드를 읽는다 (docs/CONTENT_GUIDE.md).
 * tests/keywords.test.ts가 이 표와 스킬 태그가 맞는지 검사한다 (읽는 계열 = 실제로 읽는 스킬이 있는 계열).
 *
 * 깊이 보상(1차 키워드를 크게 터뜨리는 것)은 1차 계열에 남긴다: 혈류 폭발·동맥 절개(출혈), 촉매·휘발성 혼합물(독·화상),
 * 인장 폭발·대폭발 의식(인장), 파멸의 언어·종말의 합창(파멸). 남의 계열은 읽어서 '자기 방식으로' 바꾼다.
 */
regKeywords([
  // ── 적에게 남는 것 ──
  { id: 'bleed', name: '출혈', side: 'enemy', primary: 'blade', secondary: 'resolve', readers: ['firearm', 'occult', 'alchemy', 'resolve', 'forbidden'] },
  { id: 'poison', name: '독', side: 'enemy', primary: 'alchemy', secondary: 'blade', readers: ['blade', 'firearm', 'occult'] },
  { id: 'burn', name: '화상', side: 'enemy', primary: 'alchemy', secondary: 'firearm', readers: ['occult', 'forbidden'] },
  { id: 'mark', name: '인장', side: 'enemy', primary: 'occult', secondary: 'blade', readers: ['blade', 'firearm', 'alchemy', 'resolve', 'forbidden'] },
  { id: 'doom', name: '파멸', side: 'enemy', primary: 'forbidden', secondary: 'occult', readers: ['firearm', 'occult'] },
  // 약화·취약은 여러 계열이 함께 거는 공용 키워드 (1차 = 공용)
  { id: 'expose', name: '약화·취약', side: 'enemy', primary: 'neutral', secondary: 'firearm', readers: ['blade', 'alchemy', 'resolve'] },
  // ── 나에게 남는 것 ──
  // 방어도는 방어구 기본기로 누구나 만든다 (universal — 실마리는 1차 계열이 만든 것을 읽는 쪽만 센다)
  { id: 'block', name: '방어도', side: 'self', primary: 'resolve', secondary: 'firearm', readers: ['firearm', 'occult', 'alchemy'], universal: true },
  { id: 'counter', name: '반격', side: 'self', primary: 'resolve', secondary: 'blade', readers: ['blade', 'alchemy'] },
  { id: 'barrier', name: '보호막', side: 'self', primary: 'occult', secondary: 'forbidden', readers: ['resolve', 'forbidden'] },
  { id: 'aim', name: '조준', side: 'self', primary: 'firearm', secondary: 'resolve', readers: ['blade', 'alchemy'] },
  { id: 'ammo', name: '탄약', side: 'self', primary: 'firearm', secondary: 'resolve', readers: ['blade', 'alchemy'] },
  // 연계 = 이번 턴 앞서 쓴 스킬 수. 행동력 0으로 쓰는 공격(허초·속사)이 수를 늘린다
  { id: 'combo', name: '연계', side: 'self', primary: 'blade', secondary: 'firearm', readers: ['firearm', 'occult'] },
  // 잃은 정신력 = 최대 정신력 - 지금 정신력. 정신력을 치르는 기술이 만든다
  { id: 'sanity', name: '잃은 정신력', side: 'self', primary: 'forbidden', secondary: 'firearm', readers: ['blade', 'firearm', 'resolve'] },
  { id: 'tentacle', name: '촉수', side: 'self', primary: 'forbidden', secondary: 'occult', readers: ['occult', 'resolve'] },
]);

/** 각인이 만드는(읽는) 키워드 — 각인도 실마리의 재료다 */
regRuneKeywords({
  'bleed-rune': { makes: ['bleed'] },
  'burn-rune': { makes: ['burn'] },
  'mark-rune': { makes: ['mark'] },
  'x-venom-rune': { makes: ['poison'] },
  'ward-rune': { makes: ['block'] },
  'x-magazine-rune': { makes: ['ammo'] },
  'void-rune': { makes: ['sanity'] },
  'x-combo-rune': { reads: ['combo'] },
});
