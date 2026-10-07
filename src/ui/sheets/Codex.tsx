import { useState } from 'preact/hooks';
import { ENEMIES, EQUIPS, ESSENCES, RELICS, SKILLS } from '../../engine/registry';
import { lvlVal } from '../../engine/combat';
import { essenceStats } from '../../engine/run';
import type { EnemyDef, EssenceStats, Rarity, SkillDef } from '../../engine/types';
import { codexSkills } from '../../state/meta';
import { store } from '../../state/store';
import { STAT_NAME, lootInfo } from '../cards';
import { Icon, Sheet, showTip } from '../components';
import { DMG_COLOR, DMG_NAME, RARITY_COLOR, RARITY_NAME, SCHOOL_COLOR, SCHOOL_NAME, rarityClass, skillDesc } from '../text';

type Tab = 'enemies' | 'equips' | 'essences' | 'skills' | 'relics';

const TABS: [Tab, string][] = [
  ['enemies', '몬스터'],
  ['equips', '장비'],
  ['essences', '정수'],
  ['skills', '스킬'],
  ['relics', '유물'],
];

const RARITY_ORDER: Rarity[] = ['basic', 'common', 'uncommon', 'rare', 'special', 'boss', 'forbidden', 'genesis'];

/** 아직 얻지 못한 창세의 것: 어디서 나오는지 알려 준다 */
const GENESIS_HINT = '아직 손에 넣지 못한 창세의 것. 계층군주를 쓰러뜨리면 창세의 것 셋 중 하나를 고를 수 있고, 5층의 강적이 아주 드물게 떨군다. 판마다 하나뿐이다.';
const byRarity = <T extends { rarity: Rarity; name: string }>(a: T, b: T) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) || a.name.localeCompare(b.name, 'ko');

/** 도감 한 칸: 알아낸 것은 아이콘과 이름, 아직이면 ??? */
interface Cell {
  id: string;
  name: string;
  icon: string;
  color: string;
  known: boolean;
  /** 이름 아래 작은 점들 (적의 약점) */
  dots?: string[];
  /** 창세 등급: 이름이 무지갯빛으로 흐르고 아이콘이 은은하게 빛난다 */
  glow?: boolean;
  open: () => void;
}

interface Group {
  label: string;
  cells: Cell[];
}

export function CodexSheet() {
  const [tab, setTab] = useState<Tab>('enemies');
  const close = () => {
    store.sheet = null;
    store.emit();
  };
  // 고른 탭만 만든다 (다른 탭의 칸은 그리지 않는다)
  const groups = GROUPS[tab]();
  const all = groups.reduce((n, g) => n + g.cells.length, 0);
  const known = groups.reduce((n, g) => n + g.cells.filter((c) => c.known).length, 0);
  return (
    <Sheet title={`도감 ${known}/${all}`} icon="gi:book-cover" onClose={close} fixed>
      <div class="tabs">
        {TABS.map(([k, n]) => (
          <button class={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>
            {n}
          </button>
        ))}
      </div>
      <div class="muted" style={{ fontSize: 12, margin: '2px 0 6px' }}>
        {HINT[tab]}
      </div>
      <div class="scroll" style={{ flex: 1, minHeight: 200 }}>
        {groups.map((g) => (
          <>
            {groups.length > 1 && (
              <div class="section-label" style={{ margin: '8px 0 6px' }}>
                {g.label} <span class="muted">{g.cells.filter((c) => c.known).length}/{g.cells.length}</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {g.cells.map((c) => (
                <button class={`card ${c.known && c.glow ? 'genesis' : ''}`} style={{ flexDirection: 'column', alignItems: 'center', padding: 8, gap: 4, opacity: c.known ? 1 : 0.35 }} onClick={c.open}>
                  <Icon name={c.known ? c.icon : 'gi:help'} size={32} color={c.known ? c.color : '#555'} class={c.known && c.glow ? 'genesis-glow' : undefined} />
                  <span class={c.known && c.glow ? 'genesis-name' : ''} style={{ fontSize: 10.5, textAlign: 'center', lineHeight: 1.2, wordBreak: 'keep-all' }}>
                    {c.known ? c.name : '???'}
                  </span>
                  {c.known && c.dots && c.dots.length > 0 && (
                    <span style={{ display: 'flex', gap: 2 }}>
                      {c.dots.map((col) => (
                        <i style={{ width: 6, height: 6, borderRadius: 3, background: col }} />
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        ))}
      </div>
    </Sheet>
  );
}

const HINT: Record<Tab, string> = {
  enemies: '한 번 알아낸 약점은 다음 여정에서도 처음부터 보인다.',
  equips: '한 번이라도 손에 넣은 장비가 기록된다.',
  essences: '한 번이라도 흡수한 정수가 기록된다. 그 존재의 기술도 함께 볼 수 있다.',
  skills: '한 번이라도 배운 스킬이 기록된다. 정수의 기술은 정수 도감에서 본다.',
  relics: '한 번이라도 얻은 유물이 기록된다.',
};

const unknown = (what: string) => () => showTip({ title: '???', icon: 'gi:help', body: what });

// ───────── 탭마다 ─────────

const GROUPS: Record<Tab, () => Group[]> = {
  enemies: () => {
    const codex = store.meta.codex;
    const list = [...ENEMIES.values()].filter((e) => e.tier !== 'minion');
    return [{ label: '', cells: list.map((e) => enemyCell(e, codex[e.id])) }];
  },

  equips: () => {
    const got = new Set(store.meta.equips ?? []);
    const slots: [string, string][] = [
      ['weapon', '무기'],
      ['armor', '방어구'],
      ['trinket', '장신구'],
    ];
    return slots.map(([slot, label]) => ({
      label,
      cells: [...EQUIPS.values()]
        .filter((d) => d.slot === slot)
        .sort(byRarity)
        .map((d) => {
          const known = got.has(d.id);
          const info = lootInfo({ kind: 'equip', id: d.id } as Parameters<typeof lootInfo>[0]);
          return {
            id: d.id,
            name: d.name,
            icon: d.icon,
            color: RARITY_COLOR[d.rarity],
            known,
            glow: d.rarity === 'genesis',
            open: known
              ? () => showTip({ title: d.name, nameClass: rarityClass(d.rarity), icon: d.icon, color: RARITY_COLOR[d.rarity], sub: info.meta, body: info.desc, lines: d.maxHp ? [{ label: '최대 체력', value: `+${d.maxHp}` }] : undefined })
              : unknown(d.rarity === 'genesis' ? GENESIS_HINT : '아직 손에 넣지 못한 장비.'),
          };
        }),
    }));
  },

  essences: () => {
    const got = new Set(store.meta.essences);
    const acts = [1, 2, 3, 4, 5];
    const tierRank = (e?: EnemyDef) => (e?.tier === 'boss' ? 2 : e?.tier === 'elite' ? 1 : 0);
    const list = [...ESSENCES.values()];
    const actOf = (id: string) => ENEMIES.get(id)?.act ?? 0;
    const groups: Group[] = acts.map((act) => ({ label: `${act}층`, cells: [] }));
    const rest: Group = { label: '그 밖', cells: [] };
    for (const d of list.sort((a, b) => actOf(a.id) - actOf(b.id) || tierRank(ENEMIES.get(a.id)) - tierRank(ENEMIES.get(b.id)) || a.grade - b.grade)) {
      const known = got.has(d.id);
      const color = d.eldritch ? '#4fffc4' : '#ff9ab0';
      const cell: Cell = {
        id: d.id,
        name: d.name,
        icon: d.icon,
        color,
        known,
        open: known
          ? () => {
              const st = essenceStats(d.id, false, true);
              const stats = (Object.entries(st) as [keyof EssenceStats, number][]).map(([k, v]) => `${STAT_NAME[k]} ${v >= 0 ? '+' : ''}${v}`).join(', ');
              showTip({
                title: d.name,
                icon: d.icon,
                color,
                sub: `${d.grade}등급 정수${ENEMIES.get(d.id) ? ` · ${actOf(d.id)}층 ${ENEMIES.get(d.id)!.name}` : ''}${d.eldritch ? ' · 이계' : ''}`,
                body: `패시브 · ${d.passive.name}\n${d.passive.desc}`,
                lines: [
                  { label: '본질', value: stats || '없음' },
                  { label: '수호자 정수의 기술', value: d.actives.map((a) => SKILLS.get(a)?.name ?? a).join(', ') || '없음' },
                ],
              });
            }
          : unknown('아직 흡수하지 못한 정수.'),
      };
      (groups[actOf(d.id) - 1] ?? rest).cells.push(cell);
    }
    return [...groups, rest].filter((g) => g.cells.length);
  },

  skills: () => {
    const got = new Set(store.meta.skills ?? []);
    const schools = ['blade', 'firearm', 'occult', 'alchemy', 'resolve', 'forbidden', 'neutral'] as const;
    const list = codexSkills();
    const cell = (d: SkillDef): Cell => {
      const known = got.has(d.id);
      const cost = lvlVal(d.cost, 0);
      const cd = lvlVal(d.cd, 0);
      return {
        id: d.id,
        name: d.name,
        icon: d.icon,
        color: SCHOOL_COLOR[d.school],
        known,
        glow: d.rarity === 'genesis',
        open: known
          ? () =>
              showTip({
                title: d.name,
                nameClass: rarityClass(d.rarity),
                icon: d.icon,
                color: SCHOOL_COLOR[d.school],
                // 예전의 합기: 두 계열로 친다 ('합기' 대신 성격 표시)
                sub: `${d.duo ? `${SCHOOL_NAME[d.duo[0]]}×${SCHOOL_NAME[d.duo[1]]} 계열을 잇는 기술` : SCHOOL_NAME[d.school]} · ${RARITY_NAME[d.rarity]}${d.type ? ` · ${DMG_NAME[d.type]}` : ''}`,
                body: skillDesc(d, 0)
                  .map((x) => x.t)
                  .join(''),
                lines: [
                  { label: '행동력', value: String(cost) },
                  { label: '재사용 대기', value: cd >= 99 ? '전투당 1회' : cd > 0 ? `${cd}턴` : '없음' },
                ],
              })
          : unknown(d.rarity === 'genesis' ? GENESIS_HINT : '아직 배우지 못한 스킬.'),
      };
    };
    // 예전의 합기도 이제 각자 계열 칸에 (조건 없이 계열 풀로 내려갔다)
    return schools.map((sc) => ({ label: SCHOOL_NAME[sc], cells: list.filter((d) => d.school === sc).sort(byRarity).map(cell) })).filter((g) => g.cells.length);
  },

  relics: () => {
    const got = new Set(store.meta.relics);
    const ranks = RARITY_ORDER.filter((r) => [...RELICS.values()].some((d) => d.rarity === r));
    return ranks.map((r) => ({
      label: RARITY_NAME[r],
      cells: [...RELICS.values()]
        .filter((d) => d.rarity === r)
        .sort(byRarity)
        .map((d) => {
          const known = got.has(d.id);
          return {
            id: d.id,
            name: d.name,
            icon: d.icon,
            color: RARITY_COLOR[d.rarity],
            known,
            open: known ? () => showTip({ title: d.name, icon: d.icon, color: RARITY_COLOR[d.rarity], sub: `유물 · ${RARITY_NAME[d.rarity]}`, body: d.desc }) : unknown('아직 얻지 못한 유물.'),
          };
        }),
    }));
  },
};

function enemyCell(e: EnemyDef, rec: { kills: number; weak: string[] } | undefined): Cell {
  return {
    id: e.id,
    name: e.name,
    icon: e.icon,
    color: e.eldritch ? '#4fffc4' : '#d8cfbf',
    known: !!rec,
    dots: rec?.weak.map((w) => DMG_COLOR[w as keyof typeof DMG_COLOR]),
    open: rec
      ? () =>
          showTip({
            title: e.name,
            icon: e.icon,
            sub: `${e.act}층 · ${e.tier === 'boss' ? '수호자' : e.tier === 'elite' ? '정예' : '일반'}`,
            body: e.desc ?? '심연에서 마주친 존재. 더 알려진 것은 없다.',
            lines: [
              { label: '처치', value: `${rec.kills}` },
              { label: '알아낸 약점', value: rec.weak.length ? rec.weak.map((w) => DMG_NAME[w as keyof typeof DMG_NAME]).join(', ') : '없음' },
              { label: '정수', value: ESSENCES.has(e.id) ? (store.meta.essences.includes(e.id) ? '흡수한 적 있음' : '있음') : '없음' },
            ],
          })
      : unknown('아직 만나지 못한 존재.'),
  };
}
