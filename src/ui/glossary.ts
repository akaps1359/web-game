import { STATUSES } from '../engine/registry';

/** 설명 속 용어 풀이 (슬레이 더 스파이어의 키워드 설명처럼) */
export interface Keyword {
  name: string;
  icon: string;
  color: string;
  desc: string;
}

/** 상태이상이 아닌 기본 규칙 용어 */
const TERMS: Keyword[] = [
  { name: '버팀', icon: 'gi:diamonds', color: '#ffe080', desc: '적 아래의 노란 ◆. 약점 속성으로 공격하면 하나씩 깎이고, 0이 되면 붕괴한다.' },
  { name: '붕괴', icon: 'gi:shattered-glass', color: '#ffe080', desc: '버팀이 다 깎인 상태. 한 번 행동하지 못하고 받는 피해가 50% 늘어난다. 준비 중이던 큰 공격(번개 표시)도 끊긴다.' },
  { name: '방어도', icon: 'gi:shield', color: '#8fc4ea', desc: '받는 피해를 먼저 막아 준다. 내 차례가 다시 시작되면 사라진다.' },
  { name: '약점', icon: 'gi:targeted', color: '#ff9a8a', desc: '존재마다 약한 피해 속성(참격·관통·타격·화염·비전·공허)이 있다. 약점으로 맞히면 버팀을 깎는다. 한 번 알아낸 약점은 다음 여정에도 보인다.' },
  { name: '행동력', icon: 'gi:diamonds', color: '#f0cf7a', desc: '스킬을 쓰는 데 드는 ◆. 내 차례가 시작될 때마다 다시 찬다.' },
  { name: '재사용 대기', icon: 'gi:hourglass', color: '#cfc8b8', desc: '스킬을 쓴 뒤 다시 쓰기까지 기다려야 하는 턴 수.' },
  { name: '정신력', icon: 'gi:brain', color: '#b99bff', desc: '공포와 광기를 버티는 힘. 0이 되면 정신이 무너져 광기를 얻는다.' },
  { name: '광기', icon: 'gi:brain', color: '#b99bff', desc: '정신이 무너질 때 얻는 오래가는 효과. 나쁜 광기가 4개가 되면 여정이 끝난다.' },
  { name: '통찰', icon: 'gi:third-eye', color: '#4fffc4', desc: '5 이상이면 숨겨진 적의 의도가 보인다. 대신 잃는 정신력이 1당 5% 늘어난다.' },
  { name: '전열', icon: 'gi:crossed-swords', color: '#cfc8b8', desc: '앞줄. 근접 스킬은 전열에 적이 있으면 전열만 노릴 수 있다.' },
  { name: '후열', icon: 'gi:crossed-swords', color: '#cfc8b8', desc: '뒷줄. 근접 스킬은 전열이 모두 쓰러져야 닿는다. 원거리 스킬은 어디든 닿는다.' },
  { name: '탄약', icon: 'gi:bullets', color: '#ffe08a', desc: '총기 스킬이 쓰는 탄. 다 쓰면 재장전해야 한다.' },
  { name: '정수', icon: 'gi:heart-beats', color: '#ff9ab0', desc: '쓰러뜨린 존재가 남긴 힘. 흡수하면 스탯·패시브와 최대 체력을 얻는다 (수호자 정수는 대신 그 존재의 기술을 모두 배울 수도 있다). 바로 흡수하지 않고 병에 담아 두었다가 신전에서 골드를 내고 새길 수도 있다. 레벨만큼만 흡수할 수 있다.' },
];

/** 한 글자 이름은 뒤에 숫자·기호·공백이 올 때만 용어로 본다 (「힘껏」 같은 낱말과 헷갈리지 않게) */
function found(text: string, name: string): number {
  if (name.length >= 2) return text.indexOf(name);
  const re = new RegExp(`${name}(?=[\\s+\\-−0-9,.)·]|$)`);
  const m = re.exec(text);
  return m ? m.index : -1;
}

let cache: Keyword[] | null = null;
function all(): Keyword[] {
  if (cache) return cache;
  const out: Keyword[] = [...TERMS];
  const seen = new Set(out.map((k) => k.name));
  for (const d of STATUSES.values()) {
    if (d.hidden || !d.desc || seen.has(d.name)) continue;
    seen.add(d.name);
    out.push({ name: d.name, icon: d.icon, color: d.kind === 'buff' ? '#f0cf7a' : '#c8a0ff', desc: d.desc.replace(/\{n\}/g, 'N') });
  }
  // 긴 이름 먼저 (「취약」보다 「강한 취약」 같은 경우)
  cache = out.sort((a, b) => b.name.length - a.name.length);
  return cache;
}

/** 글 속에 나오는 용어들 (나온 순서대로). exclude: 이미 제목인 용어 */
export function keywordsIn(text: string, exclude?: string): Keyword[] {
  if (!text) return [];
  const hits: { k: Keyword; at: number }[] = [];
  let rest = text;
  for (const k of all()) {
    if (k.name === exclude) continue;
    const at = found(rest, k.name);
    if (at < 0) continue;
    hits.push({ k, at: found(text, k.name) });
    // 긴 용어 안의 짧은 용어가 또 잡히지 않게 지운다
    rest = rest.split(k.name).join(' '.repeat(k.name.length));
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.k);
}
