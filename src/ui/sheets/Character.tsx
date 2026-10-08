import '../../styles/sheets.css';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { AFFIXES, CONSUMABLES, EQUIPS, ESSENCES, MADNESS, RELICS, RUNES, SKILLS } from '../../engine/registry';
import { BAG_SIZE, FLASK_CAP, equipFromBag, equipSkill, essenceActives, essenceCap, essenceStats, essenceUsed, inscribeCost, pourFlask, removalCost, socketRune, takesSlot, unequip, xpToNext, type EssenceDrop, type RunState } from '../../engine/run';
import { CURE_COST } from '../../engine/places';
import { BREAKDOWN_RESET, MAX_MADNESS } from '../../engine/combat';
import { discardSkill } from '../../engine/shop';
import { HUMAN_SCHOOLS, runeSchool, skillSchools } from '../../engine/schools';
import type { EquipDef, EquipSlot, EssenceDef, EssenceStats, OwnedEssence, OwnedItem, OwnedSkill, Rarity, RuneDef, SkillDef } from '../../engine/types';
import { apply, discardItem, previewChange, previewItem, useItem, type StatChange } from '../../state/actions';
import { store } from '../../state/store';
import { sound } from '../../sound';
import { ask, type Ask } from '../ask';
import { RANGE, STAT_NAME, cdText, josa, keywordLines, schoolLabel, skillNums, skillSegs } from '../cards';
import { Icon, KeywordList, Segs, Sheet } from '../components';
import { abyssStatLine } from '../abyss';
import { DMG_NAME, INSIGHT_SOURCES, RARITY_COLOR, RARITY_NAME, SCHOOL_COLOR, SCHOOL_NAME, insightText, plain, rarityClass, skillDesc, type Seg } from '../text';

/**
 * 소지품 창. 탭마다 같은 틀: 위에 요약(몇 칸 중 몇 개) → 줄 친 목록 → 줄을 누르면 아래에서 낱장(자세히)이 올라오고,
 * 할 수 있는 행동(장착·빼기·새기기·사용·버리기)은 늘 낱장 맨 아래 같은 자리에 놓인다.
 * 상태를 바꾸는 행동은 확인 창을 거친다 (각인은 전후 비교를 보여 주는 확인 창).
 */

export type InvTab = 'skills' | 'essences' | 'equip' | 'relics' | 'items' | 'status';

const TABS: [InvTab, string][] = [
  ['skills', '스킬'],
  ['essences', '정수'],
  ['equip', '장비'],
  ['relics', '유물'],
  ['items', '소모품'],
  ['status', '상태'],
];

const RUNE_C = '#c08cff';
const LOCK = '전투 중에는 바꿀 수 없다.';
const SLOTS: EquipSlot[] = ['weapon', 'armor', 'trinket1', 'trinket2'];
const SLOT_NAME: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', trinket1: '장신구', trinket2: '장신구' };
const KIND_NAME: Record<EquipDef['slot'], string> = { weapon: '무기', armor: '방어구', trinket: '장신구' };

/** 고른 줄 */
type Sel =
  | { k: 'skill'; uid: string }
  | { k: 'slot'; i: number }
  | { k: 'rune'; i: number }
  | { k: 'essence'; uid: string }
  | { k: 'flask'; i: number }
  | { k: 'equip'; slot: EquipSlot }
  | { k: 'bag'; uid: string }
  | { k: 'relic'; id: string }
  | { k: 'item'; i: number }
  | { k: 'stat'; id: string }
  | { k: 'madness'; id: string };

/** 낱장 안의 다음 단계: 바꿀 칸 고르기 · 새길 각인 고르기 · 바꿀 장신구 고르기 */
type Mode = 'swap' | 'runes' | 'trinket' | null;

const keyOf = (s: Sel | null) => (s ? JSON.stringify(s) : '');

interface Ctx {
  run: RunState;
  sel: Sel | null;
  mode: Mode;
  setMode: (m: Mode) => void;
  /** 줄을 누름 (같은 줄을 다시 누르면 닫는다) */
  tap: (s: Sel) => void;
  /** 낱장을 이것으로 (null이면 닫기) */
  show: (s: Sel | null) => void;
  /** 행동이 끝난 뒤: 그 줄을 보여 주고 잠깐 빛낸다 */
  done: (s: Sel) => void;
  flash: string;
  /** 전투 중에는 보기만 */
  lock: boolean;
}

export interface Fig {
  k: string;
  v: ComponentChildren;
  of?: number;
  pips?: [number, number];
  word?: boolean;
  bad?: boolean;
}

interface View {
  sum: Fig[];
  body: ComponentChildren;
  detail: ComponentChildren;
}

export function CharacterSheet({ tab: initial }: { tab?: InvTab }) {
  const [tab, setTab] = useState<InvTab>(initial ?? 'skills');
  const [sel, setSel] = useState<Sel | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [flash, setFlash] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const selKey = keyOf(sel);

  useKeepVisible(listRef, selKey + (mode ?? ''));

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 1300);
    return () => clearTimeout(t);
  }, [flash]);

  const run = store.run;
  if (!run) return null;
  const close = () => {
    store.sheet = null;
    store.emit();
  };
  const show = (s: Sel | null) => {
    setSel(s);
    setMode(null);
  };
  const c: Ctx = {
    run,
    sel,
    mode,
    setMode,
    tap: (s) => show(keyOf(s) === selKey ? null : s),
    show,
    done: (s) => {
      show(s);
      setFlash(keyOf(s));
    },
    flash,
    lock: run.screen === 'combat',
  };
  const view = VIEWS[tab](c);
  return (
    <Sheet title="소지품" icon="gi:knapsack" onClose={close} fixed>
      <div class="inv">
        <div class="inv-tabs" role="tablist">
          {TABS.map(([k, n]) => (
            <button
              role="tab"
              aria-selected={tab === k}
              class={`inv-tab ${tab === k ? 'on' : ''}`}
              onClick={() => {
                if (tab === k) return;
                setTab(k);
                show(null);
                listRef.current?.scrollTo({ top: 0 });
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <Summary figs={view.sum} />
        <div class="inv-list" ref={listRef}>
          {view.body}
        </div>
        {view.detail}
      </div>
    </Sheet>
  );
}

/** 낱장이 올라와 목록이 줄어도 고른 줄(.inv-row.on)이 보이게 목록을 굴린다 (key가 바뀔 때마다) */
export function useKeepVisible(listRef: { current: HTMLDivElement | null }, key: string) {
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('.inv-row.on');
    if (!list || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTo({ top: top - 8, behavior: 'smooth' });
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTo({ top: bottom - list.clientHeight + 8, behavior: 'smooth' });
  }, [key]);
}

const VIEWS: Record<InvTab, (c: Ctx) => View> = {
  skills: skillsView,
  essences: essencesView,
  equip: equipView,
  relics: relicsView,
  items: itemsView,
  status: statusView,
};

// ───────────── 공용 조각 ─────────────

/** 「이름」 + 받침에 맞는 조사 (plus: 이름 뒤에 붙는 '+', ' +1' 같은 강화 표시) */
function q(name: string, withFinal: string, without: string, plus = ''): string {
  return `「${name}${plus}」${josa(name, withFinal, without)}`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 이름 글자색: 일반·기본은 잉크색, 그 위 등급만 등급 색 */
function rarityStyle(r: Rarity): Record<string, string> | undefined {
  return r === 'basic' || r === 'common' ? undefined : { color: RARITY_COLOR[r] };
}

/** 확인을 받고 상태를 바꾼다. 바뀌었으면 true (fn이 글을 돌려주면 그 이유로 실패) */
async function act(a: Ask, fn: (r: RunState) => string | null | void, okMsg?: string): Promise<boolean> {
  if (!(await ask(a))) return false;
  let ok = false;
  await apply((r) => {
    const why = fn(r);
    ok = typeof why !== 'string';
    return why;
  }, okMsg);
  return ok;
}

/** 미리 해 본 변화 → 확인 창의 줄 ('체력 52 → 72') */
function changeLines(ch: StatChange[]): { label: string; value: string; color?: string }[] {
  return ch.map((x) => ({ label: x.label, value: `${x.from} → ${x.to}`, color: x.to > x.from ? 'var(--good)' : '#ffb0a0' }));
}

export function Summary({ figs }: { figs: Fig[] }) {
  return (
    <div class="inv-sum">
      {figs.map((f) => (
        <div>
          <span class="k">{f.k}</span>
          <span class={`v ${f.word ? 'word' : ''} ${f.bad ? 'bad' : ''}`}>
            {f.v}
            {f.of !== undefined && <small>/{f.of}</small>}
          </span>
          {f.pips && <Pips n={f.pips[0]} max={f.pips[1]} />}
        </div>
      ))}
    </div>
  );
}

function Pips({ n, max }: { n: number; max: number }) {
  return (
    <span class="inv-pips" aria-hidden="true">
      {Array.from({ length: max }, (_, i) => (
        <i class={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

export function Head({ label, count, sub }: { label: string; count?: ComponentChildren; sub?: boolean }) {
  return (
    <div class={`inv-h ${sub ? 'sub' : ''}`}>
      <span>{label}</span>
      <i />
      {count !== undefined && <b>{count}</b>}
    </div>
  );
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="inv-empty">{children}</div>;
}

interface RowProps {
  c?: Ctx;
  /** 이 줄이 가리키는 것 (고른 표시·빛남·누르면 낱장) */
  it?: Sel;
  icon?: string;
  color?: string;
  glow?: boolean;
  lead?: ComponentChildren;
  name: ComponentChildren;
  dim?: boolean;
  meta?: ComponentChildren;
  right?: ComponentChildren;
  off?: boolean;
  /** 고른 줄 표시 (c·it 없이 직접 줄 때) */
  on?: boolean;
  onTap?: () => void;
}

export function Row(p: RowProps) {
  const on = p.on ?? (!!p.c && !!p.it && keyOf(p.it) === keyOf(p.c.sel));
  const flash = !!p.c && !!p.it && p.c.flash === keyOf(p.it);
  const tap = p.onTap ?? (p.c && p.it ? () => p.c!.tap(p.it!) : undefined);
  const inner = (
    <>
      {p.lead !== undefined && <span class="inv-lead">{p.lead}</span>}
      <span class={`inv-ic ${p.icon ? '' : 'empty'}`} style={p.color ? ({ '--c': p.color } as Record<string, string>) : undefined}>
        {p.icon && <Icon name={p.icon} size={24} color={p.color} class={p.glow ? 'genesis-glow' : undefined} />}
      </span>
      <span class="inv-txt">
        <span class={`inv-name ${p.dim ? 'dim' : ''}`}>{p.name}</span>
        {p.meta && <span class="inv-meta">{p.meta}</span>}
      </span>
      {p.right !== undefined && <span class="inv-right">{p.right}</span>}
    </>
  );
  // 누를 것이 없는 줄(빈 소모품 칸 등)은 단추가 아니다
  if (!tap) return <div class="inv-row static">{inner}</div>;
  return (
    <button class={`inv-row ${on ? 'on' : ''} ${p.off ? 'off' : ''} ${flash ? 'flash' : ''}`} aria-expanded={p.it ? on : undefined} aria-disabled={p.off ? 'true' : undefined} onClick={tap}>
      {inner}
    </button>
  );
}

export interface Act {
  label: string;
  kind?: 'main' | 'danger' | 'main danger';
  /** 지금 할 수 없는 이유 (있으면 흐리게, 누르면 이유를 알려 준다) */
  why?: string | null;
  run: () => void;
}

interface DetailProps {
  icon?: string;
  color?: string;
  glow?: boolean;
  title: ComponentChildren;
  sub?: ComponentChildren;
  acts?: Act[];
  note?: ComponentChildren;
  bad?: boolean;
  children?: ComponentChildren;
  onClose: () => void;
}

/** 아래에서 올라오는 낱장: 머리(아이콘·이름) → 내용 → 안내 한 줄 → 행동 단추 (늘 이 자리) */
export function Detail(p: DetailProps) {
  const blocked = p.acts?.find((a) => a.kind?.startsWith('main') && a.why)?.why ?? p.acts?.find((a) => a.why)?.why;
  const note = p.note ?? blocked;
  const press = (a: Act, e: Event) => {
    if (!a.why) return a.run();
    // 막힌 단추: 안내 줄이 바로 그 이유면 안내 줄을 흔들고, 아니면 알림으로
    const n = (e.currentTarget as HTMLElement).closest('.inv-detail')?.querySelector<HTMLElement>('.inv-d-note');
    if (n && n.textContent === a.why) {
      n.classList.remove('nudge');
      void n.offsetWidth;
      n.classList.add('nudge');
    } else store.toast(a.why, 'bad');
  };
  return (
    <section class="inv-detail" aria-label="자세히">
      <div class="inv-d-head">
        <span class={`inv-ic big ${p.icon ? '' : 'empty'}`} style={p.color ? ({ '--c': p.color } as Record<string, string>) : undefined}>
          {p.icon && <Icon name={p.icon} size={30} color={p.color} class={p.glow ? 'genesis-glow' : undefined} />}
        </span>
        <div class="inv-d-title">
          <div class="t">{p.title}</div>
          {p.sub && <div class="s">{p.sub}</div>}
        </div>
        <button class="inv-x" aria-label="닫기" onClick={p.onClose}>
          <Icon name="gi:cross-mark" size={18} />
        </button>
      </div>
      <div class="inv-d-body">{p.children}</div>
      {note && <div class={`inv-d-note ${p.bad || (!p.note && blocked) ? 'bad' : ''}`}>{note}</div>}
      {p.acts && p.acts.length > 0 && (
        <div class="inv-acts">
          {p.acts.map((a) => (
            <button class={`inv-btn ${a.kind ?? ''} ${a.why ? 'off' : ''}`} aria-disabled={a.why ? 'true' : undefined} onClick={(e) => press(a, e)}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Facts({ items }: { items: [string, ComponentChildren, string?][] }) {
  return (
    <div class="inv-facts">
      {items.map(([k, v, cls]) => (
        <div>
          <span class="k">{k}</span>
          <span class={`v ${cls ?? ''}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export function Stats({ st }: { st: EssenceStats }) {
  const list = (Object.entries(st) as [keyof EssenceStats, number][]).filter(([, v]) => v);
  if (!list.length) return null;
  return (
    <div class="inv-stats">
      {list.map(([k, v]) => (
        <span class={v >= 0 ? 'up' : 'down'}>
          {STAT_NAME[k]} {v >= 0 ? '+' : ''}
          {v}
        </span>
      ))}
    </div>
  );
}

export function statText(st: EssenceStats): string {
  return (Object.entries(st) as [keyof EssenceStats, number][])
    .filter(([, v]) => v)
    .map(([k, v]) => `${STAT_NAME[k]} ${v >= 0 ? '+' : ''}${v}`)
    .join(' · ');
}

// ───────────── 스킬 ─────────────

function skillName(def: SkillDef, lvl: number) {
  return (
    <span class={rarityClass(def.rarity)} style={rarityStyle(def.rarity)}>
      {def.name}
      {lvl > 0 ? '+' : ''}
    </span>
  );
}

function SkillMeta({ def, s }: { def: SkillDef; s: OwnedSkill }) {
  const n = skillNums(def, s.lvl, s.runes);
  const rd = s.runes[0] ? RUNES.get(s.runes[0]) : undefined;
  return (
    <>
      <span>
        행동력 <b>{n.cost}</b>
      </span>
      <span>
        대기 <b>{cdText(n.cd)}</b>
      </span>
      {rd && (
        <span class="rune">
          <Icon name={rd.icon} size={12} />
          {rd.name}
        </span>
      )}
    </>
  );
}

function SkillRow({ c, s, lead, onTap, off }: { c?: Ctx; s: OwnedSkill; lead?: number; onTap?: () => void; off?: boolean }) {
  const def = SKILLS.get(s.id);
  if (!def) return null;
  return (
    <Row
      c={c}
      it={onTap ? undefined : { k: 'skill', uid: s.uid }}
      lead={lead}
      icon={def.icon}
      color={SCHOOL_COLOR[def.school]}
      glow={def.rarity === 'genesis'}
      name={
        <>
          {skillName(def, s.lvl)}
          {s.from && <em class="inv-tag">정수</em>}
        </>
      }
      meta={<SkillMeta def={def} s={s} />}
      off={off}
      onTap={onTap}
    />
  );
}

/** 장착한 스킬 [스킬, 정의, 칸 번호] */
function equippedSkills(run: RunState): [OwnedSkill, SkillDef, number][] {
  const out: [OwnedSkill, SkillDef, number][] = [];
  run.slots.forEach((uid, i) => {
    const s = uid ? run.skills.find((x) => x.uid === uid) : undefined;
    const d = s && SKILLS.get(s.id);
    if (s && d) out.push([s, d, i]);
  });
  return out;
}

function skillsView(c: Ctx): View {
  const { run } = c;
  const inSlot = new Set(run.slots.filter((x): x is string => !!x));
  const book = run.skills.filter((s) => !inSlot.has(s.uid));
  const used = inSlot.size;
  const find = (uid: string | null) => (uid ? (run.skills.find((s) => s.uid === uid) ?? null) : null);
  const sum: Fig[] = [
    { k: '장착', v: used, of: run.slots.length, pips: [used, run.slots.length] },
    { k: '배운 스킬', v: book.length },
    { k: '각인', v: run.runes.length },
  ];
  const body = (
    <>
      <Head label="장착한 스킬" count={`${used}/${run.slots.length}`} />
      {run.slots.map((uid, i) => {
        const s = find(uid);
        return s ? <SkillRow c={c} s={s} lead={i + 1} /> : <Row c={c} it={{ k: 'slot', i }} lead={i + 1} name="빈 칸" dim meta={book.length ? '눌러서 스킬 넣기' : '넣을 스킬 없음'} />;
      })}
      <Head label="배운 스킬" count={book.length} />
      {book.length === 0 && <Empty>장착하지 않은 스킬이 없다.</Empty>}
      {book.map((s) => (
        <SkillRow c={c} s={s} />
      ))}
      <Head label="각인" count={run.runes.length} />
      {run.runes.length === 0 && <Empty>가진 각인이 없다.</Empty>}
      {run.runes.map((id, i) => {
        const rd = RUNES.get(id);
        return rd && <Row c={c} it={{ k: 'rune', i }} icon={rd.icon} color={RUNE_C} name={<RuneName rd={rd} />} meta={<span class="clamp">{runeDesc(rd)}</span>} />;
      })}
    </>
  );
  let detail: ComponentChildren = null;
  const sel = c.sel;
  if (sel?.k === 'skill') {
    const s = find(sel.uid);
    if (s) detail = <SkillDetail c={c} s={s} />;
  } else if (sel?.k === 'slot' && sel.i < run.slots.length && !run.slots[sel.i]) detail = <EmptySlotDetail c={c} i={sel.i} />;
  else if (sel?.k === 'rune' && run.runes[sel.i]) detail = <RuneDetail c={c} i={sel.i} />;
  return { sum, body, detail };
}

function SkillDetail({ c, s }: { c: Ctx; s: OwnedSkill }) {
  const { run } = c;
  const def = SKILLS.get(s.id);
  if (!def) return null;
  const slot = run.slots.indexOf(s.uid);
  if (c.mode === 'runes' && slot >= 0) return <RunePicker c={c} s={s} def={def} />;
  if (c.mode === 'swap' && slot < 0) return <SlotPicker c={c} s={s} def={def} />;
  const n = skillNums(def, s.lvl, s.runes);
  const segs = skillSegs(def, s.lvl, n.power);
  const kw = keywordLines(def);
  const rd = s.runes[0] ? RUNES.get(s.runes[0]) : undefined;
  const lock = c.lock ? LOCK : null;
  const acts: Act[] = [];
  if (slot >= 0) {
    acts.push({ label: '빼기', why: lock, run: () => void unequipSkill(c, s, def, slot) });
    acts.push({ label: '각인 새기기', kind: 'main', why: lock ?? (run.runes.length ? null : '가진 각인이 없다. 각인은 보상이나 상인에게서 얻는다.'), run: () => c.setMode('runes') });
  } else {
    if (!s.from) acts.push({ label: '버리기', kind: 'danger', why: lock, run: () => void discardSkillAsk(c, s, def) });
    const empty = run.slots.indexOf(null);
    acts.push(empty >= 0 ? { label: '장착', kind: 'main', why: lock, run: () => void equipInto(c, s, def, empty) } : { label: '교체', kind: 'main', why: lock, run: () => c.setMode('swap') });
  }
  return (
    <Detail
      icon={def.icon}
      color={SCHOOL_COLOR[def.school]}
      glow={def.rarity === 'genesis'}
      title={skillName(def, s.lvl)}
      sub={`${schoolLabel(def)} · ${RARITY_NAME[def.rarity]} · ${RANGE[def.range]}${def.type ? ` · ${DMG_NAME[def.type]}` : ''} · ${slot >= 0 ? `${slot + 1}번 칸` : '배운 스킬'}`}
      acts={acts}
      onClose={() => c.show(null)}
    >
      <Facts
        items={[
          ['행동력', n.cost],
          ['재사용 대기', cdText(n.cd)],
          ['각인', rd?.name ?? '없음', rd ? 'rune' : ''],
        ]}
      />
      <p class="inv-desc">
        <Segs segs={segs} />
      </p>
      {/* 만드는 것·읽는 것 한 줄 (조합 찾기용, engine/keywords.ts) */}
      {kw.length > 0 && (
        <p class="inv-small inv-kw">
          {kw.map((l, i) => (
            <>
              {i > 0 && ' · '}
              {l.label} <b>{l.value}</b>
            </>
          ))}
        </p>
      )}
      {rd && (
        <div class="inv-block rune">
          <b class="bt">
            <Icon name={rd.icon} size={14} />
            <RuneName rd={rd} />
          </b>
          {runeDesc(rd)}
        </div>
      )}
      {s.from && <p class="inv-small">정수에서 얻은 기술이다. 그 정수를 깨뜨리면 함께 사라진다.</p>}
      <KeywordList text={plain(segs) + (rd ? ` ${rd.desc}` : '')} exclude={def.name} />
    </Detail>
  );
}

/** 배운 스킬을 칸에 넣는다 (칸에 스킬이 있으면 바꾼다) */
async function equipInto(c: Ctx, s: OwnedSkill, def: SkillDef, slot: number) {
  if (c.lock) return void store.toast(LOCK, 'bad');
  const curUid = c.run.slots[slot];
  const cur = curUid ? c.run.skills.find((x) => x.uid === curUid) : undefined;
  const curDef = cur ? SKILLS.get(cur.id) : undefined;
  const plus = s.lvl > 0 ? '+' : '';
  const ok = await act(
    cur && curDef
      ? {
          title: `${q(curDef.name, '을', '를', cur.lvl > 0 ? '+' : '')} 빼고 ${q(def.name, '을', '를', plus)} 넣을까요?`,
          icon: def.icon,
          color: SCHOOL_COLOR[def.school],
          body: `${slot + 1}번 칸의 스킬을 바꿔요. 뺀 스킬은 배운 스킬 목록으로 돌아가요.`,
          ok: '교체',
        }
      : { title: `${q(def.name, '을', '를', plus)} 장착할까요?`, icon: def.icon, color: SCHOOL_COLOR[def.school], body: `${slot + 1}번 칸에 넣어요.`, ok: '장착' },
    (r) => equipSkill(r, slot, s.uid),
    cur ? '스킬을 바꿨다' : '스킬을 장착했다',
  );
  if (ok) c.done({ k: 'skill', uid: s.uid });
}

async function unequipSkill(c: Ctx, s: OwnedSkill, def: SkillDef, slot: number) {
  const ok = await act(
    {
      title: `${q(def.name, '을', '를', s.lvl > 0 ? '+' : '')} 뺄까요?`,
      icon: def.icon,
      color: SCHOOL_COLOR[def.school],
      body: `배운 스킬 목록으로 돌아가요.${s.runes.length ? ' 새긴 각인은 스킬에 그대로 남아요.' : ''}`,
      ok: '빼기',
    },
    (r) => equipSkill(r, slot, null),
    '스킬을 뺐다',
  );
  if (ok) c.done({ k: 'skill', uid: s.uid });
}

async function discardSkillAsk(c: Ctx, s: OwnedSkill, def: SkillDef) {
  const ok = await act(
    {
      title: `${q(def.name, '을', '를', s.lvl > 0 ? '+' : '')} 버릴까요?`,
      icon: def.icon,
      color: 'var(--bad)',
      body: `되돌릴 수 없어요.${s.runes.length ? ' 새겨 둔 각인은 돌려받아요.' : ''} 상인에게 팔면 골드를 받을 수 있어요.`,
      ok: '버리기',
      danger: true,
    },
    (r) => discardSkill(r, s.uid),
    '스킬을 버렸다',
  );
  if (ok) c.show(null);
}

/** 칸이 모두 찼을 때: 어느 칸과 바꿀지 고른다 */
function SlotPicker({ c, s, def }: { c: Ctx; s: OwnedSkill; def: SkillDef }) {
  return (
    <Detail icon={def.icon} color={SCHOOL_COLOR[def.school]} title="어느 칸과 바꿀까?" sub={`${q(def.name, '을', '를', s.lvl > 0 ? '+' : '')} 넣을 칸 선택`} acts={[{ label: '뒤로', run: () => c.setMode(null) }]} onClose={() => c.show(null)}>
      {equippedSkills(c.run).map(([o, , i]) => (
        <SkillRow s={o} lead={i + 1} onTap={() => void equipInto(c, s, def, i)} />
      ))}
    </Detail>
  );
}

/** 빈 칸을 누름: 넣을 스킬을 고른다 */
function EmptySlotDetail({ c, i }: { c: Ctx; i: number }) {
  const inSlot = new Set(c.run.slots);
  const book = c.run.skills.filter((s) => !inSlot.has(s.uid));
  return (
    <Detail title={`${i + 1}번 칸`} sub="빈 칸. 넣을 스킬 선택" note={c.lock ? LOCK : undefined} bad={c.lock} onClose={() => c.show(null)}>
      {book.length === 0 && <Empty>장착하지 않은 스킬이 없다.</Empty>}
      {book.map((s) => {
        const d = SKILLS.get(s.id);
        return d && <SkillRow s={s} off={c.lock} onTap={() => void equipInto(c, s, d, i)} />;
      })}
    </Detail>
  );
}

// ── 각인 ──

/** 계열 각인의 계열 칩 ('검술'). 무계열이면 없다 */
function SchoolChip({ id }: { id: string }) {
  const s = runeSchool(id);
  if (!s) return null;
  return (
    <span class="sc-chip" style={{ '--c': SCHOOL_COLOR[s] } as Record<string, string>}>
      {SCHOOL_NAME[s]}
    </span>
  );
}

/** 각인 이름 + 계열 칩 */
function RuneName({ rd }: { rd: RuneDef }) {
  return (
    <>
      {rd.name}
      <SchoolChip id={rd.id} />
    </>
  );
}

/** 각인 설명. 계열 칩이 따로 보이므로 끝의 'X 계열'은 뺀다 */
function runeDesc(rd: RuneDef): string {
  const s = runeSchool(rd.id);
  return s ? rd.desc.replace(new RegExp(`[.\\s]*${SCHOOL_NAME[s]} 계열\\s*$`), '') : rd.desc;
}

/** 이 스킬에 이 각인을 새길 수 없는 이유 */
function runeWhy(rd: RuneDef, def: SkillDef, s: OwnedSkill): string | null {
  if (s.runes.includes(rd.id)) return '이미 새긴 각인';
  if (rd.fits && !rd.fits(def)) return '이 스킬에는 새길 수 없음';
  return null;
}

/** 새기면 바뀌는 수치 한 줄 ('대기 1턴→2턴') */
function runeDelta(def: SkillDef, s: OwnedSkill, rune: string): string {
  const a = skillNums(def, s.lvl, s.runes);
  const b = skillNums(def, s.lvl, [rune]);
  const out: string[] = [];
  if (a.cost !== b.cost) out.push(`행동력 ${a.cost}→${b.cost}`);
  if (a.cd !== b.cd) out.push(`대기 ${cdText(a.cd)}→${cdText(b.cd)}`);
  if (a.power !== b.power) out.push(`위력 ${pct(a.power)}→${pct(b.power)}`);
  return out.join(' · ');
}

/** (가) 스킬에서 '각인 새기기': 가진 각인 중에서 고른다 */
function RunePicker({ c, s, def }: { c: Ctx; s: OwnedSkill; def: SkillDef }) {
  const cur = s.runes[0] ? RUNES.get(s.runes[0]) : undefined;
  return (
    <Detail
      icon="gi:rune-stone"
      color={RUNE_C}
      title="새길 각인 선택"
      sub={`「${def.name}${s.lvl > 0 ? '+' : ''}」 · 지금 각인 ${cur?.name ?? '없음'}`}
      acts={[{ label: '뒤로', run: () => c.setMode(null) }]}
      onClose={() => c.show(null)}
    >
      {c.run.runes.map((id, i) => {
        const rd = RUNES.get(id);
        if (!rd) return null;
        const why = runeWhy(rd, def, s);
        const delta = why ? '' : runeDelta(def, s, id);
        return (
          <Row
            icon={rd.icon}
            color={RUNE_C}
            name={<RuneName rd={rd} />}
            off={!!why}
            meta={
              why ? (
                <span class="warn">{why}</span>
              ) : (
                <>
                  <span class="clamp">{runeDesc(rd)}</span>
                  {delta && <span class="delta">{delta}</span>}
                </>
              )
            }
            onTap={() => (why ? store.toast(why, 'bad') : void inscribe(c, s, i))}
          />
        );
      })}
      <p class="inv-small">스킬마다 각인은 하나다. 이미 각인이 있으면 빠져서 각인 목록으로 돌아온다.</p>
    </Detail>
  );
}

/** (나) 각인을 누름: 새길 수 있는 장착 스킬을 고른다 */
function RuneDetail({ c, i }: { c: Ctx; i: number }) {
  const id = c.run.runes[i];
  const rd = RUNES.get(id);
  if (!rd) return null;
  const eq = equippedSkills(c.run);
  const can = eq.filter(([s, d]) => !runeWhy(rd, d, s));
  const no = eq.length - can.length;
  return (
    <Detail icon={rd.icon} color={RUNE_C} title={<RuneName rd={rd} />} sub={`각인 · ${RARITY_NAME[rd.rarity]}`} note={c.lock ? LOCK : undefined} bad={c.lock} onClose={() => c.show(null)}>
      <p class="inv-desc">{runeDesc(rd)}</p>
      <Head label="새길 스킬 선택" count={can.length} sub />
      {eq.length === 0 && <Empty>장착한 스킬이 없다.</Empty>}
      {can.map(([s, d, slot]) => {
        const cur = s.runes[0] ? RUNES.get(s.runes[0]) : undefined;
        const delta = runeDelta(d, s, id);
        return (
          <Row
            lead={slot + 1}
            icon={d.icon}
            color={SCHOOL_COLOR[d.school]}
            name={skillName(d, s.lvl)}
            off={c.lock}
            meta={
              <>
                {cur ? <span class="rune">지금 {cur.name}</span> : <span>각인 없음</span>}
                {delta && <span class="delta">{delta}</span>}
              </>
            }
            onTap={() => (c.lock ? store.toast(LOCK, 'bad') : void inscribe(c, s, i))}
          />
        );
      })}
      {no > 0 && <p class="inv-small">장착한 스킬 중 {no}개에는 이 각인을 새길 수 없다.</p>}
      <p class="inv-small">스킬마다 각인은 하나다. 이미 각인이 있으면 빠져서 각인 목록으로 돌아온다.</p>
      <KeywordList text={rd.desc} exclude={rd.name} />
    </Detail>
  );
}

/** 각인을 새긴다: 전후 비교를 보여 주는 확인 창 (확인 창을 꺼 두어도 이 비교는 보여 준다) */
async function inscribe(c: Ctx, s: OwnedSkill, idx: number) {
  if (c.lock) return void store.toast(LOCK, 'bad');
  const id = c.run.runes[idx];
  const rd = id ? RUNES.get(id) : undefined;
  const def = SKILLS.get(s.id);
  if (!rd || !def) return;
  const ok = await act(
    {
      title: `「${def.name}${s.lvl > 0 ? '+' : ''}」에 ${rd.name}${josa(rd.name, '을', '를')} 새길까요?`,
      icon: rd.icon,
      color: RUNE_C,
      body: <RuneCompare def={def} s={s} rune={id} />,
      ok: '새기기',
      always: true,
    },
    (r) => (socketRune(r, s.uid, idx) ? null : '이 스킬에는 새길 수 없음'),
    '각인을 새겼다',
  );
  if (!ok) return;
  sound.sfx('buff', { volume: 0.5 });
  c.done({ k: 'skill', uid: s.uid });
}

/** 각인 전후 비교: 행동력·재사용 대기·위력, 바뀌는 설명, 더해지는 효과, 빠지는 각인 */
function RuneCompare({ def, s, rune }: { def: SkillDef; s: OwnedSkill; rune: string }) {
  const rd = RUNES.get(rune);
  const old = s.runes[0] ? RUNES.get(s.runes[0]) : undefined;
  const a = skillNums(def, s.lvl, s.runes);
  const b = skillNums(def, s.lvl, [rune]);
  // d > 0: 좋아짐, d < 0: 나빠짐
  const rows: { k: string; from: string; to: string; d: number }[] = [
    { k: '행동력', from: String(a.cost), to: String(b.cost), d: Math.sign(a.cost - b.cost) },
    { k: '재사용 대기', from: cdText(a.cd), to: cdText(b.cd), d: Math.sign(a.cd - b.cd) },
  ];
  if (a.power !== 1 || b.power !== 1) rows.push({ k: '위력', from: pct(a.power), to: pct(b.power), d: Math.sign(b.power - a.power) });
  return (
    <div class="inv-cmp">
      <div class="rows">
        {rows.map((r) => (
          <div>
            <span class="k">{r.k}</span>
            {r.from === r.to ? (
              <span class="v same">{r.to} 그대로</span>
            ) : (
              <span class="v">
                <s>{r.from}</s> → <span class={r.d > 0 ? 'up' : r.d < 0 ? 'down' : ''}>{r.to}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div class="h">설명</div>
      <div class="d">
        <DiffSegs a={skillSegs(def, s.lvl, a.power)} b={skillSegs(def, s.lvl, b.power)} />
      </div>
      {rd && (
        <>
          <div class="h add">더해지는 효과</div>
          <div class="d add">
            <b class="name">
              <Icon name={rd.icon} size={14} color={RUNE_C} />
              <RuneName rd={rd} />
            </b>
            {runeDesc(rd)}
          </div>
        </>
      )}
      {old && (
        <>
          <div class="h out">빠지는 각인</div>
          <div class="d out">
            <b class="name">
              <Icon name={old.icon} size={14} />
              <RuneName rd={old} />
            </b>
            {runeDesc(old)}
            <div class="same">빠진 각인은 각인 목록으로 돌아와요.</div>
          </div>
        </>
      )}
    </div>
  );
}

/** 바뀐 수치만 「전 → 후」로 */
function DiffSegs({ a, b }: { a: Seg[]; b: Seg[] }) {
  const aligned = a.length === b.length;
  return (
    <>
      {b.map((sg, i) => {
        const o = aligned ? a[i] : null;
        if (sg.k && o && o.t !== sg.t)
          return (
            <span>
              <s>{o.t}</s> <b class={Number(sg.t) > Number(o.t) ? 'up' : 'down'}>{sg.t}</b>
            </span>
          );
        return sg.k ? <b class="kv">{sg.t}</b> : sg.t;
      })}
    </>
  );
}

// ───────────── 정수 ─────────────

const essColor = (d: EssenceDef) => (d.eldritch ? '#4fffc4' : '#ff9ab0');

function essencesView(c: Ctx): View {
  const { run } = c;
  const cap = essenceCap(run);
  const used = essenceUsed(run);
  const flasks = run.flasks ?? [];
  const sum: Fig[] = [
    { k: '정수 자리', v: used, of: cap, pips: [used, cap] },
    { k: '흡수한 정수', v: run.essences.length },
    { k: '정수 병', v: flasks.length, of: FLASK_CAP },
  ];
  const body = (
    <>
      <Head label="흡수한 정수" count={run.essences.length} />
      {run.essences.length === 0 && <Empty>아직 흡수한 정수가 없다. 몬스터를 쓰러뜨리면 가끔 정수가 떨어진다.</Empty>}
      {run.essences.map((es) => {
        const d = ESSENCES.get(es.id);
        return (
          d && (
            <Row
              c={c}
              it={{ k: 'essence', uid: es.uid }}
              icon={d.icon}
              color={essColor(d)}
              name={
                <>
                  {d.name}
                  {es.guardian && <em class="inv-tag">수호자</em>}
                  {d.lord && <em class="inv-tag">계층</em>}
                </>
              }
              meta={
                <>
                  <span>{d.grade}등급</span>
                  <span>{statText(essenceStats(es.id, es.guardian, es.core))}</span>
                </>
              }
            />
          )
        );
      })}
      <Head label="정수 병" count={`${flasks.length}/${FLASK_CAP}`} />
      {flasks.length === 0 && <Empty>비어 있다. 전투 뒤 떨어진 정수를 병에 담아 두었다가 신전에서 새길 수 있다.</Empty>}
      {flasks.map((f, i) => {
        const d = ESSENCES.get(f.id);
        return (
          d && (
            <Row
              c={c}
              it={{ k: 'flask', i }}
              icon={d.icon}
              color={essColor(d)}
              name={
                <>
                  {d.name}
                  {f.guardian && <em class="inv-tag">수호자</em>}
                </>
              }
              meta={
                <>
                  <span>병에 담음 · {d.grade}등급</span>
                  <span>
                    새기는 값 <b>{inscribeCost(f)}</b>골드
                  </span>
                </>
              }
            />
          )
        );
      })}
    </>
  );
  let detail: ComponentChildren = null;
  const sel = c.sel;
  if (sel?.k === 'essence') {
    const es = run.essences.find((e) => e.uid === sel.uid);
    if (es) detail = <EssenceDetail c={c} es={es} />;
  } else if (sel?.k === 'flask' && flasks[sel.i]) detail = <FlaskDetail c={c} i={sel.i} f={flasks[sel.i]} />;
  return { sum, body, detail };
}

function EssenceDetail({ c, es }: { c: Ctx; es: OwnedEssence }) {
  const d = ESSENCES.get(es.id);
  if (!d) return null;
  const skills = essenceActives(es);
  const note = takesSlot(es.id)
    ? `정수를 깨뜨리려면 신전에서 값을 치러야 한다(지금 ${removalCost(c.run)}골드). 자리가 꽉 찼을 때는 새 정수를 들이면서 하나를 깨뜨려 바꿀 수 있다.`
    : '계층정수는 깨뜨릴 수 없고 정수 자리도 차지하지 않는다.';
  return (
    <Detail icon={d.icon} color={essColor(d)} title={d.name} sub={`${d.grade}등급 정수${es.guardian ? ' · 수호자' : ''}${d.eldritch ? ' · 이계' : ''}${d.lord ? ' · 계층정수' : ''}`} note={note} onClose={() => c.show(null)}>
      <Stats st={essenceStats(es.id, es.guardian, es.core)} />
      <div class="inv-block essence">
        <b class="bt">패시브 · {d.passive.name}</b>
        {d.passive.desc}
      </div>
      {skills.map((id) => {
        const sd = SKILLS.get(id);
        const lvl = c.run.skills.find((x) => x.from === es.uid && x.id === id)?.lvl ?? 0;
        return (
          sd && (
            <div class="inv-block">
              <b class="bt">
                <Icon name={sd.icon} size={14} color={SCHOOL_COLOR[sd.school]} />
                기술 · {sd.name}
                {lvl > 0 ? '+' : ''}
              </b>
              <Segs segs={skillDesc(sd, lvl)} />
            </div>
          )
        );
      })}
      {d.eldritch && <p class="inv-small eld">이계의 정수. 흡수할 때 최대 정신력 -5를 치렀다.</p>}
      <KeywordList text={d.passive.desc} exclude={d.passive.name} />
    </Detail>
  );
}

function FlaskDetail({ c, i, f }: { c: Ctx; i: number; f: EssenceDrop }) {
  const d = ESSENCES.get(f.id);
  if (!d) return null;
  const pour = async () => {
    const ok = await act(
      { title: `병에 담은 ${d.name}${josa(d.name, '을', '를')} 버릴까요?`, icon: 'gi:round-bottom-flask', color: 'var(--bad)', body: '병이 비고 정수는 사라져요. 되돌릴 수 없어요.', ok: '버리기', danger: true },
      (r) => pourFlask(r, i),
      '병을 비웠다',
    );
    if (ok) c.show(null);
  };
  return (
    <Detail
      icon={d.icon}
      color={essColor(d)}
      title={d.name}
      sub={`병에 담은 정수 · ${d.grade}등급${f.guardian ? ' · 수호자' : ''}${d.eldritch ? ' · 이계' : ''}`}
      note={c.lock ? undefined : `신전이나 거점의 신전에서 ${inscribeCost(f)}골드를 내고 새길 수 있다.`}
      acts={[{ label: '버리기', kind: 'danger', why: c.lock ? LOCK : null, run: () => void pour() }]}
      onClose={() => c.show(null)}
    >
      <Stats st={essenceStats(f.id, f.guardian, true)} />
      <div class="inv-block essence">
        <b class="bt">패시브 · {d.passive.name}</b>
        {d.passive.desc}
      </div>
      {f.guardian && <p class="inv-small">수호자의 정수라 새길 때 그 존재의 기술 하나를 함께 고를 수 있다.</p>}
      {d.eldritch && <p class="inv-small eld">이계의 정수. 새기면 최대 정신력 -5.</p>}
      <KeywordList text={d.passive.desc} exclude={d.passive.name} />
    </Detail>
  );
}

// ───────────── 장비 ─────────────

function equipName(def: EquipDef, lvl: number) {
  const gen = def.rarity === 'genesis';
  return (
    <span class={gen ? rarityClass('genesis') : ''} style={rarityStyle(def.rarity)}>
      {def.name}
      {lvl > 0 ? ` +${lvl}` : ''}
    </span>
  );
}

function equipMeta(def: EquipDef): ComponentChildren {
  const sk = def.skill ? SKILLS.get(def.skill) : undefined;
  return (
    <>
      <span>
        {KIND_NAME[def.slot]} · {RARITY_NAME[def.rarity]}
      </span>
      {def.maxHp ? <span class="good">최대 체력 +{def.maxHp}</span> : null}
      {sk ? <span>기본기 {sk.name}</span> : <span class="clamp1">{def.desc}</span>}
    </>
  );
}

function fitsSlot(def: EquipDef, slot: EquipSlot): boolean {
  return def.slot === 'trinket' ? slot.startsWith('trinket') : def.slot === slot;
}

function equipView(c: Ctx): View {
  const { run } = c;
  const n = SLOTS.filter((s) => run.equip[s]).length;
  const full = run.bag.length >= BAG_SIZE;
  const sum: Fig[] = [
    { k: '장착', v: n, of: SLOTS.length, pips: [n, SLOTS.length] },
    { k: '가방', v: run.bag.length, of: BAG_SIZE, bad: full },
  ];
  const body = (
    <>
      <Head label="장착한 장비" count={`${n}/${SLOTS.length}`} />
      {SLOTS.map((slot) => {
        const it = run.equip[slot];
        const def = it && EQUIPS.get(it.id);
        if (it && def) return <Row c={c} it={{ k: 'equip', slot }} icon={def.icon} color={RARITY_COLOR[def.rarity]} glow={def.rarity === 'genesis'} name={withAffix(equipName(def, it.lvl), it.aff)} meta={equipMeta(def)} />;
        const can = run.bag.some((b) => {
          const d = EQUIPS.get(b.id);
          return d && fitsSlot(d, slot);
        });
        return <Row c={c} it={{ k: 'equip', slot }} name={`${SLOT_NAME[slot]} 칸`} dim meta={can ? '가방에 넣을 장비 있음' : '빈 칸'} />;
      })}
      <Head label="가방" count={`${run.bag.length}/${BAG_SIZE}`} />
      {run.bag.length === 0 && <Empty>가방이 비어 있다.</Empty>}
      {run.bag.map((it) => {
        const def = EQUIPS.get(it.id);
        return def && <Row c={c} it={{ k: 'bag', uid: it.uid }} icon={def.icon} color={RARITY_COLOR[def.rarity]} glow={def.rarity === 'genesis'} name={withAffix(equipName(def, it.lvl), it.aff)} meta={equipMeta(def)} />;
      })}
    </>
  );
  let detail: ComponentChildren = null;
  const sel = c.sel;
  if (sel?.k === 'equip') {
    const it = run.equip[sel.slot];
    detail = it ? <EquipDetail c={c} it={it} slot={sel.slot} /> : <EmptyEquipDetail c={c} slot={sel.slot} />;
  } else if (sel?.k === 'bag') {
    const it = run.bag.find((b) => b.uid === sel.uid);
    if (it) detail = <BagDetail c={c} it={it} />;
  }
  return { sum, body, detail };
}

/** 장비 낱장의 공통 내용: 칸·강화·최대 체력, 설명, 기본기 (children: 용어 풀이 앞에 끼울 비교) */
/** 장비 이름 앞에 접사 ('날선 · 굳센 사냥칼 +1' — 접사는 보랏빛) */
function withAffix(name: ComponentChildren, aff?: string[]): ComponentChildren {
  const pre = (aff ?? []).map((a) => AFFIXES.get(a)?.name).filter(Boolean);
  if (!pre.length) return name;
  return (
    <>
      <span style={{ color: '#d9c2ff' }}>{pre.join(' · ')}</span> {name}
    </>
  );
}

function EquipBody({ def, lvl, aff, children }: { def: EquipDef; lvl: number; aff?: string[]; children?: ComponentChildren }) {
  const sk = def.skill ? SKILLS.get(def.skill) : undefined;
  const n = sk ? skillNums(sk, lvl) : null;
  const segs = sk ? skillDesc(sk, lvl) : [];
  return (
    <>
      <Facts
        items={[
          ['칸', KIND_NAME[def.slot]],
          ['강화', lvl > 0 ? `+${lvl}` : '없음'],
          ['최대 체력', def.maxHp ? `+${def.maxHp}` : '없음'],
        ]}
      />
      <p class="inv-desc">{def.desc}</p>
      {/* 접사 (2026-10 성장 개편 — 얻을 때 층에 따라 무작위로 붙는다) */}
      {aff && aff.length > 0 && (
        <div class="inv-block">
          <b class="bt">
            <Icon name="gi:anvil" size={14} color="#c8a0ff" />
            접사
          </b>
          {aff.map((a) => (
            <div class="inv-small" style={{ margin: '2px 0 0' }}>
              <b style={{ color: '#d9c2ff' }}>{AFFIXES.get(a)?.name}</b> {AFFIXES.get(a)?.desc}
            </div>
          ))}
        </div>
      )}
      {sk && n && (
        <div class="inv-block">
          <b class="bt">
            <Icon name={sk.icon} size={14} color={SCHOOL_COLOR[sk.school]} />
            {def.slot === 'weapon' ? '기본 공격' : '기본 방어'} · {sk.name}
          </b>
          <Segs segs={segs} />
          <div class="inv-small" style={{ margin: '2px 0 0' }}>
            행동력 {n.cost} · 재사용 대기 {cdText(n.cd)}
          </div>
        </div>
      )}
      {children}
      <KeywordList text={def.desc + (sk ? ` ${plain(segs)}` : '')} exclude={def.name} />
    </>
  );
}

function EquipDetail({ c, it, slot }: { c: Ctx; it: OwnedItem; slot: EquipSlot }) {
  const def = EQUIPS.get(it.id);
  if (!def) return null;
  const full = c.run.bag.length >= BAG_SIZE;
  return (
    <Detail
      icon={def.icon}
      color={RARITY_COLOR[def.rarity]}
      glow={def.rarity === 'genesis'}
      title={withAffix(equipName(def, it.lvl), it.aff)}
      sub={`${SLOT_NAME[slot]} · ${RARITY_NAME[def.rarity]} · 장착 중`}
      acts={[{ label: '해제', kind: 'main', why: c.lock ? LOCK : full ? `가방이 가득 찼다(${BAG_SIZE}/${BAG_SIZE}). 해제하려면 가방을 비워야 한다.` : null, run: () => void unequipAsk(c, it, def, slot) }]}
      onClose={() => c.show(null)}
    >
      <EquipBody def={def} lvl={it.lvl} aff={it.aff} />
    </Detail>
  );
}

function BagDetail({ c, it }: { c: Ctx; it: OwnedItem }) {
  const { run } = c;
  const def = EQUIPS.get(it.id);
  if (!def) return null;
  const targets: EquipSlot[] = def.slot === 'trinket' ? ['trinket1', 'trinket2'] : [def.slot];
  const empty = targets.find((s) => !run.equip[s]);
  const lock = c.lock ? LOCK : null;
  if (c.mode === 'trinket' && !empty) return <TrinketPicker c={c} it={it} def={def} />;
  const act: Act = empty
    ? { label: '장착', kind: 'main', why: lock, run: () => void equipAsk(c, it, def, empty) }
    : targets.length === 1
      ? { label: '교체', kind: 'main', why: lock, run: () => void equipAsk(c, it, def, targets[0]) }
      : { label: '교체', kind: 'main', why: lock, run: () => c.setMode('trinket') };
  return (
    <Detail icon={def.icon} color={RARITY_COLOR[def.rarity]} glow={def.rarity === 'genesis'} title={withAffix(equipName(def, it.lvl), it.aff)} sub={`${KIND_NAME[def.slot]} · ${RARITY_NAME[def.rarity]} · 가방`} acts={[act]} onClose={() => c.show(null)}>
      <EquipBody def={def} lvl={it.lvl} aff={it.aff}>
        <Head label={empty ? '장착하면' : '지금 장착한 것과 비교'} sub />
        {empty ? (
          <p class="inv-small">비어 있는 {SLOT_NAME[empty]} 칸에 들어간다.</p>
        ) : (
          targets.map((s) => {
            const cur = run.equip[s];
            const cd = cur && EQUIPS.get(cur.id);
            if (!cur || !cd) return null;
            const hpA = cd.maxHp ?? 0;
            const hpB = def.maxHp ?? 0;
            const skA = cd.skill ? SKILLS.get(cd.skill)?.name : undefined;
            const skB = def.skill ? SKILLS.get(def.skill)?.name : undefined;
            return (
              <div class="inv-block cur">
                <b class="bt">
                  <Icon name={cd.icon} size={14} color={RARITY_COLOR[cd.rarity]} />
                  지금 · {cd.name}
                  {cur.lvl > 0 ? ` +${cur.lvl}` : ''}
                </b>
                {cd.desc}
                {hpA !== hpB && (
                  <div class="inv-small" style={{ margin: '2px 0 0' }}>
                    최대 체력 +{hpA} → <span style={{ color: hpB > hpA ? '#a8f0bc' : '#ffb4a6', fontWeight: 700 }}>+{hpB}</span>
                  </div>
                )}
                {skA && skB && skA !== skB && (
                  <div class="inv-small" style={{ margin: '2px 0 0' }}>
                    기본기 {skA} → {skB}
                  </div>
                )}
              </div>
            );
          })
        )}
      </EquipBody>
    </Detail>
  );
}

/** 장신구 칸이 둘 다 찼을 때: 어느 쪽과 바꿀지 */
function TrinketPicker({ c, it, def }: { c: Ctx; it: OwnedItem; def: EquipDef }) {
  return (
    <Detail icon={def.icon} color={RARITY_COLOR[def.rarity]} title="어느 장신구와 바꿀까?" sub={`${q(def.name, '을', '를', it.lvl > 0 ? ` +${it.lvl}` : '')} 넣을 칸 선택`} acts={[{ label: '뒤로', run: () => c.setMode(null) }]} onClose={() => c.show(null)}>
      {(['trinket1', 'trinket2'] as const).map((s) => {
        const cur = c.run.equip[s];
        const cd = cur && EQUIPS.get(cur.id);
        return cur && cd && <Row icon={cd.icon} color={RARITY_COLOR[cd.rarity]} name={equipName(cd, cur.lvl)} meta={<span class="clamp">{cd.desc}</span>} onTap={() => void equipAsk(c, it, def, s)} />;
      })}
    </Detail>
  );
}

/** 빈 장비 칸을 누름: 가방에서 맞는 장비를 고른다 */
function EmptyEquipDetail({ c, slot }: { c: Ctx; slot: EquipSlot }) {
  const fits = c.run.bag.filter((b) => {
    const d = EQUIPS.get(b.id);
    return d && fitsSlot(d, slot);
  });
  return (
    <Detail title={`${SLOT_NAME[slot]} 칸`} sub="빈 칸" note={c.lock ? LOCK : undefined} bad={c.lock} onClose={() => c.show(null)}>
      {fits.length === 0 ? <Empty>가방에 이 칸에 맞는 장비가 없다.</Empty> : <Head label="가방에서 고르기" count={fits.length} sub />}
      {fits.map((b) => {
        const d = EQUIPS.get(b.id);
        return d && <Row icon={d.icon} color={RARITY_COLOR[d.rarity]} name={equipName(d, b.lvl)} meta={equipMeta(d)} off={c.lock} onTap={() => (c.lock ? store.toast(LOCK, 'bad') : void equipAsk(c, b, d, slot))} />;
      })}
    </Detail>
  );
}

async function equipAsk(c: Ctx, it: OwnedItem, def: EquipDef, slot: EquipSlot) {
  if (c.lock) return void store.toast(LOCK, 'bad');
  const cur = c.run.equip[slot];
  const curDef = cur ? EQUIPS.get(cur.id) : undefined;
  const plus = it.lvl > 0 ? ` +${it.lvl}` : '';
  const lines = changeLines(previewChange(c.run, (r) => equipFromBag(r, it.uid, slot)));
  const ok = await act(
    cur && curDef
      ? {
          title: `${q(curDef.name, '을', '를', cur.lvl > 0 ? ` +${cur.lvl}` : '')} 빼고 ${q(def.name, '을', '를', plus)} 장착할까요?`,
          icon: def.icon,
          color: RARITY_COLOR[def.rarity],
          body: '뺀 장비는 가방으로 가요.',
          lines,
          ok: '교체',
        }
      : { title: `${q(def.name, '을', '를', plus)} 장착할까요?`, icon: def.icon, color: RARITY_COLOR[def.rarity], body: `${SLOT_NAME[slot]} 칸에 장착해요.`, lines, ok: '장착' },
    (r) => (equipFromBag(r, it.uid, slot) ? null : '장착할 수 없음'),
    cur ? '장비를 바꿨다' : '장비를 장착했다',
  );
  if (ok) c.done({ k: 'equip', slot });
}

async function unequipAsk(c: Ctx, it: OwnedItem, def: EquipDef, slot: EquipSlot) {
  const lines = changeLines(previewChange(c.run, (r) => unequip(r, slot)));
  const ok = await act(
    {
      title: `${q(def.name, '을', '를', it.lvl > 0 ? ` +${it.lvl}` : '')} 해제할까요?`,
      icon: def.icon,
      color: RARITY_COLOR[def.rarity],
      body: def.maxHp ? '가방으로 옮겨요. 이 장비로 늘어난 최대 체력과 체력이 줄어요.' : '가방으로 옮겨요.',
      lines,
      ok: '해제',
    },
    (r) => (unequip(r, slot) ? null : `가방이 가득 찼다(${BAG_SIZE}/${BAG_SIZE})`),
    '장비를 해제했다',
  );
  if (ok) c.done({ k: 'bag', uid: it.uid });
}

// ───────────── 유물 ─────────────

function relicsView(c: Ctx): View {
  const { run } = c;
  const sum: Fig[] = [{ k: '유물', v: run.relics.length }];
  const body = (
    <>
      <Head label="유물" count={run.relics.length} />
      {run.relics.length === 0 && <Empty>아직 유물이 없다. 정예와 수호자를 쓰러뜨리면 얻을 수 있다.</Empty>}
      {run.relics.map((r) => {
        const d = RELICS.get(r.id);
        return (
          d && (
            <Row
              c={c}
              it={{ k: 'relic', id: r.id }}
              icon={d.icon}
              color={RARITY_COLOR[d.rarity]}
              glow={d.rarity === 'genesis'}
              name={<span style={rarityStyle(d.rarity)}>{d.name}</span>}
              meta={<span class="clamp">{d.desc}</span>}
              right={d.counter ? r.n : undefined}
            />
          )
        );
      })}
    </>
  );
  let detail: ComponentChildren = null;
  const sel = c.sel;
  if (sel?.k === 'relic') {
    const r = run.relics.find((x) => x.id === sel.id);
    const d = r && RELICS.get(r.id);
    if (r && d)
      detail = (
        <Detail icon={d.icon} color={RARITY_COLOR[d.rarity]} title={<span style={rarityStyle(d.rarity)}>{d.name}</span>} sub={`유물 · ${RARITY_NAME[d.rarity]}`} onClose={() => c.show(null)}>
          <p class="inv-desc">{d.desc}</p>
          {d.counter && <p class="inv-small">지금 쌓인 수: {r.n}</p>}
          <KeywordList text={d.desc} exclude={d.name} />
        </Detail>
      );
  }
  return { sum, body, detail };
}

// ───────────── 소모품 ─────────────

function itemsView(c: Ctx): View {
  const { run } = c;
  const have = run.consumables.filter(Boolean).length;
  const usable = run.consumables.filter((id) => id && !CONSUMABLES.get(id)?.combat).length;
  const sum: Fig[] = [
    { k: '소모품', v: have, of: run.consumables.length, pips: [have, run.consumables.length] },
    c.lock ? { k: '전투 중 사용', v: '전투 화면에서', word: true } : { k: '지금 쓸 수 있음', v: usable },
  ];
  const body = (
    <>
      <Head label="소모품" count={`${have}/${run.consumables.length}`} />
      {run.consumables.map((id, i) => {
        const d = id ? CONSUMABLES.get(id) : undefined;
        if (!d) return <Row name="빈 칸" dim meta="보상이나 상인에게서 얻은 소모품이 여기 들어온다" />;
        return (
          <Row
            c={c}
            it={{ k: 'item', i }}
            icon={d.icon}
            color={RARITY_COLOR[d.rarity]}
            name={<span style={rarityStyle(d.rarity)}>{d.name}</span>}
            meta={
              <>
                <span class={d.combat ? '' : 'good'}>{d.combat ? '전투 중에만' : '전투 밖에서도 사용 가능'}</span>
                <span class="clamp">{d.desc}</span>
              </>
            }
          />
        );
      })}
      {c.lock && <p class="inv-small">전투 중에는 전투 화면 아래 소모품 칸에서 쓴다.</p>}
    </>
  );
  let detail: ComponentChildren = null;
  const sel = c.sel;
  if (sel?.k === 'item' && run.consumables[sel.i]) detail = <ItemDetail c={c} i={sel.i} />;
  return { sum, body, detail };
}

function ItemDetail({ c, i }: { c: Ctx; i: number }) {
  const id = c.run.consumables[i];
  const d = id ? CONSUMABLES.get(id) : undefined;
  if (!d) return null;
  const prev = !d.combat && !c.lock ? previewItem(c.run, i) : [];
  // 거점에서 쓴 등불은 다음 층에 내려가면 어차피 가득 찬다
  const lightOnly = prev.length > 0 && prev.every((x) => x.label === '등불');
  const wasted = c.run.screen === 'haven' && lightOnly;
  const useWhy = c.lock ? '전투 중에는 전투 화면 아래 소모품 칸에서 쓴다.' : d.combat ? '전투 중에만 쓸 수 있다.' : null;
  const use = async () => {
    const lines = changeLines(prev);
    const warn = !prev.length ? '지금 쓰면 바뀌는 게 없어요.' : wasted ? '다음 층에 내려가면 등불이 가득 차요.' : '';
    const ok = await ask({ title: `${q(d.name, '을', '를')} 쓸까요?`, icon: d.icon, color: RARITY_COLOR[d.rarity], body: warn ? `${d.desc}\n\n${warn}` : d.desc, lines, ok: '사용' });
    if (!ok) return;
    await useItem(i);
    if (!c.run.consumables[i]) c.show(null);
  };
  const discard = async () => {
    if (!(await ask({ title: `${q(d.name, '을', '를')} 버릴까요?`, icon: d.icon, color: 'var(--bad)', body: '되돌릴 수 없어요. 소모품 칸이 하나 비어요.', ok: '버리기', danger: true }))) return;
    await discardItem(i);
    if (!c.run.consumables[i]) c.show(null);
  };
  return (
    <Detail
      icon={d.icon}
      color={RARITY_COLOR[d.rarity]}
      title={<span style={rarityStyle(d.rarity)}>{d.name}</span>}
      sub={`소모품 · ${RARITY_NAME[d.rarity]} · ${d.combat ? '전투 중에만' : '전투 밖에서도'}`}
      acts={[
        { label: '버리기', kind: 'danger', why: c.lock ? LOCK : null, run: () => void discard() },
        { label: '사용', kind: 'main', why: useWhy, run: () => void use() },
      ]}
      onClose={() => c.show(null)}
    >
      <p class="inv-desc">{d.desc}</p>
      {prev.length > 0 && (
        <>
          <Head label="지금 쓰면" sub />
          <div class="inv-change">
            {prev.map((x) => (
              <div>
                <span class="k">{x.label}</span>
                <span class="v">
                  {x.from} → <b class={x.to > x.from ? '' : 'down'}>{x.to}</b>
                </span>
              </div>
            ))}
          </div>
          {wasted && <p class="inv-small">다음 층에 내려가면 등불이 가득 찬다. 던전에서 쓰는 게 낫다.</p>}
        </>
      )}
      {!d.combat && !c.lock && prev.length === 0 && <p class="inv-small">지금 쓰면 바뀌는 게 없다.</p>}
      <KeywordList text={d.desc} exclude={d.name} />
    </Detail>
  );
}

// ───────────── 상태 ─────────────

interface StatLine {
  id: string;
  icon: string;
  color: string;
  name: string;
  value: ComponentChildren;
  meta: string;
  body: string;
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

function statLines(run: RunState): StatLine[] {
  const p = run.player;
  const light = run.light >= 75 ? '밝음' : run.light >= 25 ? '희미함' : '어둠';
  return [
    { id: 'hp', icon: 'gi:heart-organ', color: 'var(--hp-2)', name: '체력', value: `${p.hp}/${p.maxHp}`, meta: '0이 되면 사경', body: '0이 되면 사경에 빠진다. 사경에서는 받는 피해와 매 턴이 정신력을 깎고, 정신력까지 0이 되면 죽는다.' },
    { id: 'san', icon: 'gi:brain', color: 'var(--san-2)', name: '정신력', value: `${p.sanity}/${p.maxSanity}`, meta: '0이 되면 광기', body: `0이 되면 정신이 무너져 광기를 얻고 ${BREAKDOWN_RESET}으로 돌아온다. 나쁜 광기가 ${MAX_MADNESS}개가 되면 여정이 끝난다.\n지금 광기 ${run.madness.length}개` },
    { id: 'ins', icon: 'gi:third-eye', color: 'var(--ins)', name: '통찰', value: p.insight, meta: '이계의 지식', body: `${insightText(p.insight)}\n\n${INSIGHT_SOURCES}` },
    { id: 'ap', icon: 'gi:diamond-hard', color: 'var(--brass-2)', name: '행동력', value: p.maxAp, meta: '내 턴마다 다시 참', body: '스킬을 쓰는 데 드는 ◆. 내 턴이 시작될 때마다 다시 찬다.' },
    { id: 'str', icon: 'gi:biceps', color: '#ff9a7a', name: '힘', value: p.str, meta: '공격 피해 +1씩', body: `공격 피해 ${signed(p.str)}. 힘 1마다 +1. 스킬 한 번에 대상마다 첫 타격에만 붙는다.` },
    { id: 'dex', icon: 'gi:sprint', color: '#8fd0a8', name: '민첩', value: p.dex, meta: '스킬 방어도 +1씩', body: `스킬로 얻는 방어도 ${signed(p.dex)}. 민첩 1마다 +1.` },
    { id: 'will', icon: 'gi:mighty-force', color: '#b99bff', name: '의지', value: p.will, meta: '받는 정신 피해 -5%씩', body: `받는 정신 피해 ${signed(-Math.min(50, p.will * 5))}%. 의지 1마다 5%씩, 50%까지 줄어든다.` },
    { id: 'light', icon: 'gi:old-lantern', color: '#ffd27a', name: '등불', value: run.light, meta: light, body: '이동할 때마다 줄어든다. 밝음(75 이상)이면 이웃 방이 모두 보이고, 희미함(25 이상)이면 일부만 보인다. 어둠에서는 아무것도 보이지 않고 이동할 때마다 정신력 -2, 기습을 당할 수 있다. 대신 전리품이 늘어난다.' },
    // 심연 단계: 지금 켜진 규칙 (누르면 전부) — ui/abyss.tsx
    abyssStatLine(run),
  ];
}

function statusView(c: Ctx): View {
  const { run } = c;
  const p = run.player;
  const lines = statLines(run);
  // 가진 스킬이 치는 계열 (틈을 열고 거두는 판정과 같다, engine/schools.ts skillSchools):
  // 두 계열로 치는 스킬은 두 계열 모두, 계열 각인을 새긴 스킬은 그 계열로도. 기본 공격과 정수의 기술은 세지 않는다
  const schools = HUMAN_SCHOOLS.filter((sc) =>
    run.skills.some((s) => {
      const d = SKILLS.get(s.id);
      return !!d && !s.from && d.school !== 'essence' && d.rarity !== 'basic' && !d.tags.includes('basic') && skillSchools(run, s).includes(sc);
    }),
  );
  const sum: Fig[] = [
    { k: '레벨', v: p.level },
    { k: '경험치', v: p.xp, of: xpToNext(p.level) },
    { k: '골드', v: p.gold },
  ];
  const body = (
    <>
      <Head label="능력치" />
      {lines.map((l) => (
        <Row c={c} it={{ k: 'stat', id: l.id }} icon={l.icon} color={l.color} name={l.name} meta={l.meta} right={l.value} />
      ))}
      <Head label="광기와 각성" count={run.madness.length} />
      {run.madness.length === 0 && <Empty>아직은 제정신이다.</Empty>}
      {run.madness.map((m) => {
        const d = MADNESS.get(m);
        return d && <Row c={c} it={{ k: 'madness', id: m }} icon={d.icon} color={d.virtue ? '#4fffc4' : '#b99bff'} name={<span style={{ color: d.virtue ? '#4fffc4' : '#d0bfff' }}>{d.name}</span>} meta={<span class="clamp">{d.desc}</span>} />;
      })}
      <Head label="기술 계열" count={schools.length} />
      <Row c={c} it={{ k: 'stat', id: 'schools' }} icon="gi:spell-book" color="var(--brass-2)" name={schools.length ? schools.map((x) => SCHOOL_NAME[x]).join(' · ') : '아직 없음'} meta="틈은 다른 계열 스킬로 거둔다" />
    </>
  );
  let detail: ComponentChildren = null;
  const sel = c.sel;
  if (sel?.k === 'stat') {
    if (sel.id === 'schools')
      detail = (
        <Detail icon="gi:spell-book" color="var(--brass-2)" title="기술 계열" sub={schools.map((x) => SCHOOL_NAME[x]).join(' · ') || '아직 없음'} onClose={() => c.show(null)}>
          <p class="inv-desc">가진 스킬이 치는 계열. 두 계열로 치는 스킬은 두 계열 모두, 계열 각인을 새긴 스킬은 그 계열로도 센다. 기본 공격과 정수의 기술은 세지 않는다.</p>
          {/* 계열이 쓰이는 곳: 틈 (풀이는 용어집에서) */}
          <KeywordList text="틈" />
        </Detail>
      );
    else {
      const l = lines.find((x) => x.id === sel.id);
      if (l)
        detail = (
          <Detail icon={l.icon} color={l.color} title={l.name} sub={<>지금 <b class="num" style={{ color: 'var(--inv-ink)' }}>{l.value}</b></>} onClose={() => c.show(null)}>
            <p class="inv-desc">{l.body}</p>
          </Detail>
        );
    }
  } else if (sel?.k === 'madness') {
    const d = MADNESS.get(sel.id);
    if (d && run.madness.includes(sel.id))
      detail = (
        <Detail icon={d.icon} color={d.virtue ? '#4fffc4' : '#b99bff'} title={d.name} sub={d.virtue ? '각성' : '광기'} note={d.virtue ? undefined : `신전에서 ${CURE_COST}골드를 내고 치료할 수 있다.`} onClose={() => c.show(null)}>
          <p class="inv-desc">{d.desc}</p>
          <KeywordList text={d.desc} exclude={d.name} />
        </Detail>
      );
  }
  return { sum, body, detail };
}
