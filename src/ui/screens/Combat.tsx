import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { garbleStable, mountWatcher, realWorld, staticCracks } from '../cinema';
import type { Snap } from '../../engine/combat';
import { ANOMALIES, CONSUMABLES, ENEMIES, ORIGINS, RUNES, STATUSES, TRAITS } from '../../engine/registry';
import { DISGUISE_REVEAL, GUARD, HIDDEN_REVEAL, breakProfile, lvlVal, shownIntentOf } from '../../engine/combat';
import type { CombatChoice, EnemyUnit, Intent, IntentKind, Objective, SkillDef } from '../../engine/types';
import { fx, syncBattle } from '../../director';
import { layoutEnemies, type Anchor } from '../../render/battle';
import { stage } from '../../render/stage';
import { endTurn, pickChoice, useItem, useSkill } from '../../state/actions';
import { store } from '../../state/store';
import { saveMeta } from '../../state/meta';
import { Bar, Icon, press, Segs, Sheet, showTip } from '../components';
import { keywordsIn } from '../glossary';
import { CHIP_RULE, GUARD_RULE, breakGlossary, breakSay, guardWord, timesWord } from '../guard';
import { schoolLabel } from '../cards';
import { GAP_ICON, GapLegend, GapMark, GapPeek, gapLine, gapView, harvestHint, harvestSay, type HarvestHint } from '../gap';
import {
  DMG_COLOR,
  DMG_ICON,
  DMG_NAME,
  INTENT_COLOR,
  INTENT_ICON,
  INTENT_MEANING,
  INTENT_NAME,
  INTENT_WAIT,
  RARITY_COLOR,
  SCHOOL_COLOR,
  josa,
  skillDesc,
  statusText,
} from '../text';
import '../../styles/combat-ui.css';

const RANGE_NAME = { melee: '근접', ranged: '원거리', self: '자신' } as const;
const TARGET_NAME = { single: '단일', front: '전열', back: '후열', all: '전체', random: '무작위', self: '자신' } as const;

export function CombatScreen() {
  const s = store;
  const run = s.run!;
  const c = s.combat;
  const areaRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const kitRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  /** 의도 표시 읽는 법 (범례 창) */
  const [legend, setLegend] = useState(false);
  /** 자세히 보는 의도 (적 uid) */
  const [peek, setPeek] = useState<string | null>(null);
  /** 자세히 보는 틈 (적 uid) */
  const [gapPeek, setGapPeek] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      // 기울어진 화면(침수)에서도 기울기 전 자리를 잰다 — 그림은 똑바로 서 있다
      stage.setBattleRect(layoutBox(el));
      syncBattle(store.snap);
      setTick((t) => t + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // 아래 수첩이 화면을 넘치지 않게 (그릴 때마다, 화면 크기가 바뀔 때마다)
  useLayoutEffect(() => fitKit(kitRef.current, areaRef.current));
  useEffect(() => {
    const on = () => fitKit(kitRef.current, areaRef.current);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  // 틈이 닫히면 자세히 보기도 닫는다 (연출 중에 열어 둔 것이 나중에 다시 뜨지 않게)
  useEffect(() => {
    if (gapPeek && !gapView(gapPeek)) setGapPeek(null);
  });

  if (!c) return <div class="screen" />;
  const snap: Snap = s.snap ?? c.snap();
  const rect = stage.battle.rect;
  const list = snap.e.map((e) => ({ uid: e.uid, row: e.row, dead: e.dead, scale: c.s.enemies.find((x) => x.uid === e.uid)?.scale ?? 1 }));
  const anchors = layoutEnemies(rect, list);

  const selInfo = s.sel && !s.sel.startsWith('c') ? c.skillInfo(s.sel) : null;
  const selItem = s.sel?.startsWith('c') ? run.consumables[Number(s.sel.slice(1))] : null;
  const validTargets = selInfo && selInfo.def.target === 'single' ? new Set(c.validTargets(selInfo.def).map((e) => e.uid)) : null;
  const itemSingle = selItem && CONSUMABLES.get(selItem)?.target === 'single';

  const tapEnemy = (uid: string) => {
    if (s.busy) return;
    if (selInfo && validTargets?.has(uid)) {
      void useSkill(s.sel!, uid);
      return;
    }
    if (itemSingle) {
      void useItem(Number(s.sel!.slice(1)), uid);
      return;
    }
    s.focus = uid;
    s.emit();
  };

  const p = snap.p;
  const ownGun = ['weapon', ...run.slots].some((ref) => ref && c.skillInfo(ref)?.def.tags.includes('ammo'));
  const refs = ['weapon', 'armor', ...run.slots];
  const anyUsable = refs.some((r) => r && !c.blockReason(r));

  // 적이 남긴 화면 상태 (물·금·기울기·어둠·뒤섞인 글자·지켜보는 눈·막대 뒤바뀜)
  // 연출이 재생되는 시점의 값 (엔진은 이미 턴 끝까지 계산해 두었다)
  const uiNow = snap.ui ?? c.uiVars();
  // 즉사기를 막는 퍼즐 목표
  const objective = snap.obj ?? c.s.obj ?? null;
  const ui = (k: string) => uiNow[k] ?? 0;
  const tilt = Math.max(-15, Math.min(15, ui('ui:tilt')));
  const swap = !!ui('ui:swap');
  // 기울어진 화면 안의 적 표시를 똑바로 선 그림 위로 (기울면 화면이 고정 위치 요소의 기준이 된다)
  const place = tiltPlace(screenRef.current, tilt);
  const areaTop = tilt && screenRef.current ? rect.y - layoutBox(screenRef.current).y : rect.y;
  const hpBar = <Bar kind="hp" value={p.hp} max={p.maxHp} block={p.block} label={(p.st.dying ? '사경 ' : '') + `${p.hp}/${p.maxHp}`} />;
  const sanBar = <Bar kind="san" value={p.sanity} max={run.player.maxSanity} label={`정신 ${p.sanity}`} />;

  return (
    <>
      <div ref={screenRef} class={`screen combat ${tilt ? 'tilted' : ''}`} style={{ animation: 'none', transform: tilt ? `rotate(${tilt}deg)` : undefined }}>
        <UiVarsLayer water={ui('ui:water')} cracks={ui('ui:cracks')} dark={ui('ui:dark')} eye={!!ui('ui:eye')} />
        <div class="battle-top">
          <span class="chip">
            <Icon name="gi:sands-of-time" size={13} />
            {c.s.turn}턴
          </span>
          <button class="chip intent-key" onClick={() => setLegend(true)} aria-label="의도 표시 읽는 법">
            <Icon name="gi:help" size={13} />
            의도
          </button>
          {c.s.anomaly && <AnomalyChip id={c.s.anomaly} />}
          {run.rift && (
            <span class="chip" style={{ color: '#c08cff' }}>
              균열 {run.rift.stage + 1}/{run.rift.encs.length}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            class="chip"
            onClick={() => {
              s.meta.speed = s.meta.speed === 1 ? 2 : 1;
              saveMeta(s.meta);
              s.emit();
            }}
          >
            <Icon name="gi:fast-forward-button" size={13} />x{s.meta.speed}
          </button>
          <button class="iconbtn" style={{ width: 34, height: 34 }} onClick={() => ((s.sheet = { kind: 'character' }), s.emit())} aria-label="소지품">
            <Icon name="gi:knapsack" size={16} />
          </button>
          <button class="iconbtn" style={{ width: 34, height: 34 }} onClick={() => ((s.sheet = { kind: 'settings' }), s.emit())} aria-label="설정">
            <Icon name="gi:settings-knobs" size={16} />
          </button>
        </div>

        {objective && (
          <button
            class={`obj-strip ${objective.lethal ? '' : 'warn'}`}
            onClick={() =>
              showTip(
                objective.lethal
                  ? {
                      title: '즉사를 막는 방법',
                      icon: 'gi:death-skull',
                      color: '#ff2a3a',
                      body: `${objective.text}

${objective.fail ?? '막지 못하면 사경 없이 그 자리에서 죽는다.'} 결계가 있으면 한 번 막아 준다.`,
                    }
                  : {
                      title: '막아야 할 위협',
                      icon: 'gi:hazard-sign',
                      color: '#ffb040',
                      body: `${objective.text}

${objective.fail ?? '막지 못하면 큰 대가를 치른다.'}`,
                    },
              )
            }
          >
            <Icon name={objective.lethal ? 'gi:death-skull' : 'gi:hazard-sign'} size={16} color={objective.lethal ? '#ff2a3a' : '#ffb040'} />
            <span>{objective.text}</span>
          </button>
        )}

        <div class="battle-area" ref={areaRef}>
          {fx.banner && (
            <div key={fx.banner.id} class={`banner ${fx.banner.tone}`}>
              {fx.banner.text}
            </div>
          )}
        </div>

        {snap.e
          .filter((e) => !e.dead)
          .map((e) => {
            const a = anchors.get(e.uid);
            const real = c.s.enemies.find((x) => x.uid === e.uid);
            if (!a || !real) return null;
            return (
              <EnemyOverlay
                key={e.uid}
                e={e}
                real={real}
                a={a}
                place={place}
                areaTop={areaTop}
                focus={s.focus === e.uid}
                valid={!!(validTargets?.has(e.uid) || itemSingle)}
                onTap={() => tapEnemy(e.uid)}
                onIntent={() => setPeek(e.uid)}
                onGap={() => setGapPeek(e.uid)}
              />
            );
          })}

        {/* 아래쪽: 탐험가의 가죽 수첩과 장비 띠 (내 상태 · 설명 쪽지 · 스킬 카드 · 주머니와 도장) */}
        <div class="kit" ref={kitRef}>
          <div class="pbox">
            <div class="prow">
              <button id="p-anchor" class="medal" onClick={() => playerTip()} aria-label="내 정보">
                <Icon name={ORIGINS.get(run.origin)?.icon ?? 'gi:hood'} size={21} color="#f3dca0" />
              </button>
              {swap ? sanBar : hpBar}
              {p.block > 0 && <Guard icon="gi:shield" n={p.block} color="#6f95b5" label="방어도" />}
              {(p.st.barrier ?? 0) > 0 && <Guard icon="gi:bubble-field" n={p.st.barrier} color="#7aaed2" label="보호막" />}
            </div>
            <div class="prow">
              <div class="ap" title="행동력">
                {Array.from({ length: Math.max(run.player.maxAp, p.ap) }, (_, i) => (
                  <i class={i < p.ap ? '' : 'off'} />
                ))}
              </div>
              {ownGun && (
                <div class="ammo" title="탄약">
                  {Array.from({ length: c.s.maxAmmo }, (_, i) => (
                    <i class={i < p.ammo ? '' : 'off'} />
                  ))}
                </div>
              )}
              <div class={`grow ${swap ? 'swapped' : ''}`}>{swap ? hpBar : sanBar}</div>
              {p.insight > 0 && (
                <span class="insight" title="통찰">
                  <Icon name="gi:third-eye" size={13} />
                  {p.insight}
                </span>
              )}
            </div>
            <StatusRow st={p.st} />
          </div>

          <InfoBox onIntent={setPeek} />

          {/* 줄 수: 화면이 모자라면 카드가 낮아지는데, 그 최소 높이를 CSS가 줄 수로 정한다 (combat-ui.css) */}
          <div class={`skills ${refs.length > 9 ? 'many' : ''}`} style={{ '--rows': Math.ceil(refs.length / (refs.length > 9 ? 4 : 3)) } as Record<string, number>}>
            {refs.map((ref, i) => (ref ? <SkillButton key={ref} r={ref} /> : <EmptySlot key={`e${i}`} />))}
          </div>

          <div class="footer">
            {run.consumables.map((id, i) => {
              const def = id ? CONSUMABLES.get(id) : null;
              const key = `c${i}`;
              return (
                <button
                  class={`slot-item ${s.sel === key ? 'sel' : ''} ${def ? '' : 'empty'}`}
                  aria-label={def?.name ?? '빈 주머니'}
                  {...press(
                    () => {
                      if (!def || s.busy) return;
                      if (s.sel === key && def.target !== 'single') void useItem(i);
                      else {
                        s.sel = key;
                        s.emit();
                      }
                    },
                    () => def && showTip({ title: def.name, icon: def.icon, body: def.desc }),
                  )}
                >
                  {def ? <Icon name={def.icon} size={22} color="#f0d9a0" /> : <i class="pouch-dot" />}
                </button>
              );
            })}
            <button class={`endturn ${!anyUsable && !s.busy ? 'ready' : ''}`} disabled={s.busy || c.s.phase !== 'player'} onClick={() => endTurn()}>
              <span class="stamp-face">
                <Icon name="gi:stamper" size={17} />
                {s.busy ? '…' : '턴 종료'}
              </span>
            </button>
          </div>
        </div>
      </div>
      {/* 피해 숫자는 기울어진 화면 밖에서 — 똑바로 선 그림 위에 뜬다 */}
      <Floaters />
      {/* 전투 중 선택지 (연출이 끝난 내 턴에) — 화면 밖의 시스템 창처럼 */}
      {c.s.choice && !s.busy && c.s.phase === 'player' && <ChoiceDialog ch={c.s.choice} />}
      {peek && <IntentPeek uid={peek} onClose={() => setPeek(null)} />}
      {gapPeek && <GapPeek uid={gapPeek} onClose={() => setGapPeek(null)} />}
      {legend && <IntentLegend onClose={() => setLegend(false)} />}
    </>
  );
}

/**
 * 마지막 안전장치: 아래 수첩(내 상태·설명·기술·주머니와 턴 종료)이 화면을 넘치면 넘친 만큼 전장의 최소 높이를 내준다 (--area-cut, 120px까지).
 * 보통은 CSS가 먼저 맞춘다 (기술 카드가 낮아지고 낮은 화면은 여백을 줄인다). 위협 띠·상태 줄·긴 설명이 한꺼번에 붙은 낮은 화면에서만 쓰인다.
 * 매번 내준 것을 거두고 다시 재므로 자리가 남으면 저절로 돌려준다. 높이는 변형(기울어진 화면) 전의 레이아웃 값으로 잰다.
 * 맨 아래 단추 밑의 여백(아이폰 홈 막대 자리)까지 들어가야 맞는 것이다
 */
function fitKit(kit: HTMLElement | null, area: HTMLElement | null) {
  const foot = kit?.lastElementChild as HTMLElement | null | undefined;
  if (!kit || !area || !foot) return;
  area.style.removeProperty('--area-cut');
  const over = foot.offsetTop + foot.offsetHeight + (parseFloat(getComputedStyle(kit).paddingBottom) || 0) - kit.clientHeight;
  if (over > 1) area.style.setProperty('--area-cut', `${Math.ceil(over)}px`);
}

/** 전투 중 선택지: 고르기 전에는 다른 것을 할 수 없다 */
function ChoiceDialog({ ch }: { ch: CombatChoice }) {
  return (
    <div class="choice-veil">
      <div class="choice-box">
        <div class="choice-title">{realWorld(ch.title)}</div>
        {ch.text && <div class="choice-msg">{realWorld(ch.text)}</div>}
        <div class="choice-opts">
          {ch.options.map((o) => (
            <button key={o.id} class="choice-opt" onClick={() => void pickChoice(o.id)}>
              <span class="choice-label">
                {o.icon && <Icon name={o.icon} size={16} />}
                {o.label}
              </span>
              <span class="choice-desc">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 변형(기울기)을 무시한 화면 좌표 상자 */
function layoutBox(el: HTMLElement): { x: number; y: number; w: number; h: number } {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n.id !== 'app') {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  // #app까지 올라왔으면 그 자리를 더한다 (offset*은 변형을 무시한다)
  if (n) {
    const r = n.getBoundingClientRect();
    x += r.left;
    y += r.top;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

type Place = (x: number, y: number) => { x: number; y: number };
const SAME: Place = (x, y) => ({ x, y });

/** 화면 좌표의 점 → 기울어진 화면 안의 좌표 (화면을 돌린 뒤 그 점에 오게) */
function tiltPlace(screen: HTMLElement | null, deg: number): Place {
  if (!deg || !screen) return SAME;
  const b = layoutBox(screen);
  const cx = b.w / 2;
  const cy = b.h / 2;
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return (x, y) => {
    const dx = x - b.x - cx;
    const dy = y - b.y - cy;
    return { x: cx + dx * cos + dy * sin, y: cy - dx * sin + dy * cos };
  };
}

function AnomalyChip({ id }: { id: string }) {
  const a = ANOMALIES.get(id);
  if (!a) return null;
  return (
    <button class="chip shrink" style={{ color: '#c08cff', borderColor: 'rgba(192,140,255,0.5)' }} onClick={() => showTip({ title: a.name, icon: a.icon, color: '#c08cff', body: a.desc })}>
      <Icon name={a.icon} size={13} />
      <span class="nm">{a.name}</span>
    </button>
  );
}

function playerTip() {
  const run = store.run!;
  const p = run.player;
  showTip({
    title: ORIGINS.get(run.origin)?.name ?? '조사자',
    icon: ORIGINS.get(run.origin)?.icon,
    body: `레벨 ${p.level} · 힘 ${p.str} · 민첩 ${p.dex} · 의지 ${p.will}`,
    lines: [
      { label: '통찰', value: String(p.insight) },
      { label: '광기', value: run.madness.length ? `${run.madness.length}개` : '없음' },
    ],
  });
}

/** 방어도·보호막: 방패 그림 위에 수치 */
function Guard({ icon, n, color, label }: { icon: string; n: number; color: string; label: string }) {
  return (
    <span class="guard" aria-label={`${label} ${n}`}>
      <Icon name={icon} size={30} color={color} />
      <b>{n}</b>
    </span>
  );
}

function StatusRow({ st, max }: { st: Record<string, number>; max?: number }) {
  const ids = Object.keys(st).filter((id) => st[id] && STATUSES.has(id) && !STATUSES.get(id)!.hidden);
  if (!ids.length) return null;
  // 적 이름표 아래는 한 줄만 (두 줄이 되면 아래 내 정보 칸에 가려진다) — 넘치는 것은 「+N」을 눌러 본다
  const cap = max ? Math.max(1, Math.floor((max + 2) / 22)) : ids.length;
  const shown = ids.length > cap ? ids.slice(0, cap - 1) : ids;
  const rest = ids.slice(shown.length);
  const restTip = () =>
    showTip({
      title: '상태',
      icon: 'gi:magnifying-glass',
      // 이름과 수치만 — 풀이는 아래 용어 목록이 붙인다
      body: rest.map((id) => `${STATUSES.get(id)!.name} ${st[id]}`).join(' · '),
    });
  return (
    <div class="st-row" style={max ? { maxWidth: max } : { justifyContent: 'flex-start', maxWidth: 'none' }}>
      {rest.length > 0 && (
        <span class="st" style={{ pointerEvents: 'auto', order: 1 }} {...press(restTip, restTip)}>
          <span class="num" style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>
            +{rest.length}
          </span>
        </span>
      )}
      {shown.map((id) => {
        const d = STATUSES.get(id)!;
        return (
          <span
            class="st"
            style={{ pointerEvents: 'auto' }}
            {...press(
              () => showTip({ title: d.name, icon: d.icon, color: d.kind === 'buff' ? '#f0cf7a' : '#c8a0ff', body: statusText(d.desc, st[id]) }),
              () => showTip({ title: d.name, icon: d.icon, color: d.kind === 'buff' ? '#f0cf7a' : '#c8a0ff', body: statusText(d.desc, st[id]) }),
            )}
          >
            <Icon name={d.icon} size={15} color={d.kind === 'buff' ? '#f0cf7a' : '#c8a0ff'} />
            <b>{st[id]}</b>
          </span>
        );
      })}
    </div>
  );
}

// ───────────── 의도 ─────────────

/** 의도 표시와 자세히 보기에 쓰는 값 */
interface IntentRead {
  icon: string;
  color: string;
  /** 아이콘 아래 짧은 이름 (준비·공격·방어…) */
  word: string;
  /** 큰 숫자 (22, 7×2) */
  num?: string;
  /** 숫자 대신 보이는 행동 이름 */
  name?: string;
  /** 숫자 옆 작은 글자 (합 14 · 피해 6 · +효과) */
  sub?: string;
  /** 빛나는 테두리: 큰 공격이 오고 있다 */
  glow?: 'charge' | 'death';
  /** 자세히 보기의 제목 */
  title: string;
  /** 자세히 보기의 해요체 문장 (앞 문장이 요약) */
  says: string[];
  /** 그 행동의 고유 설명 (규칙 문장) */
  rule?: string;
}

/** 연출 중인 화면과 같은 시점의 의도 (스냅숏) */
function snapIntentOf(e: EnemyUnit): Intent | null {
  const se = store.snap?.e.find((x) => x.uid === e.uid);
  return se ? se.intent : e.intent;
}

/** 내게 걸린, 의도를 가리는 상태의 이름 (눈부심·어둠 — 설명에 '의도'가 나오는 해로운 상태) */
function veilName(): string | null {
  const st = store.combat!.p.st;
  for (const id of Object.keys(st)) {
    const d = STATUSES.get(id);
    if ((st[id] ?? 0) > 0 && d && !d.hidden && d.kind === 'debuff' && d.desc.includes('의도')) return d.name;
  }
  return null;
}

/** 지금 방어도로 막으면 얼마를 받는가 (이 적의 공격만 놓고) */
function guardSay(total: number): string | null {
  const p = store.combat!.p;
  const barrier = p.st.barrier ?? 0;
  const g = p.block + barrier;
  if (g <= 0 || total <= 0) return null;
  const what = barrier > 0 ? (p.block > 0 ? `방어도와 ${STATUSES.get('barrier')?.name ?? '보호막'}` : (STATUSES.get('barrier')?.name ?? '보호막')) : '방어도';
  const after = Math.max(0, total - g);
  return after > 0 ? `지금 ${what} ${g}${josa(g, '으로')} 막으면 ${after}${josa(after, '을')} 받는다.` : `지금 ${what} ${g}${josa(g, '으로')} 모두 막는다.`;
}

/** 힘을 모은 뒤에 쓸 일격의 이름 (같은 피해의 공격 — 모르면 null) */
function chargeFollowUp(e: EnemyUnit, it: Intent): string | null {
  const moves = ENEMIES.get(e.def)?.moves;
  if (!moves || !it.dmg) return null;
  const hits = it.hits ?? 1;
  const cands = Object.entries(moves).filter(
    ([id, m]) => id !== it.move && !m.charging && m.intent !== 'charge' && typeof m.dmg === 'number' && m.dmg === it.dmg && (typeof m.hits === 'function' || (m.hits ?? 1) === hits),
  );
  const pick = cands.find(([, m]) => m.ultimate) ?? (cands.length === 1 ? cands[0] : null);
  return pick ? pick[1].name : null;
}

/** 즉사·위협 띠가 이 적과 이어져 있으면 그 한 줄 */
function threatSay(e: EnemyUnit, it: Intent | null, obj: Objective | null | undefined): string | null {
  if (!obj) return null;
  const tied = it?.kind === 'death' || !!it?.extra?.includes('death') || obj.hit?.uid === e.uid || obj.break === e.uid || !!obj.kill?.includes(e.uid);
  if (!tied) return null;
  return `${obj.lethal ? '즉사를 막는 법' : '막아야 할 위협'}: ${obj.text}`;
}

/** 붕괴한 적의 의도 설명: 남은 쉬는 차례와 받는 피해 */
function brokenSay(e: EnemyUnit): string {
  const def = ENEMIES.get(e.def);
  const vuln = def ? breakProfile(def).vuln : 1.5;
  const left = e.broken === 2 ? (e.mem.bk ?? 1) : 0;
  const rest = left > 1 ? `붕괴해서 적의 차례를 ${left}번 더 쉰다.` : '붕괴해서 다음 적의 차례엔 행동하지 못한다.';
  return `${rest} 버팀이 돌아올 때까지 받는 피해가 ${timesWord(vuln)}다.`;
}

/** 다음 적의 차례에 하는 일 (피해가 없는 의도) */
const NEXT_TURN: IntentKind[] = ['block', 'buff', 'debuff', 'summon', 'advance', 'retreat', 'heal', 'flee'];

/**
 * 보이는 의도를 읽는다: 거짓 의도는 보이는 모습 그대로 (진짜를 흘리지 않는다), 가려진 의도는 가려진 이유만.
 * 숫자는 엔진 미리보기 값 (약화·취약·힘·층 배율 반영, 내 방어도로 막기 전)
 */
function readIntent(e: EnemyUnit, real: Intent | null): IntentRead | null {
  const c = store.combat!;
  const it = shownIntentOf(real, c.p.insight);
  if (!it) return null;
  const veil = veilName();
  // 가려진 의도
  if (it.hidden && c.p.insight < HIDDEN_REVEAL) {
    return {
      icon: INTENT_ICON.unknown,
      color: INTENT_COLOR.unknown,
      word: '가려짐',
      num: '???',
      title: '???',
      says: [veil ? `의도가 보이지 않는다. ${veil} 때문이다.` : `의도가 보이지 않는다. 이 적은 할 일을 숨기고 있다. 통찰 ${HIDDEN_REVEAL}${josa(HIDDEN_REVEAL, '이면')} 보인다.`],
    };
  }
  // 어둠에 묻힌 의도 (종류조차 보이지 않는 속임수)
  if (it.move === '_disguise' && it.kind === 'unknown') {
    const at = real?.disguise?.reveal ?? DISGUISE_REVEAL;
    return {
      icon: INTENT_ICON.unknown,
      color: INTENT_COLOR.unknown,
      word: '가려짐',
      name: it.label,
      title: it.label,
      says: [veil ? `의도가 보이지 않는다. ${veil} 때문이다. 통찰 ${at}${josa(at, '이면')} 보인다.` : '의도가 보이지 않는다.'],
    };
  }
  const fake = it.move === '_disguise';
  const move = fake ? null : c.moveDef(e, it.move);
  const rule = (it.desc ?? move?.desc) || undefined;
  const color = INTENT_COLOR[it.kind];
  const canBreak = e.maxPoise > 0;

  // 즉사기: 해골과 함께 크게
  if (it.kind === 'death') {
    const ward = c.p.st.ward ?? 0;
    const wardName = STATUSES.get('ward')?.name ?? '결계';
    return {
      icon: INTENT_ICON.death,
      color,
      word: INTENT_NAME.death,
      name: it.label,
      glow: 'death',
      title: it.label,
      says: ['즉사기다. 막지 못하면 사경 없이 그 자리에서 죽는다.', ward > 0 ? `지금 ${wardName}${josa(wardName, '이')} 있어 한 번은 막아 준다.` : `${wardName}${josa(wardName, '이')} 있으면 한 번 막아 준다.`],
      rule,
    };
  }
  if (it.kind === 'stunned') {
    return {
      icon: INTENT_ICON.stunned,
      color,
      word: INTENT_NAME.stunned,
      name: '행동 불가',
      title: it.label,
      says: [it.move === '_broken' ? brokenSay(e) : INTENT_MEANING.stunned],
      rule,
    };
  }
  // 기절(얼어붙음 등)이면 계획한 행동 대신 쉰다는 것을 보여 준다
  if ((e.st.stun ?? 0) > 0) {
    return { icon: INTENT_ICON.stunned, color: INTENT_COLOR.stunned, word: '기절', name: '행동 불가', title: '기절', says: ['기절해서 다음 적의 차례엔 행동하지 못한다.'] };
  }

  const hits = it.hits ?? 1;
  const dealt = !!it.dmg && (it.kind === 'attack' || it.kind === 'charge' || it.kind === 'horror' || it.kind === 'debuff' || !!it.extra?.includes('attack'));
  const per = dealt ? c.preview(e, c.p, it.dmg!, 'blunt') : 0;
  const total = per * hits;
  const num = hits > 1 ? `${per}×${hits}` : `${per}`;
  const sum = hits > 1 ? `합 ${total}` : undefined;
  /** '7 피해를 2번(합계 14)' */
  const hitPhrase = hits > 1 ? `${per} 피해를 ${hits}번(합계 ${total})` : `${per} 피해를`;

  // 힘을 모은다 (번개): 다음 차례엔 모으기만, 그다음 차례에 큰 공격.
  // 모으지 않는 번개(만조·사냥 같은 퍼즐 위협)는 이 차례에 바로 닥친다 — 막는 법은 행동 설명과 띠에
  if (it.kind === 'charge' || it.charging) {
    const next = fake ? null : chargeFollowUp(e, it);
    const says = it.charging
      ? ['다음 적의 차례엔 힘만 모은다.', dealt ? (next ? `그다음 차례에 쓸 「${next}」${josa(next, '은')} ${hitPhrase} 준다.` : `그다음 차례에 ${hitPhrase} 준다.`) : '그다음 차례에 큰 행동을 한다.']
      : dealt
        ? [`다음 적의 차례에 ${hitPhrase} 준다.`]
        : [rule ? '큰 행동을 앞두고 있다. 막는 법은 아래 설명에 있다.' : '큰 행동을 앞두고 있다.'];
    if (canBreak) says.push(it.charging ? '그 전에 버팀을 0으로 깎아 붕괴시키면 끊긴다.' : '붕괴시키면 끊긴다.');
    return {
      icon: INTENT_ICON.charge,
      color: INTENT_COLOR.charge,
      word: INTENT_NAME.charge,
      num: dealt ? num : undefined,
      name: dealt ? undefined : it.label,
      sub: dealt ? sum : undefined,
      glow: 'charge',
      title: it.label,
      says,
      rule,
    };
  }

  // 정신 공격: 큰 숫자는 잃을 정신력
  if (it.kind === 'horror') {
    const san = c.previewSanityLoss(it.sanity ?? 0);
    const says = [dealt ? `다음 적의 차례에 정신력 ${san}${josa(san, '을')} 깎고 ${hitPhrase} 준다.` : `다음 적의 차례에 정신력 ${san}${josa(san, '을')} 깎는다.`];
    const g = dealt ? guardSay(total) : null;
    if (g) says.push(g);
    return { icon: INTENT_ICON.horror, color, word: INTENT_NAME.horror, num: `${san}`, sub: dealt ? `피해 ${num}` : undefined, title: it.label, says, rule };
  }

  if (dealt) {
    // 모아 둔 힘을 쏟아내는 일격 (번개 다음 차례)
    const release = !fake && !!e.mem.charge && real?.move === e.intent?.move;
    const says: string[] = [];
    if (release) says.push('모아 둔 힘을 쏟아내는 일격이다.');
    says.push(it.kind === 'debuff' ? `다음 적의 차례에 ${hitPhrase} 주고 해로운 상태를 건다.` : `다음 적의 차례에 ${hitPhrase} 준다.`);
    const g = guardSay(total);
    if (g) says.push(g);
    if (release && canBreak) says.push('그 전에 붕괴시키면 끊긴다.');
    if ((e.st.madden ?? 0) > 0) says.push(`${STATUSES.get('madden')?.name ?? '광란'} 상태라 공격마다 절반 확률로 다른 적을 때린다.`);
    const more = !!it.extra?.length || it.kind === 'debuff';
    return {
      icon: INTENT_ICON.attack,
      color: INTENT_COLOR.attack,
      word: INTENT_NAME.attack,
      num,
      sub: sum ? (more ? `${sum} +효과` : sum) : release ? '모은 힘' : more ? '+효과' : undefined,
      glow: release ? 'charge' : undefined,
      title: it.label,
      says,
      rule: rule ?? extraSay(it),
    };
  }

  // 피해가 없는 의도
  const wait = it.move === '_wait';
  const word = wait ? '관망' : INTENT_NAME[it.kind];
  const says = wait
    ? [INTENT_WAIT]
    : NEXT_TURN.includes(it.kind)
      ? [`다음 적의 차례에 ${INTENT_MEANING[it.kind]}`]
      : it.kind === 'special'
        ? ['이 적만의 특별한 행동이다.']
        : it.kind === 'unknown'
          ? ['무엇을 할지 알 수 없다.']
          : [INTENT_MEANING[it.kind]];
  return { icon: INTENT_ICON[it.kind], color, word, name: it.label !== word ? it.label : undefined, title: it.label, says, rule: rule ?? extraSay(it) };
}

/** 고유 설명이 없는 행동의 덧붙는 효과 */
function extraSay(it: Intent): string | undefined {
  const more = (it.extra ?? []).filter((k) => k !== it.kind);
  return more.length ? `덧붙는 효과: ${more.map((k) => INTENT_NAME[k]).join(', ')}` : undefined;
}

/** 적 머리 위의 의도 표시: 아이콘 아래 짧은 이름, 옆에 숫자(다단이면 7×2와 합계) */
function IntentBadge({ r, onPress, big }: { r: IntentRead; onPress?: () => void; big?: boolean }) {
  const inner = (
    <>
      <span class="ib-ic">
        <Icon name={r.icon} size={big ? 22 : 16} color={r.color} />
        <small>{r.word}</small>
      </span>
      {(r.num || r.name || r.sub) && (
        <span class="ib-v">
          {r.num && <b class="num">{r.num}</b>}
          {r.name && <b class="nm">{r.name}</b>}
          {r.sub && <small>{r.sub}</small>}
        </span>
      )}
    </>
  );
  const cls = `ibadge ${r.glow ?? ''} ${big ? 'big' : ''}`;
  if (!onPress) return <span class={cls} style={{ color: r.color }}>{inner}</span>;
  return (
    <button class={cls} style={{ color: r.color }} aria-label={`${r.word} 의도 자세히`} {...press(onPress, onPress)}>
      {inner}
    </button>
  );
}

/** 글 속 숫자를 굵게 (7×2, 50% 같은 것도) */
function Nums({ text }: { text: string }) {
  const parts = text.split(/(\d+(?:×\d+)?%?)/);
  return <>{parts.map((t, i) => (i % 2 ? <b class="kv">{t}</b> : t))}</>;
}

/** 의도를 누르면: 종류의 뜻과 실제 수치, 그 행동의 설명, 걸린 위협 */
function IntentPeek({ uid, onClose }: { uid: string; onClose: () => void }) {
  const c = store.combat;
  const e = c?.s.enemies.find((x) => x.uid === uid && !x.dead);
  if (!c || !e) return null;
  const real = snapIntentOf(e);
  const r = readIntent(e, real);
  if (!r) return null;
  const obj = store.snap?.obj ?? c.s.obj;
  const threat = threatSay(e, shownIntentOf(real, c.p.insight), obj);
  const say = r.says.join(' ');
  return (
    <div class="veil" style={{ background: 'rgba(0,0,0,0.35)', alignItems: 'flex-end' }} onClick={onClose}>
      <div class="tip panel intent-peek" onClick={onClose}>
        <div class="tip-head">
          <IntentBadge r={r} big />
          <div>
            <div class="t" style={{ color: r.color }}>
              {r.title}
            </div>
            <div class="s">{e.name}의 의도</div>
          </div>
        </div>
        <p class="peek-say">
          <Nums text={say} />
        </p>
        {r.rule && <p class="peek-rule">{r.rule}</p>}
        {threat && (
          <p class={`peek-threat ${obj?.lethal ? '' : 'warn'}`}>
            <Icon name="gi:hazard-sign" size={14} />
            {threat}
          </p>
        )}
        <PeekWords text={[say, r.rule ?? ''].join(' ')} />
      </div>
    </div>
  );
}

/** 자세히 보기에서 풀지 않는 용어 (이 창이 곧 그 풀이다) */
const PEEK_SKIP = new Set(['의도', '준비', '즉사기']);

/** 자세히 보기 아래의 용어 풀이 (넷까지 — 휴대폰 한 화면에 들게) */
function PeekWords({ text }: { text: string }) {
  // 「행동 이름」 속 낱말은 용어가 아니다 (「어둠의 피라미드」의 '어둠' 같은 것)
  const ks = keywordsIn(text.replace(/「[^」]*」/g, ''))
    .filter((k) => !PEEK_SKIP.has(k.name))
    .slice(0, 4);
  if (!ks.length) return null;
  return (
    <div class="kw-list">
      {ks.map((k) => (
        <div class="kw">
          <Icon name={k.icon} size={16} color={k.color} />
          <div>
            <b style={{ color: k.color }}>{k.name}</b> {k.desc}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 의도 읽는 법 아래: 버팀 표시 읽는 법 (붕괴 개편) */
function GuardLegend() {
  return (
    <div class="gap-legend">
      <div class="legend-lead">
        <div class="poise" style={{ flex: 'none' }}>
          <i />
          <i />
          <i class="drain" style={{ '--d': '33%' } as Record<string, string>} />
          <i class="off" />
        </div>
        <p>
          적 이름 아래의 노란 ◆는 <b>버팀</b>이다. {GUARD_RULE}(금빛 테두리). {CHIP_RULE}. 비어 가는 ◆가 다음에 깎일 것이다.
        </p>
      </div>
      <p class="legend-note">{breakGlossary()} 붕괴한 적은 체력 막대가 붉게 빛나고, 숫자는 남은 쉬는 차례다.</p>
    </div>
  );
}

/** 의도 표시 읽는 법: 모든 아이콘의 뜻 */
function IntentLegend({ onClose }: { onClose: () => void }) {
  const rows: [IntentKind, string, string][] = [
    ['attack', INTENT_NAME.attack, INTENT_MEANING.attack],
    ['charge', INTENT_NAME.charge, INTENT_MEANING.charge],
    ['death', INTENT_NAME.death, INTENT_MEANING.death],
    ['horror', INTENT_NAME.horror, INTENT_MEANING.horror],
    ['debuff', INTENT_NAME.debuff, INTENT_MEANING.debuff],
    ['block', INTENT_NAME.block, INTENT_MEANING.block],
    ['buff', INTENT_NAME.buff, INTENT_MEANING.buff],
    ['heal', INTENT_NAME.heal, INTENT_MEANING.heal],
    ['summon', INTENT_NAME.summon, INTENT_MEANING.summon],
    ['special', INTENT_NAME.special, INTENT_MEANING.special],
    ['advance', INTENT_NAME.advance, INTENT_MEANING.advance],
    ['retreat', INTENT_NAME.retreat, INTENT_MEANING.retreat],
    ['flee', INTENT_NAME.flee, INTENT_MEANING.flee],
    ['stunned', '붕괴·기절', INTENT_MEANING.stunned],
    ['sleep', INTENT_NAME.sleep, INTENT_MEANING.sleep],
    ['unknown', '관망', INTENT_WAIT],
    ['unknown', '가려짐', INTENT_MEANING.unknown],
  ];
  const sample: IntentRead = { icon: INTENT_ICON.attack, color: INTENT_COLOR.attack, word: INTENT_NAME.attack, num: '7×2', sub: '합 14', title: '', says: [] };
  return (
    <Sheet title="의도 읽는 법" icon="gi:open-book" onClose={onClose}>
      <div class="legend scroll">
        <div class="legend-lead">
          <IntentBadge r={sample} />
          <p>
            적 머리 위의 표시는 그 적이 다음 차례에 할 행동이다. 숫자는 내가 받을 피해다. 약화·취약·힘을 반영했고 방어도로 막기 전 값이다. <b class="kv">7×2</b>는 7 피해를 2번, 합계 14라는 뜻이다.
          </p>
        </div>
        <p class="legend-note">표시를 누르면 그 적의 의도가 자세히 나온다. 테두리가 빛나면 큰 공격이 오고 있다.</p>
        <div class="legend-rows">
          {rows.map(([k, w, t]) => (
            <div class="legend-row">
              <span class="lg-mark" style={{ color: INTENT_COLOR[k] }}>
                <Icon name={INTENT_ICON[k]} size={20} color={INTENT_COLOR[k]} />
                <small>{w}</small>
              </span>
              <span class="lg-text">{t}</span>
            </div>
          ))}
        </div>
        <GuardLegend />
        <GapLegend />
      </div>
    </Sheet>
  );
}

function EnemyOverlay({
  e,
  real,
  a,
  place,
  areaTop,
  focus,
  valid,
  onTap,
  onIntent,
  onGap,
}: {
  e: Snap['e'][number];
  real: EnemyUnit;
  a: Anchor;
  place: Place;
  areaTop: number;
  focus: boolean;
  valid: boolean;
  onTap: () => void;
  onIntent: () => void;
  onGap: () => void;
}) {
  const def = ENEMIES.get(real.def);
  const iv = readIntent(real, e.intent);
  // 틈: 체력 막대 끝에 계열 색의 갈라진 표시 (연출 중이면 그 시점의 모습)
  const gap = gapView(e.uid);
  const w = a.size * 0.95;
  const h = a.size * 1.1;
  const tip = () => enemyTip(real);
  const feet = place(a.x, a.y);
  // 의도 표시는 두 줄(아이콘 아래 이름) — 머리와 겹치지 않게 조금 더 위에
  const head = place(a.x, a.y - a.size * stage.battle.headroom(e.uid) - 36);
  const plate = place(a.x, a.y + 4);
  return (
    <>
      <div class={`enemy-hit ${focus ? 'focus' : ''} ${valid ? 'valid' : ''}`} style={{ left: feet.x, top: feet.y, width: w, height: h }} {...press(onTap, tip)} />
      {iv && (
        <div class="enemy-ui ib-wrap" style={{ left: head.x, top: Math.max(areaTop - 4, head.y) }}>
          <IntentBadge r={iv} onPress={onIntent} />
        </div>
      )}
      <div class="enemy-ui" style={{ left: plate.x, top: plate.y }}>
        <div class="eplate" style={{ width: Math.max(64, Math.min(116, (a.slot ?? 116) - 4)) }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, maxWidth: '100%' }}>
            <span class="ename">{real.name}</span>
            {e.block > 0 && (
              <span class="ebl">
                <Icon name="gi:shield" size={11} color="#8fc4ea" />
                {e.block}
              </span>
            )}
            {/* 틈: 이름 옆 (긴 이름은 말줄임으로 줄어든다. 아래 버팀·약점 줄과 겹치지 않게) */}
            {gap && <GapMark key={`${gap.school}${gap.big ? '+' : ''}`} g={gap} onPress={onGap} />}
          </div>
          {/* 버팀이 남은 적은 금빛 테두리(받는 피해 절반), 붕괴한 적은 붉은 테두리 */}
          <Bar kind="hp" value={Math.max(0, e.hp)} max={e.maxHp} label={def?.tier === 'boss' ? '' : undefined} cls={e.maxPoise <= 0 ? '' : e.broken ? 'exposed' : e.poise > 0 ? 'guarded' : ''} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {e.maxPoise > 0 && <PoiseRow e={e} />}
            <div class="weak-row">
              {real.weak.map((w) =>
                e.known.includes(w) ? (
                  <span class="w" style={{ borderColor: DMG_COLOR[w] }}>
                    <Icon name={DMG_ICON[w]} size={11} color={DMG_COLOR[w]} />
                  </span>
                ) : (
                  <span class="w">?</span>
                ),
              )}
            </div>
          </div>
          <StatusRow st={e.st} max={Math.max(64, Math.min(130, (a.slot ?? 130) - 4))} />
        </div>
      </div>
    </>
  );
}

/**
 * 버팀 줄: ◆가 남은 버팀. 약점이 아닌 공격이 쌓이면 다음에 깎일 ◆가 위에서부터 빈다 (GUARD.chip번이면 하나).
 * 붕괴 중이면 '붕괴 2'(남은 쉬는 차례). 버팀이 많은 적(9 이상)은 ◆ 하나와 숫자로
 */
function PoiseRow({ e }: { e: Snap['e'][number] }) {
  if (e.broken) {
    return (
      <div class="poise broken">
        <span class="brk">붕괴{e.stun > 0 ? ` ${e.stun}` : ''}</span>
      </div>
    );
  }
  const drain = (i: number) => (i === e.poise - 1 && e.chip > 0 ? ({ '--d': `${Math.round((e.chip / GUARD.chip) * 100)}%` } as Record<string, string>) : undefined);
  if (e.maxPoise > 8) {
    return (
      <div class="poise" style={{ alignItems: 'center', gap: 3 }}>
        <i class={e.chip > 0 ? 'drain' : ''} style={drain(e.poise - 1)} />
        <span class="num" style={{ fontSize: 10.5, color: '#ffe080' }}>
          {e.poise}/{e.maxPoise}
        </span>
      </div>
    );
  }
  return (
    <div class="poise">
      {Array.from({ length: e.maxPoise }, (_, i) => (
        <i class={i < e.poise ? (i === e.poise - 1 && e.chip > 0 ? 'drain' : '') : 'off'} style={drain(i)} />
      ))}
    </div>
  );
}

/** 수호자·군주의 체력은 숫자 대신 상태로만 알려 준다 */
function woundWord(r: number): string {
  return r > 0.8 ? '건재하다' : r > 0.55 ? '상처 입었다' : r > 0.3 ? '깊이 상처 입었다' : r > 0.12 ? '비틀거린다' : '쓰러지기 직전이다';
}

function enemyTip(e: EnemyUnit) {
  const def = ENEMIES.get(e.def);
  if (!def) return;
  const traits = (def.traits ?? []).map((t) => TRAITS.get(t)).filter(Boolean);
  const r = readIntent(e, snapIntentOf(e));
  const gap = gapView(e.uid);
  showTip({
    title: e.name,
    sub: `${def.tier === 'boss' ? '수호자' : def.tier === 'elite' ? '정예' : def.tier === 'minion' ? '하수인' : '일반'} · ${e.row === 0 ? '전열' : '후열'}`,
    icon: def.icon,
    color: def.eldritch ? '#4fffc4' : '#e9e3d6',
    body:
      (r ? `의도: ${r.title}\n${r.says.join(' ')}` : '') +
      (gap ? `${r ? '\n\n' : ''}${gapLine(gap)}` : '') +
      (traits.length ? `\n\n${traits.map((t) => `【${t!.name}】 ${t!.desc}`).join('\n')}` : ''),
    lines: [
      { label: '체력', value: def.tier === 'boss' ? woundWord(e.hp / Math.max(1, e.maxHp)) : `${e.hp}/${e.maxHp}` },
      ...(e.maxPoise > 0
        ? [
            { label: '버팀', value: e.broken ? `붕괴 중 · 받는 피해 ${timesWord(breakProfile(def).vuln)}` : `${e.poise}/${e.maxPoise} · 받는 피해 ${guardWord()}` },
            { label: '붕괴하면', value: breakSay(def) },
          ]
        : []),
      {
        label: '약점',
        value: e.weak.map((w) => (e.known.includes(w) ? DMG_NAME[w] : '?')).join(' · '),
      },
      ...(Object.keys(e.resist).length
        ? [{ label: '저항', value: Object.entries(e.resist).map(([k, v]) => `${DMG_NAME[k as keyof typeof DMG_NAME]} ${Math.round((1 - (v ?? 1)) * 100)}%`).join(', ') }]
        : []),
    ],
  });
}

/** cost·cd: 전투 중 실제 값 (각인·유물이 바꾼 행동력·재사용 대기) */
function skillTip(
  def: SkillDef,
  lvl: number,
  runes: string[],
  use?: ReturnType<NonNullable<typeof store.combat>['makeUse']>,
  cost = lvlVal(def.cost, lvl),
  cd = lvlVal(def.cd, lvl),
  gap?: HarvestHint | null,
) {
  const c = store.combat;
  const segs = skillDesc(def, lvl, { c, target: c?.enemy(store.focus) ?? null, use: use ?? null });
  showTip({
    title: def.name + (lvl > 0 ? '+' : ''),
    nameClass: def.rarity === 'genesis' ? 'genesis-name' : undefined,
    sub: `${schoolLabel(def)} · ${RANGE_NAME[def.range]} · ${TARGET_NAME[def.target]}${def.type ? ` · ${DMG_NAME[def.type]}` : ''}`,
    icon: def.icon,
    color: SCHOOL_COLOR[def.school],
    body: segs.map((x) => x.t).join('') + (runes.length ? `\n\n각인: ${runes.map((r) => RUNES.get(r)?.name).join(', ')}` : '') + (gap ? `\n\n${harvestSay(gap)}` : ''),
    lines: [
      { label: '행동력', value: String(cost) },
      { label: '재사용 대기', value: cd >= 99 ? '전투당 1회' : cd > 0 ? `${cd}턴` : '없음' },
    ],
  });
}

/** 두 색을 섞는다 (#rrggbb, t = b 쪽 비율) */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const x = p(a);
  const y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** 카드마다 고정된 작은 기울기 (손으로 늘어놓은 듯, -0.5°~0.5°) */
function tiltOf(key: string): number {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return (((h >>> 0) % 11) - 5) / 10;
}

/** 스킬 카드: 잉크로 그린 수첩 낱장. 왼쪽 위 밀랍 인장 = 계열 색과 행동력 */
function SkillButton({ r }: { r: string }) {
  const s = store;
  const c = s.combat!;
  const info = c.skillInfo(r);
  if (!info) return <EmptySlot />;
  const { def, owned } = info;
  const cd = (s.snap?.cd ?? c.s.cd)[owned.uid] ?? 0;
  const why = c.blockReason(r);
  const cost = c.costOf(info);
  const sel = s.sel === r;
  const hue = info.basic ? '#a39a88' : SCHOOL_COLOR[def.school];
  // 기억을 빼앗기면 이름이 뒤섞여 보인다 (기본기는 그대로)
  const scrambled = !!(s.snap?.ui ?? c.s.vars)['ui:scramble'] && !info.basic;
  const tap = () => {
    if (s.busy) return;
    if (sel) {
      if (why) {
        s.toast(why, 'bad');
        return;
      }
      if (def.target !== 'single' || c.validTargets(def).length === 1 || (s.focus && c.validTargets(def).some((e) => e.uid === s.focus))) {
        void useSkill(r, def.target === 'single' ? (c.validTargets(def).find((e) => e.uid === s.focus)?.uid ?? c.validTargets(def)[0]?.uid) : null);
      } else s.toast('대상 선택', 'info', 1200);
      return;
    }
    s.sel = r;
    s.emit();
  };
  const wax = `--tilt:${tiltOf(owned.uid)}deg;--wax-hi:${mix(hue, '#1a0d08', 0.25)};--wax:${mix(hue, '#1a0d08', 0.52)};--wax-lo:${mix(hue, '#080402', 0.76)}`;
  // 틈 거두기: 오른쪽 위에 틈 색의 갈라진 밀랍 (대상을 아직 안 골랐으면 흐리게)
  const gh = cd > 0 ? null : harvestHint(r);
  const gapWax = gh ? `--g:${gh.color};--gw-hi:${mix(gh.color, '#1a0d08', 0.18)};--gw:${mix(gh.color, '#1a0d08', 0.45)};--gw-lo:${mix(gh.color, '#080402', 0.72)}` : '';
  return (
    <button
      class={`skill ${sel ? 'sel' : ''} ${why && !cd ? 'off' : ''} ${cd > 0 ? 'cooling' : ''} ${info.basic ? 'basic' : ''} ${gh ? 'gap' : ''}`}
      style={wax}
      {...press(tap, () => skillTip(def, owned.lvl, owned.runes, c.makeUse(info), cost, c.cdOf(info), gh))}
    >
      <span class="seal" aria-label={`행동력 ${cost}`}>
        {cost}
      </span>
      {gh && (
        <span class={`gapseal ${gh.sure ? 'sure' : 'maybe'}`} style={gapWax} aria-label={harvestSay(gh)}>
          <Icon name={GAP_ICON} size={gh.sure ? 13 : 11} color="#fff1d6" />
        </span>
      )}
      {info.basic && <span class="basic-tag">{info.basic === 'weapon' ? '무기' : '방어'}</span>}
      <Icon name={def.icon} size={24} color={mix(hue, '#eadcbc', 0.28)} />
      <span class={`sn ${scrambled ? 'scrambled' : ''} ${!scrambled && def.rarity === 'genesis' ? 'genesis-name' : ''}`} style={{ color: def.rarity === 'basic' ? '#e9e3d6' : RARITY_COLOR[def.rarity] === '#cfc8b8' ? '#e9e3d6' : RARITY_COLOR[def.rarity] }}>
        {scrambled ? garbleStable(def.name) : def.name}
        {owned.lvl > 0 ? '+' : ''}
      </span>
      {owned.runes.length > 0 && <span class="rune-dot" />}
      {cd > 0 && (
        <span class="cd">
          <b>{cd >= 99 ? '✕' : cd}</b>
          <small>{cd >= 99 ? '다 씀' : '턴'}</small>
        </span>
      )}
    </button>
  );
}

function EmptySlot() {
  return (
    <div class="skill empty">
      <span class="sn">빈 슬롯</span>
    </div>
  );
}

/** 설명 쪽지: 고른 스킬·소모품, 눌러 둔 적의 의도, 아무것도 없으면 쓰는 법 */
function InfoBox({ onIntent }: { onIntent: (uid: string) => void }) {
  const s = store;
  const c = s.combat!;
  const run = s.run!;
  if (s.sel?.startsWith('c')) {
    const id = run.consumables[Number(s.sel.slice(1))];
    const def = id ? CONSUMABLES.get(id) : null;
    if (def)
      return (
        <div class="infobox note">
          <span class="note-ic">
            <Icon name={def.icon} size={28} color="var(--brass-2)" />
          </span>
          <div class="txt">
            <div class="nm">{def.name}</div>
            <div class="desc">{def.desc}</div>
          </div>
          {def.target !== 'single' ? (
            <button class="use" disabled={s.busy} onClick={() => useItem(Number(s.sel!.slice(1)))}>
              사용
            </button>
          ) : (
            <span class="aim">대상 선택</span>
          )}
        </div>
      );
  }
  const info = s.sel ? c.skillInfo(s.sel) : null;
  if (info) {
    const use = c.makeUse(info);
    const target = c.enemy(s.focus) ?? (info.def.target === 'single' ? c.validTargets(info.def)[0] : null);
    const scrambled = !!(s.snap?.ui ?? c.s.vars)['ui:scramble'] && !info.basic;
    const segs = skillDesc(info.def, info.owned.lvl, { c, target, use }).map((x) => (scrambled ? { ...x, t: garbleStable(x.t) } : x));
    const why = c.blockReason(s.sel!);
    const cd = c.cdOf(info);
    const gh = harvestHint(s.sel);
    return (
      <div class="infobox note">
        <span class="note-ic">
          <Icon name={info.def.icon} size={28} color={SCHOOL_COLOR[info.def.school]} />
        </span>
        <div class="txt">
          <div class={`nm ${scrambled ? 'scrambled' : ''}`}>
            {scrambled ? garbleStable(info.def.name) : info.def.name}
            {info.owned.lvl > 0 ? '+' : ''}
            <span class="nm-sub">
              {RANGE_NAME[info.def.range]} · {TARGET_NAME[info.def.target]}
              {info.def.type ? ` · ${DMG_NAME[info.def.type]}` : ''}
              {cd > 0 ? ` · 재사용 대기 ${cd >= 99 ? '전투당 1회' : cd + '턴'}` : ''}
            </span>
          </div>
          <div class="desc">
            <Segs segs={segs} />
          </div>
          {gh && (
            <div class={`gap-line ${gh.sure ? '' : 'maybe'}`} style={{ color: gh.color }}>
              <Icon name={GAP_ICON} size={13} color={gh.color} />
              <span>{harvestSay(gh)}</span>
            </div>
          )}
          {why && <div class="why">{why}</div>}
        </div>
        {!why && info.def.target !== 'single' && (
          <button class="use" disabled={s.busy} onClick={() => useSkill(s.sel!)}>
            사용
          </button>
        )}
      </div>
    );
  }
  const e = c.enemy(s.focus);
  if (e) {
    const r = readIntent(e, snapIntentOf(e));
    return (
      <div class="infobox note" role="button" {...press(() => onIntent(e.uid), () => enemyTip(e))}>
        <span class="note-ic">
          <Icon name={ENEMIES.get(e.def)?.icon ?? 'gi:help'} size={28} color="#d9c9a6" />
        </span>
        <div class="txt">
          <div class="nm">
            {e.name}
            {r && (
              <span class="nm-sub" style={{ color: r.color }}>
                {r.word}
                {r.title !== r.word ? ` · ${r.title}` : ''}
              </span>
            )}
          </div>
          <div class="clamp">{r ? r.says.join(' ') : '보이는 의도 없음'}</div>
          <div class="hint">누르면 의도 자세히 · 길게 누르면 적 정보</div>
        </div>
      </div>
    );
  }
  return (
    <div class="infobox note idle">
      <span class="note-ic">
        <Icon name="gi:quill-ink" size={26} color="#a8977a" />
      </span>
      <div class="txt">누르면 설명. 한 번 더 누르거나 적을 누르면 사용. 길게 누르면 자세히</div>
    </div>
  );
}

export function Floaters() {
  return (
    <div class="floaters">
      {fx.floaters.map((f) => (
        <div key={f.id} class={`floater ${f.kind}`} style={{ left: f.x, top: f.y, color: f.color, fontSize: f.size }}>
          {f.text}
        </div>
      ))}
    </div>
  );
}

/** 전투 내내 남는 화면 상태: 차오른 물, 금 간 유리, 어둠, 지켜보는 눈 (누르기는 통과) */
function UiVarsLayer({ water, cracks, dark, eye }: { water: number; cracks: number; dark: number; eye: boolean }) {
  const eyeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!eye || !eyeRef.current) return;
    return mountWatcher(eyeRef.current);
  }, [eye]);
  const crackSvg = useMemo(() => (cracks > 0 ? staticCracks(cracks) : ''), [cracks]);
  if (!water && !cracks && !dark && !eye) return null;
  return (
    <div class="ui-layer">
      {eye && <div class="ui-eye" ref={eyeRef} />}
      {dark > 0 && <div class="ui-dark" style={{ opacity: Math.min(1, dark / 100) }} />}
      {cracks > 0 && <div class="ui-cracks" dangerouslySetInnerHTML={{ __html: crackSvg }} />}
      <div class="ui-water" style={{ height: `${Math.max(0, Math.min(3, water)) * 13}vh`, opacity: water > 0 ? 1 : 0 }} />
    </div>
  );
}
