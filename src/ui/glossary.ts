import { STATUSES } from '../engine/registry';
import { INSIGHT_WEAK, MAX_MADNESS, WEAK_BONUS } from '../engine/combat';
import { INSIGHT_SOURCES, INTENT_COLOR, INTENT_ICON, INTENT_MEANING, SCHOOL_NAME, insightBrief } from './text';
import { GAP_RULE, GAP_RULE_MORE, gapBonusText } from '../content/gap';
import { HUMAN_SCHOOLS } from '../engine/schools';
import { GUARD } from '../engine/combat';
import { breakGlossary, guardWord } from './guard';

/** 설명 속 용어 풀이 (슬레이 더 스파이어의 키워드 설명처럼) */
export interface Keyword {
  name: string;
  icon: string;
  color: string;
  desc: string;
}

/** 0.25 → 25 */
const pctOf = (x: number) => Math.round(x * 100);

/** 상태이상이 아닌 기본 규칙 용어 */
const TERMS: Keyword[] = [
  {
    name: '버팀',
    icon: 'gi:diamonds',
    color: '#ffe080',
    desc: `적 아래의 노란 ◆. 남아 있는 동안 받는 피해가 ${guardWord()}이다(지속 피해 포함). 약점 속성으로 치면 하나, 약점이 아닌 공격은 ${GUARD.chip}번에 하나 깎인다. 0이 되면 붕괴한다.`,
  },
  { name: '붕괴', icon: 'gi:shattered-glass', color: '#ffe080', desc: breakGlossary() },
  { name: '방어도', icon: 'gi:shield', color: '#8fc4ea', desc: '받는 피해를 먼저 막아 준다. 내 차례가 다시 시작되면 사라진다.' },
  { name: '약점', icon: 'gi:targeted', color: '#ff9a8a', desc: `존재마다 약한 피해 속성(참격·관통·타격·화염·비전·공허)이 있다. 약점으로 맞히면 버팀을 깎고 피해 +${pctOf(WEAK_BONUS)}%, 통찰 1당 +${pctOf(INSIGHT_WEAK)}% 더. 한 번 알아낸 약점은 다음 여정에도 보인다.` },
  { name: '행동력', icon: 'gi:diamonds', color: '#f0cf7a', desc: '스킬을 쓰는 데 드는 ◆. 내 차례가 시작될 때마다 다시 찬다.' },
  { name: '재사용 대기', icon: 'gi:hourglass', color: '#cfc8b8', desc: '스킬을 쓴 뒤 다시 쓰기까지 기다려야 하는 턴 수.' },
  { name: '정신력', icon: 'gi:brain', color: '#b99bff', desc: '공포와 광기를 버티는 힘. 0이 되면 정신이 무너져 광기를 얻는다.' },
  { name: '광기', icon: 'gi:brain', color: '#b99bff', desc: `정신이 무너질 때 얻는 오래가는 효과. 나쁜 광기가 ${MAX_MADNESS}개가 되면 여정이 끝난다.` },
  { name: '통찰', icon: 'gi:third-eye', color: '#4fffc4', desc: `이계의 지식. ${insightBrief()} ${INSIGHT_SOURCES}` },
  { name: '전열', icon: 'gi:crossed-swords', color: '#cfc8b8', desc: '앞줄. 근접 스킬은 전열에 적이 있으면 전열만 노릴 수 있다.' },
  { name: '후열', icon: 'gi:crossed-swords', color: '#cfc8b8', desc: '뒷줄. 근접 스킬은 전열이 모두 쓰러져야 닿는다. 원거리 스킬은 어디든 닿는다.' },
  { name: '탄약', icon: 'gi:bullets', color: '#ffe08a', desc: '총기 스킬이 쓰는 탄. 다 쓰면 재장전해야 한다.' },
  { name: '창세', icon: 'gi:sparkles', color: '#ffe3fa', desc: '희귀보다 귀한 가장 높은 등급. 세계가 처음 지어질 때 남은 것. 계층군주를 쓰러뜨리면 셋 중 하나를 고를 수 있고, 5층의 강적이 아주 드물게 떨군다. 한 판에 하나만 가질 수 있다.' },
  { name: '실마리', icon: 'gi:sewing-string', color: '#e7b49a', desc: '장착한 스킬·무기·각인이 남기는 것을 읽거나 그것들이 읽을 것을 만드는 다른 계열의 스킬. 보상과 상점에 더 자주 나온다.' },
  { name: '정수', icon: 'gi:heart-beats', color: '#ff9ab0', desc: '쓰러뜨린 존재가 남긴 힘. 흡수하면 스탯·패시브와 최대 체력을 얻는다 (수호자 정수는 여기에 그 존재의 기술 하나를 골라 함께 배운다). 정수 자리는 4개에서 시작해 층 수호자를 쓰러뜨릴 때마다 하나씩 는다. 꽉 차면 가진 정수 하나를 깨뜨리고 바꾸거나, 병에 담아 두었다가 신전에서 골드를 내고 새긴다. 계층정수는 자리를 차지하지 않는다. 이계의 정수는 흡수할 때 최대 정신력 -5를 치른다.' },
  // ── 의도 (적 머리 위의 표시) ──
  {
    name: '의도',
    icon: INTENT_ICON.attack,
    color: INTENT_COLOR.attack,
    desc: '적 머리 위의 표시. 그 적이 다음 차례에 할 행동을 알려 준다. 숫자는 내가 받을 피해이고 7×2는 7 피해를 2번 준다는 뜻이다. 표시를 누르면 자세히, 화면 위 「의도」 단추를 누르면 모든 표시의 뜻이 나온다.',
  },
  { name: '준비', icon: INTENT_ICON.charge, color: INTENT_COLOR.charge, desc: `번개 표시. ${INTENT_MEANING.charge}` },
  { name: '즉사기', icon: INTENT_ICON.death, color: INTENT_COLOR.death, desc: INTENT_MEANING.death },
  // ── 틈 (적 이름 옆의 갈라진 표시, content/gap.ts) ──
  {
    name: '틈',
    icon: 'gi:open-wound',
    color: '#f0d9a8',
    desc: `${GAP_RULE} ${GAP_RULE_MORE.join(' ')} 거두면: ${HUMAN_SCHOOLS.map((s) => `${SCHOOL_NAME[s]} ${gapBonusText(s)}`).join(' · ')}.`,
  },
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
