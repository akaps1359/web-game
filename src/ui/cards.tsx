import type { ComponentChildren } from 'preact';
import { AFFIXES, CONSUMABLES, ENEMIES, EQUIPS, ESSENCES, RELICS, RUNES, SKILLS } from '../engine/registry';
import { weakPointOf } from '../engine/weakpoint';
import { store } from '../state/store';
import { equipName } from '../engine/growth';
import { essenceActives, essenceStats, isGenesisLoot, type LootItem, type RunState } from '../engine/run';
import { lvlVal } from '../engine/combat';
import { clueReason, keywordNames } from '../engine/keywords';
import type { DmgType, EssenceStats, SkillDef, SkillUse } from '../engine/types';
import { Icon, Segs, press, showTip } from './components';
import { DMG_NAME, RARITY_COLOR, RARITY_NAME, SCHOOL_COLOR, SCHOOL_NAME, WP_COLOR, rarityClass, skillDesc, type Seg } from './text';
import { josa as engineJosa } from '../engine/josa';

export const RANGE = { melee: '근접', ranged: '원거리', self: '자신' } as const;

/**
 * 새긴 각인까지 반영한 행동력·재사용 대기·위력 (전투의 costOf·cdOf·makeUse와 같은 계산.
 * 유물·장비가 바꾸는 값은 전투 안에서만 붙는다)
 */
export function skillNums(def: SkillDef, lvl: number, runes: string[] = []): { cost: number; cd: number; power: number } {
  const base = lvlVal(def.cd, lvl);
  const sum = (k: 'costMod' | 'cdMod') => runes.reduce((n, r) => n + (RUNES.get(r)?.[k] ?? 0), 0);
  return {
    cost: Math.max(0, lvlVal(def.cost, lvl) + sum('costMod')),
    // 원래 재사용 대기가 있는 스킬은 각인으로도 1턴 아래로 줄지 않는다
    cd: Math.max(base > 0 ? 1 : 0, base + sum('cdMod')),
    power: runes.reduce((m, r) => m * (RUNES.get(r)?.powerMult ?? 1), 1),
  };
}

/** 재사용 대기 글: '2턴' / '없음' / '전투당 1회' */
export function cdText(cd: number): string {
  return cd >= 99 ? '전투당 1회' : cd > 0 ? `${cd}턴` : '없음';
}

/** 각인의 위력 배율까지 반영한 스킬 설명 (피해·방어도·회복 수치만 바뀐다. 전투의 SkillUse.v와 같다) */
export function skillSegs(def: SkillDef, lvl: number, power = 1): Seg[] {
  if (power === 1) return skillDesc(def, lvl);
  const v = (key: string) => {
    const raw = def.vals[key];
    if (raw === undefined) return 0;
    const val = lvlVal(raw, lvl);
    return /^(dmg|blk|heal)/.test(key) ? Math.floor(val * power) : val;
  };
  return skillDesc(def, lvl, { use: { v } as unknown as SkillUse });
}

/** 받침에 맞는 조사: josa('메아리 각인', '을', '를') → '을'. 숫자·ㄹ받침('으로')까지 engine/josa가 판단한다 */
export function josa(word: string, withFinal: string, without: string): string {
  if (withFinal === '으로') return engineJosa(word, '으로');
  return engineJosa(word, '을') === '을' ? withFinal : without;
}

/** 스킬의 계열 표시. 두 계열로 치는 스킬(예전 합기, SkillDef.duo)은 '검술×연금' */
export function schoolLabel(def: SkillDef): string {
  return def.duo ? `${SCHOOL_NAME[def.duo[0]]}×${SCHOOL_NAME[def.duo[1]]}` : SCHOOL_NAME[def.school];
}

/** 설명 창의 계열 줄: 두 계열로 치는 스킬은 성격까지 ('검술×연금 계열을 잇는 기술') */
export function schoolSub(def: SkillDef): string {
  return def.duo ? `${schoolLabel(def)} 계열을 잇는 기술` : schoolLabel(def);
}

/** 두 계열로 치는 스킬의 표식: 두 계열 칩이 한 띠로 이어진다 ('검술|연금'). 예전 '합기' 배지 자리 */
export function DuoTag({ def }: { def: SkillDef }) {
  if (!def.duo) return null;
  return (
    <span class="duo-tag" aria-label={schoolSub(def)}>
      {def.duo.map((s) => (
        <i style={{ color: SCHOOL_COLOR[s], borderColor: SCHOOL_COLOR[s] + '80', background: SCHOOL_COLOR[s] + '1f' }}>{SCHOOL_NAME[s]}</i>
      ))}
    </span>
  );
}

/** 스킬이 만드는 키워드·읽는 키워드 (설명 창의 한 줄: '만듦' 출혈 · '읽음' 독). 둘 다 없으면 빈 배열 */
export function keywordLines(def: SkillDef): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (def.makes?.length) out.push({ label: '만듦', value: keywordNames(def.makes) });
  if (def.reads?.length) out.push({ label: '읽음', value: keywordNames(def.reads) });
  return out;
}

/** 고르는 화면(보상·상점·금기의 길)의 실마리 이유 한 줄: 스킬이고 아직 고를 수 있을 때만. 아니면 null */
export function lootClue(run: RunState | null | undefined, it: { kind: string; id: string }, open = true): string | null {
  return open && run && it.kind === 'skill' ? clueReason(run, it.id) : null;
}

/**
 * 스킬 카드. clue: 실마리 이유 한 줄 (engine/keywords.ts clueReason). 고르는 화면(보상·상점·금기의 길)만 넘긴다.
 * 있으면 카드 아래에 실 한 줄이 붙고 오른쪽 위 모서리가 접힌다
 */
export function SkillCard({ id, lvl = 0, runes = [], sel, off, onClick, right, clue }: { id: string; lvl?: number; runes?: string[]; sel?: boolean; off?: boolean; onClick?: () => void; right?: ComponentChildren; clue?: string | null }) {
  const def = SKILLS.get(id);
  if (!def) return null;
  // 새긴 각인이 바꾸는 행동력·재사용 대기·위력도 반영 (전투의 costOf·cdOf·makeUse와 같게)
  const { cost, cd, power } = skillNums(def, lvl, runes);
  const segs = skillSegs(def, lvl, power);
  // 두 계열로 치는 스킬은 두 계열의 색으로 테를 두른다
  const badge = def.duo
    ? { borderColor: SCHOOL_COLOR[def.duo[0]] + '99', background: `linear-gradient(135deg, ${SCHOOL_COLOR[def.duo[0]]}33, rgba(0, 0, 0, 0.3) 55%, ${SCHOOL_COLOR[def.duo[1]]}40)` }
    : { borderColor: SCHOOL_COLOR[def.school] + '55' };
  return (
    <button
      class={`card ${sel ? 'sel' : ''} ${off ? 'off' : ''} ${def.rarity === 'genesis' ? 'genesis' : ''} ${clue ? 'clue' : ''}`}
      {...press(onClick, () =>
        showTip({
          title: def.name + (lvl > 0 ? '+' : ''),
          nameClass: rarityClass(def.rarity),
          icon: def.icon,
          color: SCHOOL_COLOR[def.school],
          sub: `${schoolSub(def)} · ${RARITY_NAME[def.rarity]}`,
          body: segs.map((x) => x.t).join('') + (clue ? `\n\n실마리: ${clue}` : ''),
          lines: [{ label: '행동력', value: String(cost) }, { label: '재사용 대기', value: cdText(cd) }, ...keywordLines(def)],
        }),
      )}
    >
      <div class="badge" style={badge}>
        <Icon name={def.icon} size={28} color={SCHOOL_COLOR[def.school]} class={def.rarity === 'genesis' ? 'genesis-glow' : undefined} />
      </div>
      <div class="body">
        <div class="name" style={{ color: RARITY_COLOR[def.rarity] === '#cfc8b8' ? undefined : RARITY_COLOR[def.rarity] }}>
          <span class={rarityClass(def.rarity)}>
            {def.name}
            {lvl > 0 ? '+' : ''}
          </span>
          <DuoTag def={def} />
        </div>
        <div class="meta">
          {/* 두 계열 칩이 이름 옆에 있으니 계열은 되풀이하지 않는다 */}
          {def.duo ? '' : `${schoolLabel(def)} · `}
          {RARITY_NAME[def.rarity]} · 행동력 {cost} · {cd >= 99 ? '전투당 1회' : cd > 0 ? `대기 ${cd}턴` : '대기 없음'} · {RANGE[def.range]}
          {def.type ? ` · ${DMG_NAME[def.type]}` : ''}
        </div>
        <div class="desc">
          <Segs segs={segs} />
        </div>
        {runes.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
            {runes.map((r) => (
              <span class="chip" style={{ color: '#c08cff' }}>
                <Icon name={RUNES.get(r)?.icon ?? 'gi:rune-stone'} size={12} />
                {RUNES.get(r)?.name}
              </span>
            ))}
          </div>
        )}
        {clue && (
          <div class="clue-line">
            <Icon name="gi:sewing-string" size={14} />
            <span>{clue}</span>
          </div>
        )}
        <WpLine type={def.type} />
      </div>
      {right}
    </button>
  );
}

export const STAT_NAME: Record<keyof EssenceStats, string> = {
  maxHp: '최대 체력',
  str: '힘',
  dex: '민첩',
  will: '의지',
  maxSanity: '최대 정신력',
  insight: '통찰',
};

export function StatChips({ st }: { st: EssenceStats }) {
  return (
    <div class="stats-line">
      {Object.entries(st).map(([k, v]) => (
        <span class="chip" style={{ color: (v as number) >= 0 ? '#b0ffc4' : '#ffb0a0' }}>
          {STAT_NAME[k as keyof EssenceStats]} {(v as number) >= 0 ? '+' : ''}
          {v}
        </span>
      ))}
    </div>
  );
}

/**
 * 정수 카드. core: 본질로 흡수한 정수 (최대 체력 추가), skill: 수호자 정수와 함께 고른 기술.
 * choose: 수호자 정수를 흡수하기 전 — 그 존재의 기술 중 하나를 고른다 (다시 누르면 취소, 고르지 않아도 된다)
 */
export function EssenceCard({
  id,
  color,
  guardian,
  core,
  skill,
  choose,
  footer,
}: {
  id: string;
  color: number;
  guardian?: boolean;
  core?: boolean;
  skill?: string;
  choose?: { pick: string | null; onPick: (id: string | null) => void };
  footer?: ComponentChildren;
}) {
  const def = ESSENCES.get(id);
  if (!def) return null;
  if (choose) core = true;
  const actives = choose ? def.actives : essenceActives({ id, color, guardian, core, skill });
  return (
    <div class={`essence-card ${def.eldritch ? 'eldritch' : ''}`}>
      <div class="row">
        <div class="badge" style={{ width: 54, height: 54, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,0.35)' }}>
          <Icon name={def.icon} size={38} color={def.eldritch ? '#4fffc4' : '#ff9ab0'} />
        </div>
        <div style={{ flex: 1 }}>
          <div class="serif" style={{ fontWeight: 800, fontSize: 17 }}>
            {def.name}
          </div>
          <div class="muted" style={{ fontSize: 12 }}>
            {def.grade}등급 {guardian ? '· 수호자 정수 (스탯 1.5배 + 기술 하나)' : `· ${def.colors[color]}`}
            {def.lord ? ' · 계층정수 · 깨뜨릴 수 없고 자리를 차지하지 않음' : ''}
          </div>
        </div>
      </div>
      <StatChips st={essenceStats(id, guardian, core)} />
      {def.eldritch && (
        <div style={{ fontSize: 12, color: 'var(--eldritch)' }}>
          이계의 정수. 흡수하면 최대 정신력 -5.
        </div>
      )}
      <div style={{ fontSize: 13 }}>
        <b style={{ color: '#ffcf9a' }}>패시브 · {def.passive.name}</b>
        <div class="dim">{def.passive.desc}</div>
      </div>
      {choose && (
        <div class="section-label" style={{ margin: '2px 0 -2px' }}>
          기술 하나를 함께 배울 수 있다. 누르면 선택, 다시 누르면 취소
        </div>
      )}
      {actives.map((a) =>
        choose ? (
          <SkillCard id={a} sel={choose.pick === a} onClick={() => choose.onPick(choose.pick === a ? null : a)} right={<span class="chip">{choose.pick === a ? '고름' : '고르기'}</span>} />
        ) : (
          <SkillCard id={a} />
        ),
      )}
      {footer}
    </div>
  );
}

export function lootName(it: LootItem): string {
  switch (it.kind) {
    case 'skill':
      return SKILLS.get(it.id)?.name ?? it.id;
    case 'relic':
      return RELICS.get(it.id)?.name ?? it.id;
    case 'equip':
      return equipName(it);
    case 'rune':
      return RUNES.get(it.id)?.name ?? it.id;
    case 'consumable':
      return CONSUMABLES.get(it.id)?.name ?? it.id;
    case 'essence':
      return ESSENCES.get(it.id)?.name ?? it.id;
    case 'gold':
      return `${it.n} 골드`;
    case 'oil':
      return `등유 (등불 +${it.n ?? 30})`;
    case 'upgrade':
      return '기술 연마';
    case 'evolve':
      return `진화: ${RELICS.get(it.id)?.name ?? it.id}`;
  }
}

/** 장비 접사 줄: '【날선】 약점을 찌르는 공격 피해 +15%' (없으면 빈 문자열) */
export function affixLines(aff?: string[]): string {
  return (aff ?? [])
    .map((a) => AFFIXES.get(a))
    .filter(Boolean)
    .map((a) => `【${a!.name}】 ${a!.desc}`)
    .join('\n');
}

/** 전리품의 아이콘·색·분류·설명 (카드와 확인 창이 같이 쓴다) */
export function lootInfo(it: LootItem): { icon: string; color: string; meta: string; desc: string } {
  let icon = 'gi:help';
  let color = '#cfc8b8';
  let meta = '';
  let desc = '';
  if (it.kind === 'skill') {
    const d = SKILLS.get(it.id);
    if (d) return { icon: d.icon, color: SCHOOL_COLOR[d.school], meta: `스킬 · ${schoolLabel(d)}`, desc: skillDesc(d, 0).map((x) => x.t).join('') };
  }
  switch (it.kind) {
    case 'relic': {
      const d = RELICS.get(it.id)!;
      icon = d.icon;
      color = RARITY_COLOR[d.rarity];
      meta = `유물 · ${RARITY_NAME[d.rarity]}`;
      desc = d.desc;
      break;
    }
    case 'equip': {
      const d = EQUIPS.get(it.id)!;
      icon = d.icon;
      color = RARITY_COLOR[d.rarity];
      meta = `장비 · ${d.slot === 'weapon' ? '무기' : d.slot === 'armor' ? '방어구' : '장신구'} · ${RARITY_NAME[d.rarity]}`;
      desc = d.desc;
      if (d.skill) {
        const s = SKILLS.get(d.skill);
        if (s) desc += `\n${s.name}: ${skillDesc(s, it.n ?? 0).map((x) => x.t).join('')}`;
      }
      if (it.aff?.length) desc += `\n${affixLines(it.aff)}`;
      break;
    }
    case 'evolve': {
      const d = RELICS.get(it.id)!;
      const [a, b] = d.evolve ?? ['', ''];
      icon = d.icon;
      color = '#ffcf6a';
      meta = '유물 진화 · 두 유물을 내주고 얻는다';
      desc = `${RELICS.get(a)?.name ?? a} + ${RELICS.get(b)?.name ?? b} → ${d.name}\n${d.desc}`;
      break;
    }
    case 'rune': {
      const d = RUNES.get(it.id)!;
      icon = d.icon;
      color = '#c08cff';
      meta = `각인 · ${RARITY_NAME[d.rarity]}`;
      desc = d.desc;
      break;
    }
    case 'consumable': {
      const d = CONSUMABLES.get(it.id)!;
      icon = d.icon;
      color = RARITY_COLOR[d.rarity];
      meta = `소모품 · ${d.combat ? '전투 중에만' : '언제든'}`;
      desc = d.desc;
      break;
    }
    case 'gold':
      icon = 'gi:two-coins';
      color = '#f0cf7a';
      meta = '골드';
      break;
    case 'oil':
      icon = 'gi:oil-drum';
      color = '#f0b04a';
      meta = '등불';
      break;
    case 'upgrade':
      icon = 'gi:anvil-impact';
      color = '#f0cf7a';
      meta = '강화';
      desc = '가진 스킬 하나를 강화한다';
      break;
    case 'essence':
      icon = ESSENCES.get(it.id)?.icon ?? icon;
      color = '#ff9ab0';
      meta = '정수';
      break;
  }
  return { icon, color, meta, desc };
}

/**
 * 이 속성이 이번 여정에 드러난 급소인, 이 층의 존재들 (engine/weakpoint.ts).
 * 보상·상점에서 무엇을 들일지 고를 때 알아낸 급소가 떠오르게 — 급소를 알아 두는 값
 */
export function wpFoes(type: DmgType | undefined, run: RunState | null | undefined = store.run): string[] {
  if (!run || !type || !run.weakPoints?.length) return [];
  return run.weakPoints.filter((id) => weakPointOf(run, id) === type && ENEMIES.get(id)?.act === run.act).map((id) => ENEMIES.get(id)!.name);
}

/** 급소 줄: 「급소: 익사체, 심해의 피」 */
export function WpLine({ type }: { type: DmgType | undefined }) {
  const foes = wpFoes(type);
  if (!foes.length) return null;
  return (
    <div class="wp-line">
      <Icon name="gi:bullseye" size={14} color={WP_COLOR} />
      <span>
        급소를 찌른다: {foes.slice(0, 3).join(', ')}
        {foes.length > 3 ? ` 외 ${foes.length - 3}` : ''}
      </span>
    </div>
  );
}

/** 장비 기본기의 피해 속성 (무기의 기본 공격 등) */
export function equipType(id: string): DmgType | undefined {
  const s = EQUIPS.get(id)?.skill;
  return s ? SKILLS.get(s)?.type : undefined;
}

/** 전리품 카드 (스킬이면 SkillCard — clue: 실마리 이유 한 줄) */
export function LootCard({ it, sel, off, onClick, right, clue }: { it: LootItem; sel?: boolean; off?: boolean; onClick?: () => void; right?: ComponentChildren; clue?: string | null }) {
  if (it.kind === 'skill') return <SkillCard id={it.id} sel={sel} off={off} onClick={onClick} right={right} clue={clue} />;
  const { icon, color, meta, desc } = lootInfo(it);
  // 창세 장비는 이름이 무지갯빛으로 흐르고 카드에 은은한 테가 둘린다
  const gen = isGenesisLoot(it);
  const nameClass = gen ? rarityClass('genesis') : '';
  return (
    <button class={`card ${sel ? 'sel' : ''} ${off ? 'off' : ''} ${gen ? 'genesis' : ''}`} {...press(onClick, () => showTip({ title: lootName(it), nameClass, icon, color, sub: meta, body: desc || meta }))}>
      <div class="badge">
        <Icon name={icon} size={28} color={color} class={gen ? 'genesis-glow' : undefined} />
      </div>
      <div class="body">
        <div class="name" style={{ color }}>
          <span class={nameClass}>{lootName(it)}</span>
        </div>
        <div class="meta">{meta}</div>
        {desc && (
          <div class="desc" style={{ whiteSpace: 'pre-line' }}>
            {desc}
          </div>
        )}
        {it.kind === 'equip' && <WpLine type={equipType(it.id)} />}
      </div>
      {right}
    </button>
  );
}
