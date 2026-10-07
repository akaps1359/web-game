import type { CombatEvent } from '../engine/combat';
import { GAP_ID, GAP_RULE, GAP_RULE_MORE, gapBonusText, gapHarvestHint, gapInfo, harvestsLeft, type GapInfo } from '../content/gap';
import { HUMAN_SCHOOLS } from '../engine/schools';
import type { School } from '../engine/types';
import { store } from '../state/store';
import { Icon, press } from './components';
import { SCHOOL_COLOR, SCHOOL_NAME, josa } from './text';

/*
 * 틈 (content/gap.ts)을 전투 화면에 잇는 곳: 적 이름 옆의 틈 표시, 스킬 카드의 거두기 힌트, 틈 자세히 보기.
 * 엔진은 건드리지 않고 gapInfo · gapHarvestHint · harvestsLeft만 읽는다.
 */

/** 틈 표시: 갈라져 벌어진 자국 (엔진 상태 아이콘과 따로, 작게 그려도 읽히는 모양) */
export const GAP_ICON = 'gi:open-wound';

/** 연출이 재생되는 동안 화면이 아는 틈 (스냅숏에는 색·남은 턴이 없다): 쉬는 동안의 엔진 상태와 gap-open 이벤트로 채운다 */
const seen = new Map<string, GapInfo>();

/** director: 틈 이벤트가 재생되는 순간 */
export function noteGap(ev: Extract<CombatEvent, { t: 'gap-open' } | { t: 'gap-harvest' }>) {
  if (ev.t === 'gap-open') seen.set(ev.uid, { uid: ev.uid, school: ev.school, big: ev.big, turns: ev.turns });
  else seen.delete(ev.uid);
}

/** 이 적의 틈. 연출 중이면 그 시점의 모습 (있고 없음·크기는 스냅숏, 색은 재생된 이벤트) */
export function gapView(uid: string): GapInfo | null {
  const c = store.combat;
  if (!c) return null;
  const real = gapInfo(c, uid);
  const snap = store.snap;
  if (!snap) {
    if (real) seen.set(uid, real);
    else seen.delete(uid);
    return real;
  }
  const se = snap.e.find((x) => x.uid === uid);
  const n = se && !se.dead ? (se.st[GAP_ID] ?? 0) : 0;
  if (n <= 0) return null;
  const big = n >= 2;
  const known = seen.get(uid);
  // 같은 틈이면 엔진의 남은 턴을 쓴다 (내 턴이 끝날 때 이미 줄어 있다)
  if (real && real.big === big && (!known || known.school === real.school)) return real;
  if (known) return { ...known, big };
  return real ? { ...real, big } : null;
}

/** '검술의 틈', '검술의 큰 틈' */
export function gapName(g: Pick<GapInfo, 'school' | 'big'>): string {
  return `${SCHOOL_NAME[g.school]}의 ${g.big ? '큰 틈' : '틈'}`;
}

/** 적 상세 창에 붙이는 한 줄 */
export function gapLine(g: GapInfo): string {
  return `${gapName(g)} · ${g.turns}턴 남음. 다른 계열의 스킬로 치면 거둔다.`;
}

/** 적 이름 옆의 틈 표시: 계열 색의 갈라진 자국 + 남은 턴. 큰 틈은 더 굵고 빛난다 */
export function GapMark({ g, onPress }: { g: Pick<GapInfo, 'school' | 'big' | 'turns'>; onPress?: () => void }) {
  const color = SCHOOL_COLOR[g.school];
  const inner = (
    <>
      <Icon name={GAP_ICON} size={g.big ? 19 : 16} color={color} />
      <b>{g.turns}</b>
    </>
  );
  const cls = `gapmark ${g.big ? 'big' : ''}`;
  const style = { '--g': color } as Record<string, string>;
  if (!onPress) return <span class={cls} style={style}>{inner}</span>;
  return (
    <button class={cls} style={style} aria-label={`${gapName(g)}, ${g.turns}턴 남음. 자세히`} {...press(onPress, onPress)}>
      {inner}
    </button>
  );
}

// ───────────── 거두기 힌트 (스킬 카드·설명 쪽지) ─────────────

export interface HarvestHint {
  /** '틈 거두기: 출혈 2' */
  text: string;
  /** 틈의 색 */
  color: string;
  /** 대상이 정해졌다 (고른 적·하나뿐인 대상·광역) — 아니면 '거둘 수 있는 적이 있다'는 은은한 표시만 */
  sure: boolean;
  /** 대상을 안 골랐을 때 거둘 수 있는 적의 이름들 */
  names?: string[];
}

/** 이 스킬(ref: 'weapon' | 'armor' | 스킬 uid)로 지금 거둘 수 있는 틈. 연출 중이거나 이번 턴 거두기를 다 썼으면 없다 */
export function harvestHint(ref: string | null | undefined): HarvestHint | null {
  const c = store.combat;
  if (!c || !ref || store.busy || c.s.phase !== 'player' || harvestsLeft(c) <= 0) return null;
  const info = c.skillInfo(ref);
  if (!info || !info.def.tags.includes('attack')) return null;
  const def = info.def;
  const one = (uid: string) => {
    const text = gapHarvestHint(c, ref, uid);
    const g = text ? gapInfo(c, uid) : null;
    return text && g ? { uid, text, color: SCHOOL_COLOR[g.school] } : null;
  };
  const hits = (list: { uid: string }[]) => list.map((e) => one(e.uid)).filter((h): h is NonNullable<ReturnType<typeof one>> => !!h);
  if (def.target === 'single' || def.target === 'random') {
    const valid = def.target === 'single' || def.range === 'melee' ? c.validTargets(def) : c.alive;
    // 무작위 대상은 닿는 적이 하나뿐일 때만 정해진 것으로 본다
    const pick = valid.length === 1 ? valid[0] : def.target === 'single' ? (valid.find((e) => e.uid === store.focus) ?? null) : null;
    if (pick) {
      const h = one(pick.uid);
      return h ? { text: h.text, color: h.color, sure: true } : null;
    }
    const hs = hits(valid);
    if (!hs.length) return null;
    return { text: hs[0].text, color: hs[0].color, sure: false, names: hs.map((h) => c.enemy(h.uid)?.name ?? '') };
  }
  const targets = def.target === 'all' ? c.alive : def.target === 'front' ? (c.row(0).length ? c.row(0) : c.row(1)) : def.target === 'back' ? (c.row(1).length ? c.row(1) : c.row(0)) : [];
  const hs = hits(targets);
  if (!hs.length) return null;
  const n = Math.min(hs.length, harvestsLeft(c));
  return { text: hs[0].text + (n > 1 ? ` 외 ${n - 1}` : ''), color: hs[0].color, sure: true };
}

/** 설명 쪽지에 붙는 한 줄 */
export function harvestSay(h: HarvestHint): string {
  if (h.sure) return h.text;
  const who = h.names && h.names.length === 1 ? h.names[0] : '틈이 열린 적';
  return `${who}${josa(who, '을')} 치면 ${h.text}`;
}

// ───────────── 틈 자세히 보기 ─────────────

/** 거두면 받는 것: 틈의 색이 아닌 다섯 계열 */
function BonusRows({ school, big }: { school: School | null; big: boolean }) {
  return (
    <div class="gp-bonus">
      {HUMAN_SCHOOLS.filter((s) => s !== school).map((s) => (
        <div class="gp-row">
          <span class="gp-sc" style={{ color: SCHOOL_COLOR[s], borderColor: SCHOOL_COLOR[s] }}>
            {SCHOOL_NAME[s]}
          </span>
          <span>{gapBonusText(s, big)}</span>
        </div>
      ))}
    </div>
  );
}

/** 틈 규칙 (한 줄 규칙 + 덧붙는 줄들) */
export function GapRule() {
  return (
    <div class="gp-rule">
      <p>{GAP_RULE}</p>
      <ul>
        {GAP_RULE_MORE.map((t) => (
          <li>{t}</li>
        ))}
      </ul>
    </div>
  );
}

/** 틈 표시를 누르면: 색·남은 턴, 거두면 받는 것, 이번 턴 남은 거두기, 규칙 */
export function GapPeek({ uid, onClose }: { uid: string; onClose: () => void }) {
  const c = store.combat;
  const e = c?.enemy(uid);
  const g = gapView(uid);
  if (!c || !e || !g) return null;
  const color = SCHOOL_COLOR[g.school];
  const left = harvestsLeft(c);
  const sch = SCHOOL_NAME[g.school];
  const closing = g.turns <= 1 && c.s.phase === 'player' ? ' 이번 턴이 끝나면 닫힌다.' : '';
  return (
    <div class="veil" style={{ background: 'rgba(0,0,0,0.35)', alignItems: 'flex-end' }} onClick={onClose}>
      <div class="tip panel gap-peek" onClick={onClose}>
        <div class="tip-head">
          <GapMark g={g} />
          <div>
            <div class="t" style={{ color }}>
              {gapName(g)}
            </div>
            <div class="s">
              {e.name} · {g.turns}턴 남음
            </div>
          </div>
        </div>
        <p class="peek-say">
          {sch}
          {josa(sch, '이')} 아닌 계열의 스킬로 치면 거둔다.{g.big ? ' 붕괴로 열린 큰 틈이라 보너스 2배.' : ''}
          {closing}
        </p>
        <div class="gp-h">거두면 받는 것</div>
        <BonusRows school={g.school} big={g.big} />
        <p class={`gp-left ${left > 0 ? '' : 'none'}`}>{left > 0 ? `이번 턴 거두기 ${left}번 남음` : '이번 턴 거두기를 다 썼다'}</p>
        <GapRule />
      </div>
    </div>
  );
}

/** 의도 읽는 법 아래: 틈 표시 읽는 법 */
export function GapLegend() {
  return (
    <div class="gap-legend">
      <div class="legend-lead">
        <GapMark g={{ school: 'blade', big: false, turns: 2 }} />
        <p>
          적 이름 옆의 갈라진 표시는 <b>틈</b>이다. 색은 틈을 연 계열, 숫자는 남은 턴. 누르면 자세히.
        </p>
      </div>
      <GapRule />
      <div class="gp-h">거두면 받는 것 (큰 틈은 2배)</div>
      <BonusRows school={null} big={false} />
    </div>
  );
}
