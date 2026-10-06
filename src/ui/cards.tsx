import type { ComponentChildren } from 'preact';
import { CONSUMABLES, EQUIPS, ESSENCES, RELICS, RUNES, SKILLS } from '../engine/registry';
import { essenceActives, essenceStats, type LootItem } from '../engine/run';
import { lvlVal } from '../engine/combat';
import type { EssenceStats } from '../engine/types';
import { Icon, Segs, press, showTip } from './components';
import { DMG_NAME, RARITY_COLOR, RARITY_NAME, SCHOOL_COLOR, SCHOOL_NAME, skillDesc } from './text';

const RANGE = { melee: '근접', ranged: '원거리', self: '자신' } as const;

export function SkillCard({ id, lvl = 0, runes = [], sel, off, onClick, right }: { id: string; lvl?: number; runes?: string[]; sel?: boolean; off?: boolean; onClick?: () => void; right?: ComponentChildren }) {
  const def = SKILLS.get(id);
  if (!def) return null;
  // 새긴 각인이 바꾸는 행동력·재사용 대기도 반영 (전투의 costOf·cdOf와 같게)
  const base = lvlVal(def.cd, lvl);
  const cost = Math.max(0, lvlVal(def.cost, lvl) + runes.reduce((n, r) => n + (RUNES.get(r)?.costMod ?? 0), 0));
  const cd = Math.max(base > 0 ? 1 : 0, base + runes.reduce((n, r) => n + (RUNES.get(r)?.cdMod ?? 0), 0));
  return (
    <button
      class={`card ${sel ? 'sel' : ''} ${off ? 'off' : ''}`}
      {...press(onClick, () =>
        showTip({
          title: def.name + (lvl > 0 ? '+' : ''),
          icon: def.icon,
          color: SCHOOL_COLOR[def.school],
          sub: `${SCHOOL_NAME[def.school]} · ${RARITY_NAME[def.rarity]}`,
          body: skillDesc(def, lvl).map((x) => x.t).join(''),
          lines: [
            { label: '행동력', value: String(cost) },
            { label: '재사용 대기', value: cd >= 99 ? '전투당 1회' : cd > 0 ? `${cd}턴` : '없음' },
          ],
        }),
      )}
    >
      <div class="badge" style={{ borderColor: SCHOOL_COLOR[def.school] + '55' }}>
        <Icon name={def.icon} size={28} color={SCHOOL_COLOR[def.school]} />
      </div>
      <div class="body">
        <div class="name" style={{ color: RARITY_COLOR[def.rarity] === '#cfc8b8' ? undefined : RARITY_COLOR[def.rarity] }}>
          {def.name}
          {lvl > 0 ? '+' : ''}
        </div>
        <div class="meta">
          {SCHOOL_NAME[def.school]} · {RARITY_NAME[def.rarity]} · 행동력 {cost} · {cd >= 99 ? '전투당 1회' : cd > 0 ? `대기 ${cd}턴` : '대기 없음'} · {RANGE[def.range]}
          {def.type ? ` · ${DMG_NAME[def.type]}` : ''}
        </div>
        <div class="desc">
          <Segs segs={skillDesc(def, lvl)} />
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
            {def.lord ? ' · 계층정수 (제거 불가)' : ''}
          </div>
        </div>
      </div>
      <StatChips st={essenceStats(id, guardian, core)} />
      {def.eldritch && (
        <div style={{ fontSize: 12, color: 'var(--eldritch)' }}>
          이계의 정수 — 흡수하면 최대 정신력 -5, 통찰 +1
        </div>
      )}
      <div style={{ fontSize: 13 }}>
        <b style={{ color: '#ffcf9a' }}>패시브 · {def.passive.name}</b>
        <div class="dim">{def.passive.desc}</div>
      </div>
      {choose && (
        <div class="section-label" style={{ margin: '2px 0 -2px' }}>
          기술 하나를 함께 배울 수 있다 — 누르면 고르고, 다시 누르면 취소
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
      return EQUIPS.get(it.id)?.name ?? it.id;
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
  }
}

/** 전리품의 아이콘·색·분류·설명 (카드와 확인 창이 같이 쓴다) */
export function lootInfo(it: LootItem): { icon: string; color: string; meta: string; desc: string } {
  let icon = 'gi:help';
  let color = '#cfc8b8';
  let meta = '';
  let desc = '';
  if (it.kind === 'skill') {
    const d = SKILLS.get(it.id);
    if (d) return { icon: d.icon, color: SCHOOL_COLOR[d.school], meta: `스킬 · ${SCHOOL_NAME[d.school]}`, desc: skillDesc(d, 0).map((x) => x.t).join('') };
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
      meta = `소모품${d.combat ? ' · 전투 중' : ''}`;
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

/** 스킬 외 전리품 카드 */
export function LootCard({ it, sel, off, onClick, right }: { it: LootItem; sel?: boolean; off?: boolean; onClick?: () => void; right?: ComponentChildren }) {
  if (it.kind === 'skill') return <SkillCard id={it.id} sel={sel} off={off} onClick={onClick} right={right} />;
  const { icon, color, meta, desc } = lootInfo(it);
  return (
    <button class={`card ${sel ? 'sel' : ''} ${off ? 'off' : ''}`} {...press(onClick, () => showTip({ title: lootName(it), icon, color, sub: meta, body: desc || meta }))}>
      <div class="badge">
        <Icon name={icon} size={28} color={color} />
      </div>
      <div class="body">
        <div class="name" style={{ color }}>
          {lootName(it)}
        </div>
        <div class="meta">{meta}</div>
        {desc && (
          <div class="desc" style={{ whiteSpace: 'pre-line' }}>
            {desc}
          </div>
        )}
      </div>
      {right}
    </button>
  );
}
