import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Snap } from '../../engine/combat';
import { ANOMALIES, CONSUMABLES, ENEMIES, ORIGINS, RUNES, STATUSES, TRAITS } from '../../engine/registry';
import { lvlVal } from '../../engine/combat';
import type { EnemyUnit, Intent, SkillDef } from '../../engine/types';
import { fx, syncBattle } from '../../director';
import { layoutEnemies, type Anchor } from '../../render/battle';
import { stage } from '../../render/stage';
import { endTurn, useItem, useSkill } from '../../state/actions';
import { store } from '../../state/store';
import { sound } from '../../sound';
import { Bar, Icon, press, Segs, showTip } from '../components';
import { DMG_COLOR, DMG_ICON, DMG_NAME, INTENT_COLOR, INTENT_ICON, RARITY_COLOR, SCHOOL_COLOR, SCHOOL_NAME, skillDesc, statusText } from '../text';

const RANGE_NAME = { melee: '근접', ranged: '원거리', self: '자신' } as const;
const TARGET_NAME = { single: '단일', front: '전열', back: '후열', all: '전체', random: '무작위', self: '자신' } as const;

export function CombatScreen() {
  const s = store;
  const run = s.run!;
  const c = s.combat;
  const areaRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      stage.setBattleRect({ x: r.left, y: r.top, w: r.width, h: r.height });
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
    sound.sfx('click', { volume: 0.4 });
    s.emit();
  };

  const p = snap.p;
  const ownGun = ['weapon', ...run.slots].some((ref) => ref && c.skillInfo(ref)?.def.tags.includes('ammo'));
  const refs = ['weapon', 'armor', ...run.slots];
  const anyUsable = refs.some((r) => r && !c.blockReason(r));

  return (
    <div class="screen" style={{ animation: 'none' }}>
      <div class="battle-top">
        <span class="chip">
          <Icon name="gi:sands-of-time" size={13} />
          {c.s.turn}턴
        </span>
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
              focus={s.focus === e.uid}
              valid={!!(validTargets?.has(e.uid) || itemSingle)}
              onTap={() => tapEnemy(e.uid)}
            />
          );
        })}

      <div class="pbox panel">
        <div class="prow">
          <button id="p-anchor" class="badge" style={{ width: 30, height: 30, display: 'grid', placeItems: 'center' }} onClick={() => playerTip()}>
            <Icon name={ORIGINS.get(run.origin)?.icon ?? 'gi:hood'} size={24} color="var(--brass-2)" />
          </button>
          <Bar kind="hp" value={p.hp} max={p.maxHp} block={p.block} label={(p.st.dying ? '사경 ' : '') + `${p.hp}/${p.maxHp}`} />
          {p.block > 0 && (
            <span class="blockpill">
              <Icon name="gi:shield" size={14} color="#8fc4ea" />
              {p.block}
            </span>
          )}
          {(p.st.barrier ?? 0) > 0 && (
            <span class="blockpill" style={{ color: '#b0e0ff' }}>
              <Icon name="gi:bubble-field" size={14} color="#b0e0ff" />
              {p.st.barrier}
            </span>
          )}
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
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Bar kind="san" value={p.sanity} max={run.player.maxSanity} label={`정신 ${p.sanity}`} />
          </div>
          {p.insight > 0 && (
            <span class="chip" style={{ color: 'var(--ins)', padding: '1px 6px' }}>
              <Icon name="gi:third-eye" size={12} />
              {p.insight}
            </span>
          )}
        </div>
        <StatusRow st={p.st} />
      </div>

      <InfoBox />

      <div class="skills">
        {refs.map((ref, i) => (ref ? <SkillButton key={ref} r={ref} /> : <EmptySlot key={`e${i}`} />))}
      </div>

      <div class="footer">
        {run.consumables.map((id, i) => {
          const def = id ? CONSUMABLES.get(id) : null;
          const key = `c${i}`;
          return (
            <button
              class={`slot-item ${s.sel === key ? 'sel' : ''}`}
              style={s.sel === key ? { borderColor: 'var(--brass-2)', boxShadow: '0 0 12px rgba(240,207,122,0.4)' } : undefined}
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
              {def ? <Icon name={def.icon} size={22} color="var(--brass-2)" /> : <span class="muted">·</span>}
            </button>
          );
        })}
        <button class={`btn endturn ${!anyUsable && !s.busy ? 'ready' : ''}`} disabled={s.busy || c.s.phase !== 'player'} onClick={() => endTurn()}>
          {s.busy ? '…' : '턴 종료'}
        </button>
      </div>

      <Floaters />
    </div>
  );
}

function AnomalyChip({ id }: { id: string }) {
  const a = ANOMALIES.get(id);
  if (!a) return null;
  return (
    <button class="chip" style={{ color: '#c08cff', borderColor: 'rgba(192,140,255,0.5)' }} onClick={() => showTip({ title: a.name, icon: a.icon, color: '#c08cff', body: a.desc })}>
      <Icon name={a.icon} size={13} />
      {a.name}
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

function StatusRow({ st, max }: { st: Record<string, number>; max?: number }) {
  const ids = Object.keys(st).filter((id) => st[id] && STATUSES.has(id) && !STATUSES.get(id)!.hidden);
  if (!ids.length) return null;
  return (
    <div class="st-row" style={max ? { maxWidth: max } : { justifyContent: 'flex-start', maxWidth: 'none' }}>
      {ids.map((id) => {
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

function intentView(e: EnemyUnit, it: Intent | null): { icon: string; color: string; text: string; sub?: string; charging?: boolean } | null {
  const c = store.combat!;
  if (!it) return null;
  if (it.hidden && c.p.insight < 5) return { icon: 'gi:help', color: '#8a8f96', text: '???' };
  const color = INTENT_COLOR[it.kind];
  if (it.kind === 'stunned') return { icon: INTENT_ICON.stunned, color, text: '붕괴', sub: '행동 불가' };
  if (it.dmg && (it.kind === 'attack' || it.kind === 'charge' || it.extra?.includes('attack') || it.kind === 'horror' || it.kind === 'debuff')) {
    const dmg = c.preview(e, c.p, it.dmg, 'blunt');
    const hits = it.hits ?? 1;
    const txt = hits > 1 ? `${dmg}×${hits}` : `${dmg}`;
    if (it.charging) return { icon: INTENT_ICON.charge, color, text: txt, sub: '다음 턴', charging: true };
    if (it.kind === 'horror') return { icon: INTENT_ICON.horror, color, text: `${txt}`, sub: `정신 ${it.sanity ?? 0}` };
    return { icon: INTENT_ICON.attack, color: INTENT_COLOR.attack, text: txt, sub: it.extra?.length ? '+효과' : undefined };
  }
  if (it.kind === 'horror') return { icon: INTENT_ICON.horror, color, text: `${it.sanity ?? 0}`, sub: '정신' };
  return { icon: INTENT_ICON[it.kind], color, text: '', sub: it.label };
}

function EnemyOverlay({ e, real, a, focus, valid, onTap }: { e: Snap['e'][number]; real: EnemyUnit; a: Anchor; focus: boolean; valid: boolean; onTap: () => void }) {
  const def = ENEMIES.get(real.def);
  const iv = intentView(real, e.intent);
  const w = a.size * 0.95;
  const h = a.size * 1.1;
  const tip = () => enemyTip(real);
  return (
    <>
      <div class={`enemy-hit ${focus ? 'focus' : ''} ${valid ? 'valid' : ''}`} style={{ left: a.x, top: a.y, width: w, height: h }} {...press(onTap, tip)} />
      {iv && (
        <div class="enemy-ui" style={{ left: a.x, top: a.y - a.size * 1.08 - 26 }}>
          <span class={`intent ${iv.charging ? 'charging' : ''}`} style={{ color: iv.color }}>
            <Icon name={iv.icon} size={17} color={iv.color} />
            {iv.text}
            {iv.sub && <small>{iv.sub}</small>}
          </span>
        </div>
      )}
      <div class="enemy-ui" style={{ left: a.x, top: a.y + 4 }}>
        <div class="eplate">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span class="ename">{real.name}</span>
            {e.block > 0 && (
              <span class="ebl">
                <Icon name="gi:shield" size={11} color="#8fc4ea" />
                {e.block}
              </span>
            )}
          </div>
          <Bar kind="hp" value={Math.max(0, e.hp)} max={e.maxHp} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {e.maxPoise > 0 &&
              (e.maxPoise > 8 ? (
                <div class={`poise ${e.broken ? 'broken' : ''}`} style={{ alignItems: 'center', gap: 3 }}>
                  <i />
                  <span class="num" style={{ fontSize: 10.5, color: e.broken ? '#ff5a4a' : '#ffe080' }}>
                    {e.poise}/{e.maxPoise}
                  </span>
                </div>
              ) : (
                <div class={`poise ${e.broken ? 'broken' : ''}`}>
                  {Array.from({ length: e.maxPoise }, (_, i) => (
                    <i class={i < e.poise ? '' : 'off'} />
                  ))}
                </div>
              ))}
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
          <StatusRow st={e.st} max={130} />
          {def?.traits?.length ? null : null}
        </div>
      </div>
    </>
  );
}

function enemyTip(e: EnemyUnit) {
  const def = ENEMIES.get(e.def);
  if (!def) return;
  const traits = (def.traits ?? []).map((t) => TRAITS.get(t)).filter(Boolean);
  const it = e.intent;
  const move = it ? store.combat!.moveDef(e, it.move) : null;
  showTip({
    title: e.name,
    sub: `${def.tier === 'boss' ? '수호자' : def.tier === 'elite' ? '정예' : def.tier === 'minion' ? '하수인' : '일반'} · ${e.row === 0 ? '전열' : '후열'}`,
    icon: def.icon,
    color: def.eldritch ? '#4fffc4' : '#e9e3d6',
    body:
      (it ? `의도: ${it.hidden && store.combat!.p.insight < 5 ? '???' : `${it.label}${move?.desc ? ` — ${move.desc}` : ''}`}` : '') +
      (traits.length ? `\n\n${traits.map((t) => `【${t!.name}】 ${t!.desc}`).join('\n')}` : ''),
    lines: [
      { label: '체력', value: `${e.hp}/${e.maxHp}` },
      { label: '버팀', value: `${e.poise}/${e.maxPoise}${e.broken ? ' (붕괴)' : ''}` },
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

function skillTip(def: SkillDef, lvl: number, runes: string[], use?: ReturnType<NonNullable<typeof store.combat>['makeUse']>) {
  const c = store.combat;
  const segs = skillDesc(def, lvl, { c, target: c?.enemy(store.focus) ?? null, use: use ?? null });
  showTip({
    title: def.name + (lvl > 0 ? ' +' : ''),
    sub: `${SCHOOL_NAME[def.school]} · ${RANGE_NAME[def.range]} · ${TARGET_NAME[def.target]}${def.type ? ` · ${DMG_NAME[def.type]}` : ''}`,
    icon: def.icon,
    color: SCHOOL_COLOR[def.school],
    body: segs.map((x) => x.t).join('') + (runes.length ? `\n\n각인: ${runes.map((r) => RUNES.get(r)?.name).join(', ')}` : ''),
    lines: [
      { label: '행동력', value: String(lvlVal(def.cost, lvl)) },
      { label: '재사용 대기', value: lvlVal(def.cd, lvl) >= 99 ? '전투당 1회' : `${lvlVal(def.cd, lvl)}턴` },
    ],
  });
}

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
  const color = info.basic ? '#cfc8b8' : SCHOOL_COLOR[def.school];
  const tap = () => {
    if (s.busy) return;
    if (sel) {
      if (why) {
        s.toast(why, 'bad');
        return;
      }
      if (def.target !== 'single' || c.validTargets(def).length === 1 || (s.focus && c.validTargets(def).some((e) => e.uid === s.focus))) {
        void useSkill(r, def.target === 'single' ? (c.validTargets(def).find((e) => e.uid === s.focus)?.uid ?? c.validTargets(def)[0]?.uid) : null);
      } else s.toast('대상을 누르세요', 'info', 1200);
      return;
    }
    s.sel = r;
    sound.sfx('click', { volume: 0.5 });
    s.emit();
  };
  return (
    <button class={`skill ${sel ? 'sel' : ''} ${why && !cd ? 'off' : ''}`} {...press(tap, () => skillTip(def, owned.lvl, owned.runes, c.makeUse(info)))}>
      {cost > 0 ? (
        <span class="cost">
          {Array.from({ length: cost }, () => (
            <i />
          ))}
        </span>
      ) : (
        <span class="cost zero">0</span>
      )}
      {info.basic && <span class="basic-tag">{info.basic === 'weapon' ? '무기' : '방어'}</span>}
      <Icon name={def.icon} size={24} color={color} />
      <span class="sn" style={{ color: def.rarity === 'basic' ? '#e9e3d6' : RARITY_COLOR[def.rarity] === '#cfc8b8' ? '#e9e3d6' : RARITY_COLOR[def.rarity] }}>
        {def.name}
        {owned.lvl > 0 ? '+' : ''}
      </span>
      {owned.runes.length > 0 && <span class="rune-dot" />}
      {cd > 0 && <span class="cd">{cd >= 99 ? '✕' : cd}</span>}
    </button>
  );
}

function EmptySlot() {
  return (
    <div class="skill" style={{ opacity: 0.25, borderStyle: 'dashed' }}>
      <span class="sn muted">빈 슬롯</span>
    </div>
  );
}

function InfoBox() {
  const s = store;
  const c = s.combat!;
  const run = s.run!;
  if (s.sel?.startsWith('c')) {
    const id = run.consumables[Number(s.sel.slice(1))];
    const def = id ? CONSUMABLES.get(id) : null;
    if (def)
      return (
        <div class="infobox panel">
          <Icon name={def.icon} size={30} color="var(--brass-2)" />
          <div class="txt">
            <div class="nm">{def.name}</div>
            {def.desc}
          </div>
          {def.target !== 'single' ? (
            <button class="btn sm" disabled={s.busy} onClick={() => useItem(Number(s.sel!.slice(1)))}>
              사용
            </button>
          ) : (
            <span class="muted" style={{ fontSize: 12 }}>
              대상을 누르세요
            </span>
          )}
        </div>
      );
  }
  const info = s.sel ? c.skillInfo(s.sel) : null;
  if (info) {
    const use = c.makeUse(info);
    const target = c.enemy(s.focus) ?? (info.def.target === 'single' ? c.validTargets(info.def)[0] : null);
    const segs = skillDesc(info.def, info.owned.lvl, { c, target, use });
    const why = c.blockReason(s.sel!);
    const cd = lvlVal(info.def.cd, info.owned.lvl);
    return (
      <div class="infobox panel">
        <Icon name={info.def.icon} size={30} color={SCHOOL_COLOR[info.def.school]} />
        <div class="txt">
          <div class="nm">
            {info.def.name}
            {info.owned.lvl > 0 ? '+' : ''}
            <span class="muted" style={{ fontSize: 11, fontWeight: 500 }}>
              {RANGE_NAME[info.def.range]} · {TARGET_NAME[info.def.target]}
              {info.def.type ? ` · ${DMG_NAME[info.def.type]}` : ''}
              {cd > 0 ? ` · 대기 ${cd >= 99 ? '전투당 1회' : cd + '턴'}` : ''}
            </span>
          </div>
          <Segs segs={segs} />
          {why && <div style={{ color: 'var(--bad)', fontSize: 12 }}>{why}</div>}
        </div>
        {!why && info.def.target !== 'single' && (
          <button class="btn sm" disabled={s.busy} onClick={() => useSkill(s.sel!)}>
            사용
          </button>
        )}
      </div>
    );
  }
  const e = c.enemy(s.focus);
  if (e) {
    const it = e.intent;
    const move = it ? c.moveDef(e, it.move) : null;
    return (
      <div class="infobox panel" {...press(() => enemyTip(e))}>
        <Icon name={ENEMIES.get(e.def)?.icon ?? 'gi:help'} size={30} />
        <div class="txt">
          <div class="nm">{e.name}</div>
          {it ? (it.hidden && c.p.insight < 5 ? '의도를 알 수 없다' : `${it.label}${move?.desc ? ` — ${move.desc}` : ''}`) : ''}
          <div class="muted" style={{ fontSize: 11 }}>
            길게 눌러 자세히
          </div>
        </div>
      </div>
    );
  }
  return (
    <div class="infobox panel">
      <Icon name="gi:help" size={26} color="var(--ink-3)" />
      <div class="txt">스킬을 누르면 설명이 보이고, 한 번 더 누르거나 적을 눌러 사용한다. 길게 누르면 자세한 정보.</div>
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
