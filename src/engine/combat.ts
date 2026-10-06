import { Rng } from './rng';
import {
  ANOMALIES,
  CONSUMABLES,
  ENEMIES,
  EQUIPS,
  ESSENCES,
  FLOORS,
  MADNESS,
  PERKS,
  RELICS,
  RUNES,
  SKILLS,
  STATUSES,
  TRAITS,
  need,
} from './registry';
import type {
  BlockCtx,
  DamageCtx,
  DmgType,
  EncounterDef,
  EnemyDef,
  EnemyUnit,
  HookSelf,
  Hooks,
  Intent,
  IntentKind,
  MoveDef,
  OwnedSkill,
  SkillDef,
  SkillUse,
  Unit,
} from './types';
import type { RunState } from './run';

// ───────────── 상태 ─────────────

export interface CombatState {
  enc: string;
  kind: 'normal' | 'elite' | 'boss';
  turn: number;
  phase: 'player' | 'enemy' | 'victory' | 'defeat';
  enemies: EnemyUnit[];
  ap: number;
  /** 스킬 uid → 남은 쿨다운 */
  cd: Record<string, number>;
  /** 이번 턴 사용한 스킬 수 (연계) */
  used: number;
  usedTotal: number;
  ammo: number;
  maxAmmo: number;
  anomaly: string | null;
  uidN: number;
  vars: Record<string, number>;
  /** 이번 전투에서 얻은 추가 골드 */
  bonusGold: number;
}

// ───────────── 이벤트 (연출용) ─────────────

export interface Snap {
  p: { hp: number; maxHp: number; block: number; st: Record<string, number>; sanity: number; insight: number; ap: number; ammo: number };
  e: {
    uid: string;
    hp: number;
    maxHp: number;
    block: number;
    st: Record<string, number>;
    poise: number;
    maxPoise: number;
    broken: number;
    intent: Intent | null;
    dead: boolean;
    row: 0 | 1;
    known: DmgType[];
  }[];
  cd: Record<string, number>;
}

export type CombatEvent = (
  | { t: 'turn'; side: 'player' | 'enemy'; turn: number }
  | { t: 'skill'; skill: string; name: string; target?: string; school: string; dtype?: DmgType; echo?: boolean }
  | { t: 'move'; uid: string; name: string; kind: IntentKind }
  | {
      t: 'dmg';
      src?: string;
      tgt: string;
      amount: number;
      blocked: number;
      hpLoss: number;
      dtype: DmgType | 'true';
      weak: boolean;
      crit: boolean;
      attack: boolean;
      tags: string[];
    }
  | { t: 'block'; uid: string; amount: number }
  | { t: 'heal'; uid: string; amount: number }
  | { t: 'status'; uid: string; id: string; n: number }
  | { t: 'reveal'; uid: string; dtype: DmgType }
  | { t: 'break'; uid: string }
  | { t: 'recover'; uid: string }
  | { t: 'death'; uid: string }
  | { t: 'flee'; uid: string }
  | { t: 'spawn'; uid: string }
  | { t: 'row'; uid: string; row: 0 | 1 }
  | { t: 'sanity'; delta: number }
  | { t: 'insight'; delta: number }
  | { t: 'breakdown'; madness: string; fatal: boolean }
  | { t: 'text'; uid?: string; text: string; tone?: 'good' | 'bad' | 'info' | 'eldritch' }
  | { t: 'fx'; name: string; src?: string; tgt?: string }
  | { t: 'victory' }
  | { t: 'defeat'; reason: 'hp' | 'madness' }
) & { snap?: Snap };

type DamageOpts = {
  src: Unit | null;
  tgt: Unit;
  base: number;
  type: DmgType | 'true';
  attack?: boolean;
  melee?: boolean;
  skill?: SkillUse;
  move?: string;
  ignoreBlock?: boolean;
  poise?: number;
  tags?: string[];
};

const BUILTIN_MOVES: Record<string, MoveDef> = {
  _advance: {
    name: '전진',
    intent: 'advance',
    run(c, e) {
      c.moveRow(e, 0);
    },
  },
  _wait: { name: '관망', intent: 'unknown', run() {} },
  _broken: { name: '붕괴', intent: 'stunned', run() {} },
};

export const MAX_ROW = 3;

/** 층별 적 성장 배율 (밸런스 조절용) — 인덱스 = 층 */
export const ACT_HP_MULT = [1, 1, 1.25, 1.65, 2.2, 2.0];
export const ACT_DMG_MULT = [1, 1, 1.1, 1.3, 1.5, 1.4];
/** 층별 적 정신 공격 배율 */
export const ACT_SAN_MULT = [1, 1, 1, 0.75, 0.7, 0.8];

/** 붕괴(정신력 0) 뒤 정신력이 이 값으로 돌아온다 — 최대 정신력이 이보다 낮으면 최대 정신력까지만 */
export const BREAKDOWN_RESET = 60;
export const MAX_MADNESS = 4;

export function isEnemy(u: Unit | null | undefined): u is EnemyUnit {
  return !!u && u.uid !== 'p';
}

// ───────────── 전투 ─────────────

export class Combat {
  readonly run: RunState;
  readonly s: CombatState;
  readonly rng: Rng;
  events: CombatEvent[] = [];
  /** 시뮬레이터에서는 끈다 */
  snapshots = true;
  /**
   * 미리보기 계산 중 (화면을 그릴 때마다 불린다). 훅은 이때 수치만 바꾸고 상태(방어도·카운터·연출)는 건드리면 안 된다
   * — 예: 철의 성의가 의도 말풍선을 그릴 때마다 방어도를 깎던 문제
   */
  previewing = false;
  private hookDepth = 0;

  constructor(run: RunState) {
    if (!run.combat) throw new Error('진행 중인 전투가 없습니다');
    this.run = run;
    this.s = run.combat;
    this.rng = new Rng(run.rng, 'combat');
  }

  // ── 생성 ──

  static begin(run: RunState, enc: EncounterDef): Combat {
    run.combat = {
      enc: enc.id,
      kind: enc.kind,
      turn: 0,
      phase: 'player',
      enemies: [],
      ap: 0,
      cd: {},
      used: 0,
      usedTotal: 0,
      ammo: 6,
      maxAmmo: 6,
      anomaly: enc.anomaly ?? null,
      uidN: 0,
      vars: {},
      bonusGold: 0,
    };
    const c = new Combat(run);
    const p = run.player;
    p.block = 0;
    p.st = {};
    for (const slot of enc.enemies) c.spawn(slot.id, slot.row, true);
    c.fire(p, 'onCombatStart');
    for (const e of c.alive) c.fire(e, 'onCombatStart');

    // 처음 보는 존재에 대한 공포
    let dread = 0;
    for (const e of c.alive) {
      const def = ENEMIES.get(e.def)!;
      if (!run.seen.includes(def.id)) {
        run.seen.push(def.id);
        dread += def.dread ?? 0;
      }
    }
    if (dread > 0) {
      c.emit({ t: 'text', text: '형언할 수 없는 존재를 목격했다', tone: 'eldritch' });
      c.loseSanity(dread);
    }
    for (const e of c.alive) c.planIntent(e);
    c.startPlayerTurn();
    return c;
  }

  // ── 조회 ──

  get p() {
    return this.run.player;
  }
  get alive(): EnemyUnit[] {
    return this.s.enemies.filter((e) => !e.dead);
  }
  row(r: 0 | 1): EnemyUnit[] {
    return this.s.enemies.filter((e) => !e.dead && e.row === r);
  }
  get over(): boolean {
    return this.s.phase === 'victory' || this.s.phase === 'defeat';
  }
  enemy(uid: string | undefined | null): EnemyUnit | null {
    if (!uid) return null;
    return this.s.enemies.find((e) => e.uid === uid && !e.dead) ?? null;
  }
  unit(uid: string): Unit | null {
    return uid === 'p' ? this.p : this.enemy(uid);
  }
  defOf(e: EnemyUnit): EnemyDef {
    return need(ENEMIES, e.def, '적');
  }

  emit(ev: CombatEvent) {
    if (this.snapshots) ev.snap = this.snap();
    this.events.push(ev);
  }

  /** 소비한 이벤트를 꺼낸다 */
  drain(): CombatEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  snap(): Snap {
    const p = this.p;
    return {
      p: { hp: p.hp, maxHp: p.maxHp, block: p.block, st: { ...p.st }, sanity: p.sanity, insight: p.insight, ap: this.s.ap, ammo: this.s.ammo },
      e: this.s.enemies.map((e) => ({
        uid: e.uid,
        hp: e.hp,
        maxHp: e.maxHp,
        block: e.block,
        st: { ...e.st },
        poise: e.poise,
        maxPoise: e.maxPoise,
        broken: e.broken,
        intent: e.intent ? { ...e.intent } : null,
        dead: e.dead,
        row: e.row,
        known: [...e.known],
      })),
      cd: { ...this.s.cd },
    };
  }

  // ── 훅 ──

  /** owner가 가진 훅들. 'all'이면 전부 */
  *sources(owner: Unit | 'all'): Generator<[Hooks, HookSelf]> {
    const p = this.p;
    const run = this.run;
    if (owner === 'all' || owner === p) {
      for (const id of Object.keys(p.st)) {
        const d = STATUSES.get(id);
        if (d?.hooks && p.st[id]) yield [d.hooks, { kind: 'status', id, unit: p, n: p.st[id] }];
      }
      for (const r of run.relics) {
        const d = RELICS.get(r.id);
        if (d?.hooks) yield [d.hooks, { kind: 'relic', id: r.id, unit: p, n: r.n, ref: r }];
      }
      for (const slot of ['weapon', 'armor', 'trinket1', 'trinket2'] as const) {
        const it = run.equip[slot];
        if (!it) continue;
        const d = EQUIPS.get(it.id);
        if (d?.hooks) yield [d.hooks, { kind: 'equip', id: it.id, unit: p, n: it.lvl }];
      }
      for (const id of run.perks) {
        const d = PERKS.get(id);
        if (d?.hooks) yield [d.hooks, { kind: 'perk', id, unit: p, n: 1 }];
      }
      for (const id of run.madness) {
        const d = MADNESS.get(id);
        if (d?.hooks) yield [d.hooks, { kind: 'madness', id, unit: p, n: 1 }];
      }
      for (const es of run.essences) {
        const d = ESSENCES.get(es.id);
        if (d?.passive.hooks) yield [d.passive.hooks, { kind: 'essence', id: es.id, unit: p, n: es.guardian ? 2 : 1 }];
      }
    }
    for (const e of this.s.enemies) {
      if (e.dead) continue;
      if (owner !== 'all' && owner !== e) continue;
      for (const id of Object.keys(e.st)) {
        const d = STATUSES.get(id);
        if (d?.hooks && e.st[id]) yield [d.hooks, { kind: 'status', id, unit: e, n: e.st[id] }];
      }
      for (const id of ENEMIES.get(e.def)?.traits ?? []) {
        const d = TRAITS.get(id);
        if (d) yield [d.hooks, { kind: 'trait', id, unit: e, n: 1 }];
      }
    }
    if (this.s.anomaly) {
      const d = ANOMALIES.get(this.s.anomaly);
      if (d) yield [d.hooks, { kind: 'anomaly', id: d.id, unit: owner === 'all' ? p : owner, n: 1 }];
    }
    const law = FLOORS.get(run.act)?.hooks;
    if (law && run.floor) yield [law, { kind: 'anomaly', id: `law${run.act}`, unit: owner === 'all' ? p : owner, n: run.floor.tide }];
  }

  fire<K extends keyof Hooks>(owner: Unit | 'all', key: K, ...args: unknown[]) {
    if (this.hookDepth > 12) return;
    this.hookDepth++;
    try {
      for (const [h, self] of this.sources(owner)) {
        const fn = h[key] as ((...a: unknown[]) => unknown) | undefined;
        if (fn) fn.call(h, this, self, ...args);
      }
    } finally {
      this.hookDepth--;
    }
  }

  private runeHooks(u: SkillUse | undefined): [Hooks, HookSelf][] {
    if (!u) return [];
    const out: [Hooks, HookSelf][] = [];
    for (const id of u.owned.runes) {
      const r = RUNES.get(id);
      if (r?.hooks) out.push([r.hooks, { kind: 'rune', id, unit: this.p, n: 1 }]);
    }
    return out;
  }

  // ── 피해 ──

  private makeDamage(o: DamageOpts): DamageCtx {
    return {
      src: o.src,
      tgt: o.tgt,
      type: o.type,
      base: o.base,
      add: 0,
      mult: 1,
      attack: o.attack ?? false,
      melee: o.melee ?? false,
      skill: o.skill,
      move: o.move,
      ignoreBlock: o.ignoreBlock,
      poiseBonus: o.poise ?? 0,
      tags: o.tags ?? [],
      amount: 0,
      blocked: 0,
      hpLoss: 0,
      killed: false,
      broke: false,
      weakHit: false,
      crit: false,
    };
  }

  private computeDamage(d: DamageCtx, tgtKnown = true) {
    if (d.type !== 'true') {
      if (d.src) {
        if (d.src === this.p && d.attack) d.add += this.p.str;
        // 심연의 조수: 적 공격 강화
        if (isEnemy(d.src) && d.attack) {
          const tide = this.run.floor?.tide ?? 0;
          if (tide > 0) d.mult *= 1 + 0.05 * tide;
          d.mult *= ACT_DMG_MULT[Math.min(5, this.defOf(d.src).act)] ?? 1;
          if (this.run.asc >= 1) d.mult *= 1.1;
        }
        this.fire(d.src, 'modDamageOut', d);
        for (const [h, self] of this.runeHooks(d.skill)) h.modDamageOut?.(this, self, d);
      }
      if (tgtKnown) {
        this.fire(d.tgt, 'modDamageIn', d);
        if (isEnemy(d.tgt)) {
          if (d.tgt.broken > 0) d.mult *= 1.5;
          const r = d.tgt.resist[d.type];
          if (r !== undefined) d.mult *= r;
        }
      }
    }
    d.amount = Math.max(0, Math.floor((d.base + d.add) * d.mult));
    if (d.cap !== undefined) d.amount = Math.min(d.amount, d.cap);
  }

  /** 미리보기: 상태를 바꾸지 않고 최종 피해 계산 */
  preview(src: Unit | null, tgt: Unit | null, base: number, type: DmgType | 'true', opts: { attack?: boolean; skill?: SkillUse } = {}): number {
    const d = this.makeDamage({ src, tgt: tgt ?? this.p, base, type, attack: opts.attack ?? true, skill: opts.skill });
    const saved = this.hookDepth;
    this.previewing = true;
    try {
      this.computeDamage(d, !!tgt);
    } finally {
      this.previewing = false;
      this.hookDepth = saved;
    }
    return d.amount;
  }

  damage(o: DamageOpts): DamageCtx {
    const d = this.makeDamage(o);
    const t = o.tgt;
    // 사경(체력 0)인 나는 여전히 맞는다 — 받는 피해만큼 정신력이 깎인다
    const dyingTarget = t === this.p && this.dying;
    if ((t.hp <= 0 && !dyingTarget) || (isEnemy(t) && t.dead) || this.over) return d;
    this.computeDamage(d);
    let amt = d.amount;

    // 약점 / 버팀
    if (isEnemy(t) && d.type !== 'true') {
      const counts = d.attack || d.tags.includes('poise');
      if (t.weak.includes(d.type) && counts) {
        d.weakHit = true;
        if (!t.known.includes(d.type)) {
          t.known.push(d.type);
          this.emit({ t: 'reveal', uid: t.uid, dtype: d.type });
        }
      }
      if (counts && t.broken === 0 && t.maxPoise > 0) {
        const dec = (d.weakHit ? 1 : 0) + d.poiseBonus;
        if (dec > 0) {
          t.poise = Math.max(0, t.poise - dec);
          if (t.poise === 0) d.broke = true;
        }
      }
    }

    // 방어도 → 보호막
    if (!d.ignoreBlock && amt > 0 && t.block > 0) {
      const b = Math.min(t.block, amt);
      t.block -= b;
      amt -= b;
      d.blocked += b;
    }
    if (!d.ignoreBlock && amt > 0 && (t.st.barrier ?? 0) > 0) {
      const b = Math.min(t.st.barrier, amt);
      t.st.barrier -= b;
      if (t.st.barrier <= 0) delete t.st.barrier;
      amt -= b;
      d.blocked += b;
    }
    const dying = t === this.p && this.dying;
    // 사경(체력 0) 중에는 체력이 더 줄지 않는다 — 대신 정신력이 깎인다 (아래). '체력을 잃으면' 효과가 헛돌지 않게 체력 손실은 0
    d.hpLoss = dying ? 0 : amt;
    if (!dying) t.hp -= amt;
    if (t === this.p && amt > 0) this.run.stats.dmgTaken += amt;
    if (d.src === this.p && amt > 0) this.run.stats.dmgDealt += amt;

    this.emit({
      t: 'dmg',
      src: d.src?.uid,
      tgt: t.uid,
      amount: d.amount,
      blocked: d.blocked,
      hpLoss: d.hpLoss,
      dtype: d.type,
      weak: d.weakHit,
      crit: d.crit,
      attack: d.attack,
      tags: d.tags,
    });

    if (d.broke && isEnemy(t) && t.hp > 0) this.breakEnemy(t);

    if (d.src) this.fire(d.src, 'onDamageDealt', d);
    for (const [h, self] of this.runeHooks(d.skill)) h.onDamageDealt?.(this, self, d);
    this.fire(t, 'onDamageTaken', d);

    if (dying) {
      // 사경 중 받은 피해는 그 절반(올림)만큼 정신력을 깎는다
      if (amt > 0) this.drainMind(Math.ceil(amt / 2));
    } else if (t.hp <= 0) this.handleDeath(t, d);
    return d;
  }

  /** 사경: 체력 0에서 정신력으로 버티는 상태 */
  get dying(): boolean {
    return (this.p.st.dying ?? 0) > 0;
  }

  /** 체력 0이지만 사경으로 버티며 싸우는 나 (상태이상·턴 효과는 계속 돌아간다) */
  private isDyingPlayer(u: Unit): boolean {
    return u === this.p && this.dying;
  }

  private enterDying() {
    this.p.hp = 0;
    this.p.st.dying = 1;
    this.emit({ t: 'status', uid: 'p', id: 'dying', n: 1 });
    this.emit({ t: 'text', uid: 'p', text: '사경 — 정신력으로 버틴다', tone: 'bad' });
    this.run.stats.dyingCount++;
  }

  /** 사경 중 정신력 소모. 0이 되면 사망 */
  private drainMind(n: number) {
    if (this.over) return;
    this.p.sanity = Math.max(0, this.p.sanity - n);
    this.emit({ t: 'sanity', delta: -n });
    if (this.p.sanity <= 0) this.defeat('hp');
  }

  /** 방어 무시 체력 손실 (자해·대가) */
  loseHp(u: Unit, n: number, tag = 'cost') {
    return this.damage({ src: null, tgt: u, base: n, type: 'true', ignoreBlock: true, tags: [tag] });
  }

  private handleDeath(t: Unit, d: DamageCtx | null, byPlayer = true) {
    if (t === this.p) {
      if (this.p.hp > 0 || this.dying) return;
      if (d) {
        for (const [h, self] of this.sources(this.p)) {
          if (h.onLethal?.(this, self, d)) {
            if (this.p.hp > 0) return;
          }
        }
      }
      if (this.p.sanity <= 0) {
        this.p.hp = 0;
        this.defeat('hp');
      } else this.enterDying();
      return;
    }
    if (!isEnemy(t) || t.dead) return;
    t.hp = 0;
    t.dead = true;
    t.block = 0;
    if (d) d.killed = true;
    this.emit({ t: 'death', uid: t.uid });
    // 자기 사망 특성 (부활 등)
    for (const id of ENEMIES.get(t.def)?.traits ?? []) {
      TRAITS.get(id)?.hooks.onDeath?.(this, { kind: 'trait', id, unit: t, n: 1 }, d);
    }
    // 전장 규칙의 부활(망자의 귀환)도 처치 보상보다 먼저 — 다시 일어서면 아직 처치가 아니다 (처치 효과가 두 번 터지지 않게)
    const an = this.s.anomaly ? ANOMALIES.get(this.s.anomaly) : undefined;
    if (t.dead && an?.hooks.onDeath) an.hooks.onDeath(this, { kind: 'anomaly', id: an.id, unit: t, n: 1 }, d);
    if (!t.dead) {
      if (d) d.killed = false;
      return;
    }
    if (!t.minion) this.run.stats.kills++;
    if (d ? d.src === this.p || d.src === null : byPlayer) {
      this.fire(this.p, 'onKill', t, d);
      // 쓰러뜨린 스킬에 새긴 각인의 처치 효과 (사냥 각인) — 다시 일어선 적은 처치가 아니므로 여기서만 준다
      for (const [h, self] of this.runeHooks(d?.skill)) h.onKill?.(this, self, t, d);
    }
    this.fire('all', 'onAnyDeath', t);
  }

  /** 즉사. byPlayer=false면 내 처치로 치지 않는다 (처치 보상·유물·정수 효과 없음) */
  kill(e: EnemyUnit, byPlayer = true) {
    if (e.dead) return;
    e.hp = 0;
    this.handleDeath(e, null, byPlayer);
  }

  flee(e: EnemyUnit) {
    if (e.dead) return;
    e.dead = true;
    e.fled = true;
    this.emit({ t: 'flee', uid: e.uid });
  }

  breakEnemy(e: EnemyUnit) {
    e.broken = 2;
    e.poise = 0;
    e.intent = { move: '_broken', kind: 'stunned', label: '붕괴' };
    delete e.mem.charge;
    this.emit({ t: 'break', uid: e.uid });
    this.fire(this.p, 'onBreak', e);
    this.run.stats.breaks++;
  }

  /** 방어도 미리보기 (상태를 바꾸지 않음) */
  previewBlock(amount: number, fromSkill?: SkillUse): number {
    const b: BlockCtx = { unit: this.p, amount, fromSkill };
    if (fromSkill) b.amount += this.p.dex;
    this.previewing = true;
    try {
      this.fire(this.p, 'modBlock', b);
    } finally {
      this.previewing = false;
    }
    return Math.max(0, Math.floor(b.amount));
  }

  // ── 방어 / 회복 / 상태 ──

  gainBlock(u: Unit, amount: number, fromSkill?: SkillUse) {
    if (this.over) return 0;
    const b: BlockCtx = { unit: u, amount, fromSkill };
    if (u === this.p && fromSkill) b.amount += this.p.dex;
    this.fire(u, 'modBlock', b);
    const n = Math.max(0, Math.floor(b.amount));
    if (n <= 0) return 0;
    u.block += n;
    this.emit({ t: 'block', uid: u.uid, amount: n });
    return n;
  }

  heal(u: Unit, amount: number) {
    const revive = u === this.p && this.dying;
    if (u.hp <= 0 && !revive) return 0;
    let n = amount;
    if (u === this.p) for (const [h, self] of this.sources(this.p)) if (h.modHeal) n = h.modHeal(this, self, n);
    n = Math.floor(n);
    // 회복 반전 (층의 법칙/균열 규칙)
    if (n < 0) {
      this.damage({ src: null, tgt: u, base: -n, type: 'true', ignoreBlock: true, tags: ['inverted'] });
      return 0;
    }
    n = Math.max(0, Math.min(n, u.maxHp - u.hp));
    if (n <= 0) return 0;
    u.hp += n;
    this.emit({ t: 'heal', uid: u.uid, amount: n });
    if (revive) {
      delete this.p.st.dying;
      this.emit({ t: 'status', uid: 'p', id: 'dying', n: -1 });
      this.emit({ t: 'text', uid: 'p', text: '사경에서 벗어났다', tone: 'good' });
    }
    return n;
  }

  /** 상태 부여. 음수면 감소. 실제 적용된 변화량 반환 */
  apply(target: Unit, id: string, n: number, src: Unit | null = null): number {
    // 사경(체력 0)인 나는 아직 싸우는 중이다: 버프·해제·턴 효과가 그대로 걸린다
    if (this.over || (target.hp <= 0 && !this.isDyingPlayer(target)) || n === 0) return 0;
    const def = need(STATUSES, id, '상태');
    let amount = n;
    if (n > 0) {
      // 수호자는 기절이 겹치지 않고, 붕괴 중이거나 기절·붕괴로 행동을 건너뛴 뒤 한 번 행동하기 전에는 기절하지 않는다 (기절 기술 여럿으로 영원히 묶는 것 방지)
      // (적끼리의 연출 — 대종이 깨져 종지기가 비틀거리는 것 등 — 은 그대로)
      if (id === 'stun' && !isEnemy(src) && isEnemy(target) && this.defOf(target).tier === 'boss' && (target.mem.stunGuard || target.broken > 0 || (target.st.stun ?? 0) > 0)) {
        this.emit({ t: 'text', uid: target.uid, text: '기절하지 않는다', tone: 'info' });
        return 0;
      }
      // 부여자 측 보정 (예: 출혈 부여 +1)
      if (src) for (const [h, self] of this.sources(src)) if (h.modApply) amount = h.modApply(this, self, target, id, amount);
      // 결계: 해로운 효과 1회 무효
      if (def.kind === 'debuff' && (target.st.ward ?? 0) > 0 && amount > 0) {
        target.st.ward -= 1;
        if (target.st.ward <= 0) delete target.st.ward;
        this.emit({ t: 'text', uid: target.uid, text: '결계가 막아냈다', tone: 'info' });
        return 0;
      }
    }
    if (amount === 0) return 0;
    const before = target.st[id] ?? 0;
    let after = before + amount;
    if (!def.signed && after < 0) after = 0;
    if (after === 0) delete target.st[id];
    else target.st[id] = after;
    const delta = after - before;
    // 적의 차례에 걸린 지속형 효과는 첫 감소를 한 번 건너뛴다 (적이 건 약화/취약이 다음 적 차례까지 유지)
    if (delta > 0 && def.decay && this.s.phase === 'enemy' && (target === this.p || (isEnemy(target) && src === target))) {
      target.st[`_fresh_${id}`] = 1;
    }
    if (delta !== 0) {
      this.emit({ t: 'status', uid: target.uid, id, n: delta });
      if (delta > 0) this.fire(src ?? 'all', 'onApplied', target, id, delta);
    }
    return delta;
  }

  /** 상태 수치 */
  st(u: Unit, id: string): number {
    return u.st[id] ?? 0;
  }

  clear(u: Unit, id: string) {
    if (u.st[id]) this.apply(u, id, -u.st[id]);
  }

  // ── 정신력 / 통찰 ──

  /** 적이 깎을 정신력의 실제 값 미리보기 (통찰·의지·층 배율·공포·유물/광기 효과 반영) */
  previewSanityLoss(amount: number): number {
    if (amount <= 0) return 0;
    let n = amount * (1 + 0.05 * Math.min(6, this.p.insight)) * Math.max(0.5, 1 - 0.05 * this.p.will);
    n *= ACT_SAN_MULT[Math.min(5, this.run.act)] ?? 1;
    if ((this.p.st.dread ?? 0) > 0) n *= 1.5;
    this.previewing = true;
    try {
      for (const [h, self] of this.sources(this.p)) if (h.modSanityLoss) n = h.modSanityLoss(this, self, n);
    } finally {
      this.previewing = false;
    }
    return Math.max(0, Math.floor(n));
  }

  loseSanity(amount: number, fromEnemy = false) {
    if (amount <= 0 || this.over) return 0;
    let n = amount * (1 + 0.05 * Math.min(6, this.p.insight)) * Math.max(0.5, 1 - 0.05 * this.p.will);
    if (fromEnemy) {
      n *= ACT_SAN_MULT[Math.min(5, this.run.act)] ?? 1;
      if ((this.p.st.dread ?? 0) > 0) n *= 1.5;
    }
    for (const [h, self] of this.sources(this.p)) if (h.modSanityLoss) n = h.modSanityLoss(this, self, n);
    n = Math.max(0, Math.floor(n));
    if (n <= 0) return 0;
    this.run.stats.sanityLost += n;
    if (this.dying) {
      this.drainMind(n);
      return n;
    }
    this.p.sanity -= n;
    this.emit({ t: 'sanity', delta: -n });
    if (this.p.sanity <= 0) this.breakdown();
    return n;
  }

  gainSanity(amount: number) {
    const n = Math.max(0, Math.min(Math.floor(amount), this.p.maxSanity - this.p.sanity));
    if (n <= 0) return 0;
    this.p.sanity += n;
    this.emit({ t: 'sanity', delta: n });
    return n;
  }

  gainInsight(n: number) {
    if (n <= 0) return;
    this.p.insight += n;
    this.emit({ t: 'insight', delta: n });
    if (this.p.insight >= 2) for (const e of this.alive) e.known = [...e.weak];
  }

  private breakdown() {
    const res = rollMadness(this.run, this.rng);
    this.emit({ t: 'breakdown', madness: res.id ?? '', fatal: res.fatal });
    if (res.fatal) {
      this.p.sanity = 0;
      this.defeat('madness');
      return;
    }
    // 이계 정수·금기로 최대 정신력이 60 아래로 깎였으면 최대치까지만 (최대를 넘겨 채우지 않는다)
    this.p.sanity = Math.min(BREAKDOWN_RESET, this.p.maxSanity);
    this.fire(this.p, 'onBreakdown');
  }

  // ── 배치 ──

  moveRow(e: EnemyUnit, row: 0 | 1): boolean {
    if (e.dead || e.row === row) return false;
    if (this.row(row).length >= MAX_ROW) return false;
    e.row = row;
    this.emit({ t: 'row', uid: e.uid, row });
    return true;
  }

  /** 전열이 비면 후열 전진 */
  private fixRows() {
    if (this.row(0).length === 0) for (const e of this.row(1)) this.moveRow(e, 0);
  }

  spawn(defId: string, row?: 0 | 1, initial = false): EnemyUnit | null {
    const def = need(ENEMIES, defId, '적');
    let r: 0 | 1 = row ?? def.row ?? 0;
    if (this.row(r).length >= MAX_ROW) r = r === 0 ? 1 : 0;
    if (this.row(r).length >= MAX_ROW) return null;
    const asc = this.run.asc;
    const tide = this.run.floor?.tide ?? 0;
    const hpMul = (1 + (asc >= 7 ? 0.1 : 0) + (asc >= 15 && def.tier !== 'normal' ? 0.1 : 0)) * (1 + 0.08 * tide) * (ACT_HP_MULT[Math.min(5, def.act)] ?? 1);
    const hp = Math.round(this.rng.int(def.hp[0], def.hp[1]) * hpMul);
    const e: EnemyUnit = {
      uid: `e${++this.s.uidN}`,
      def: def.id,
      name: def.name,
      hp,
      maxHp: hp,
      block: 0,
      st: {},
      row: r,
      poise: def.poise,
      maxPoise: def.poise,
      broken: 0,
      weak: [...def.weak],
      known: this.p.insight >= 2 ? [...def.weak] : def.weak.filter((w) => this.run.knownWeak?.[def.id]?.includes(w)),
      resist: { ...(def.resist ?? {}) },
      intent: null,
      mem: {},
      hist: [],
      dead: false,
      minion: def.tier === 'minion',
      scale: def.visual.scale ?? 1,
    };
    this.s.enemies.push(e);
    def.onSpawn?.(this, e);
    if (!initial) {
      this.emit({ t: 'spawn', uid: e.uid });
      if (this.s.phase === 'player') this.planIntent(e);
    }
    return e;
  }

  // ── 플레이어 스킬 ──

  /** 'weapon' | 'armor' | 장착 스킬 uid */
  skillInfo(ref: string): { def: SkillDef; owned: OwnedSkill; basic?: 'weapon' | 'armor' } | null {
    const run = this.run;
    if (ref === 'weapon' || ref === 'armor') {
      const it = run.equip[ref];
      const fallback = ref === 'weapon' ? 'punch' : 'brace';
      const skillId = (it && EQUIPS.get(it.id)?.skill) || fallback;
      const def = SKILLS.get(skillId);
      if (!def) return null;
      return { def, owned: { uid: ref, id: skillId, lvl: it?.lvl ?? 0, runes: [] }, basic: ref };
    }
    if (!run.slots.includes(ref)) return null;
    const owned = run.skills.find((s) => s.uid === ref);
    if (!owned) return null;
    const def = SKILLS.get(owned.id);
    return def ? { def, owned } : null;
  }

  makeUse(info: { def: SkillDef; owned: OwnedSkill; basic?: 'weapon' | 'armor' }, power = 1): SkillUse {
    const { def, owned } = info;
    let mult = power;
    for (const id of owned.runes) mult *= RUNES.get(id)?.powerMult ?? 1;
    const lvl = owned.lvl;
    const u: SkillUse = {
      def,
      owned,
      lvl,
      power: mult,
      basic: info.basic,
      primary: null,
      v(key: string) {
        const raw = def.vals[key];
        if (raw === undefined) return 0;
        let val = Array.isArray(raw) ? raw[Math.min(lvl, raw.length - 1)] : raw;
        if (/^(dmg|blk|heal)/.test(key)) val = Math.floor(val * u.power);
        return val;
      },
    };
    return u;
  }

  costOf(info: { def: SkillDef; owned: OwnedSkill }): number {
    const { def, owned } = info;
    let cost = lvlVal(def.cost, owned.lvl);
    for (const id of owned.runes) cost += RUNES.get(id)?.costMod ?? 0;
    for (const [h, self] of this.sources(this.p)) if (h.modCost) cost = h.modCost(this, self, def, cost);
    return Math.max(0, cost);
  }

  cdOf(info: { def: SkillDef; owned: OwnedSkill }): number {
    const base = lvlVal(info.def.cd, info.owned.lvl);
    let cd = base;
    for (const id of info.owned.runes) cd += RUNES.get(id)?.cdMod ?? 0;
    for (const [h, self] of this.sources(this.p)) if (h.modCd) cd = h.modCd(this, self, info.def, cd);
    // 원래 재사용 대기가 있는 스킬은 각인·유물로도 1턴 아래로 줄지 않는다 (같은 턴에 무한히 쓰는 고리 방지)
    return Math.max(base > 0 ? 1 : 0, cd);
  }

  /** 단일 대상 스킬이 고를 수 있는 적 */
  validTargets(def: SkillDef): EnemyUnit[] {
    let list = this.alive;
    if (def.range === 'melee') {
      const front = this.row(0);
      if (front.length) list = front;
    }
    const taunts = list.filter((e) => (e.st.taunt ?? 0) > 0);
    return taunts.length ? taunts : list;
  }

  /** 사용 불가 사유 */
  blockReason(ref: string): string | null {
    if (this.s.phase !== 'player') return '내 턴이 아닙니다';
    const info = this.skillInfo(ref);
    if (!info) return '사용할 수 없는 스킬';
    if ((this.s.cd[info.owned.uid] ?? 0) > 0) return `재사용 대기 ${this.s.cd[info.owned.uid]}턴`;
    if (this.costOf(info) > this.s.ap) return '행동력 부족';
    if ((this.p.st.silence ?? 0) > 0 && !info.basic) return '침묵 상태';
    const u = this.makeUse(info);
    return info.def.canUse?.(this, u) ?? null;
  }

  useSkill(ref: string, targetUid?: string | null): string | null {
    const why = this.blockReason(ref);
    if (why) return why;
    const info = this.skillInfo(ref)!;
    const def = info.def;
    let target: EnemyUnit | null = null;
    if (def.target === 'single') {
      const valid = this.validTargets(def);
      target = valid.find((e) => e.uid === targetUid) ?? null;
      if (!target) {
        if (valid.length === 1 || !targetUid) target = valid[0] ?? null;
        else return '대상을 선택하세요';
      }
      if (!target) return '대상이 없습니다';
    }
    this.s.ap -= this.costOf(info);
    const cd = this.cdOf(info);
    if (cd > 0) this.s.cd[info.owned.uid] = cd;

    this.runSkill(info, target, 1, false);
    const hasEcho = info.owned.runes.includes('echo');
    // 메아리: 탄약을 쓰는 스킬은 탄약이 남아 있을 때만 (빈 총으로 공짜 사격·재장전 방지)
    const echoAmmoOk = !(def.tags ?? []).includes('ammo') || this.s.ammo > 0;
    if (hasEcho && echoAmmoOk && !this.over) {
      const t2 = target && !target.dead ? target : def.target === 'single' ? (this.validTargets(def)[0] ?? null) : null;
      if (def.target !== 'single' || t2) this.runSkill(info, t2, 0.5, true);
    }
    this.s.used++;
    this.s.usedTotal++;
    this.run.stats.skillsUsed++;
    this.fixRows();
    this.checkEnd();
    return null;
  }

  private runSkill(info: { def: SkillDef; owned: OwnedSkill; basic?: 'weapon' | 'armor' }, target: EnemyUnit | null, power: number, echo: boolean) {
    const u = this.makeUse(info, power);
    u.echo = echo;
    u.primary = target;
    this.fire(this.p, 'beforeSkill', u);
    for (const [h, self] of this.runeHooks(u)) h.beforeSkill?.(this, self, u);
    this.emit({ t: 'skill', skill: info.def.id, name: info.def.name, target: target?.uid, school: info.def.school, dtype: info.def.type, echo });
    info.def.run(this, u, target);
    if (this.over) return;
    this.fire(this.p, 'afterSkill', u);
    for (const [h, self] of this.runeHooks(u)) h.afterSkill?.(this, self, u);
  }

  /** 스킬의 대상 모드에 따라 공격. hits는 대상마다 */
  strike(
    u: SkillUse,
    target: EnemyUnit | null,
    o: { dmg: number; hits?: number; type?: DmgType; poise?: number; tags?: string[]; ignoreBlock?: boolean; mode?: SkillDef['target'] } ,
  ): DamageCtx[] {
    const out: DamageCtx[] = [];
    const hits = o.hits ?? 1;
    const type = o.type ?? u.type ?? u.def.type ?? 'blunt';
    const mode = o.mode ?? u.def.target;
    const melee = u.def.range === 'melee';
    const hitOne = (t: EnemyUnit) => {
      if (t.dead || this.over) return;
      out.push(
        this.damage({ src: this.p, tgt: t, base: o.dmg, type, attack: true, melee, skill: u, poise: o.poise, tags: o.tags, ignoreBlock: o.ignoreBlock }),
      );
    };
    if (mode === 'random') {
      for (let i = 0; i < hits; i++) {
        // 근접 스킬의 무작위 타격도 근접 규칙을 따른다 (전열에 적이 있으면 전열만)
        const pool = melee ? this.validTargets(u.def) : this.alive;
        if (!pool.length) break;
        hitOne(this.rng.pick(pool));
      }
      return out;
    }
    let targets: EnemyUnit[];
    if (mode === 'single') targets = target ? [target] : [];
    else if (mode === 'front') targets = this.row(0).length ? this.row(0) : this.row(1);
    else if (mode === 'back') targets = this.row(1).length ? this.row(1) : this.row(0);
    else if (mode === 'all') targets = this.alive;
    else targets = [];
    for (let i = 0; i < hits; i++) for (const t of targets) hitOne(t);
    return out;
  }

  // ── 소모품 ──

  useConsumable(idx: number, targetUid?: string | null): string | null {
    if (this.s.phase !== 'player') return '내 턴이 아닙니다';
    const id = this.run.consumables[idx];
    if (!id) return '빈 칸';
    const def = need(CONSUMABLES, id, '소모품');
    let target: Unit | null = null;
    if (def.target === 'single') {
      target = this.enemy(targetUid) ?? this.alive[0] ?? null;
      if (!target) return '대상이 없습니다';
    }
    this.run.consumables[idx] = null;
    this.emit({ t: 'text', text: def.name, tone: 'info' });
    def.use(this.run, this, target);
    this.fixRows();
    this.checkEnd();
    return null;
  }

  // ── 턴 진행 ──

  private tickStatuses(u: Unit, when: 'start' | 'end') {
    for (const id of Object.keys(u.st)) {
      if (this.over || (u.hp <= 0 && !this.isDyingPlayer(u))) return;
      const def = STATUSES.get(id);
      const n = u.st[id];
      if (!def || !n) continue;
      if (when === 'start') def.tickStart?.(this, u, n);
      else def.tickEnd?.(this, u, n);
    }
  }

  private decay(u: Unit) {
    for (const id of Object.keys(u.st)) {
      const def = STATUSES.get(id);
      if (u.st[`_fresh_${id}`]) {
        delete u.st[`_fresh_${id}`];
        continue;
      }
      if (def?.decay && u.st[id] > 0) {
        u.st[id] -= 1;
        if (u.st[id] <= 0) delete u.st[id];
      }
    }
  }

  startPlayerTurn() {
    const s = this.s;
    s.turn++;
    s.phase = 'player';
    s.used = 0;
    const p = this.p;
    if ((p.st.retain ?? 0) > 0) {
      p.st.retain -= 1;
      if (p.st.retain <= 0) delete p.st.retain;
    } else p.block = 0;
    s.ap = p.maxAp + (p.st.energized ?? 0);
    delete p.st.energized;
    for (const k of Object.keys(s.cd)) {
      s.cd[k] = Math.max(0, s.cd[k] - 1);
      if (s.cd[k] === 0) delete s.cd[k];
    }
    this.emit({ t: 'turn', side: 'player', turn: s.turn });
    if (this.dying) {
      this.emit({ t: 'text', uid: 'p', text: '의식이 희미해진다', tone: 'bad' });
      this.drainMind(8);
      if (this.over) return;
    }
    this.tickStatuses(p, 'start');
    if (this.over) return;
    this.fire(p, 'onTurnStart');
    this.fixRows();
    this.checkEnd();
  }

  endTurn(): string | null {
    if (this.s.phase !== 'player') return '내 턴이 아닙니다';
    const p = this.p;
    this.fire(p, 'onTurnEnd');
    if (this.checkEnd()) return null;
    this.tickStatuses(p, 'end');
    if (this.checkEnd()) return null;

    this.s.phase = 'enemy';
    this.emit({ t: 'turn', side: 'enemy', turn: this.s.turn });
    const order = [...this.row(0), ...this.row(1)];
    for (const e of order) {
      if (e.dead) continue;
      if ((e.st.retain ?? 0) > 0) {
        e.st.retain -= 1;
        if (e.st.retain <= 0) delete e.st.retain;
      } else e.block = 0;
      this.tickStatuses(e, 'start');
      this.fire(e, 'onUnitTurnStart');
      if (this.checkEnd()) return null;
      if (e.dead) continue;
      // 수호자는 행동을 건너뛰면(붕괴·기절) 한 번 행동하기 전까지 기절하지 않는다 (붕괴와 기절을 번갈아 영원히 묶는 것 방지)
      const boss = this.defOf(e).tier === 'boss';
      if (e.broken === 2) {
        e.broken = 1;
        if (boss) {
          e.mem.stunGuard = 1;
          // 붕괴로 건너뛴 차례가 걸려 있던 기절도 함께 쓴다 (붕괴 직전에 건 기절로 한 번 더 묶지 못하게)
          if ((e.st.stun ?? 0) > 0) this.apply(e, 'stun', -1);
        }
      } else {
        if (e.broken === 1) {
          e.broken = 0;
          e.poise = e.maxPoise;
          this.emit({ t: 'recover', uid: e.uid });
        }
        if ((e.st.stun ?? 0) > 0) {
          this.apply(e, 'stun', -1);
          this.emit({ t: 'text', uid: e.uid, text: '기절', tone: 'info' });
          if (boss) e.mem.stunGuard = 1;
        } else {
          delete e.mem.stunGuard;
          this.act(e);
        }
      }
      if (this.checkEnd()) return null;
      if (!e.dead) {
        this.tickStatuses(e, 'end');
        this.fire(e, 'onUnitTurnEnd');
        this.decay(e);
      }
      this.fixRows();
      if (this.checkEnd()) return null;
    }
    // 라운드 종료: 플레이어의 지속형 효과 감소
    this.decay(p);
    for (const e of this.alive) if (e.broken !== 2) this.planIntent(e);
    this.startPlayerTurn();
    return null;
  }

  moveDef(e: EnemyUnit, id: string): MoveDef {
    return BUILTIN_MOVES[id] ?? this.defOf(e).moves[id] ?? BUILTIN_MOVES._wait;
  }

  private act(e: EnemyUnit) {
    let id = e.intent?.move ?? '_wait';
    let m = this.moveDef(e, id);
    if (m.melee && e.row !== 0) {
      id = this.row(0).length < MAX_ROW ? '_advance' : '_wait';
      m = BUILTIN_MOVES[id];
    }
    this.emit({ t: 'move', uid: e.uid, name: m.name, kind: m.intent });
    m.run(this, e);
    e.hist.push(id);
    if (e.hist.length > 4) e.hist.shift();
  }

  planIntent(e: EnemyUnit) {
    if (e.dead) return;
    let id = this.defOf(e).ai(this, e);
    let m = this.moveDef(e, id);
    if (m.melee && e.row !== 0) {
      id = this.row(0).length < MAX_ROW ? '_advance' : '_wait';
      m = BUILTIN_MOVES[id];
    }
    const dmg = typeof m.dmg === 'function' ? m.dmg(this, e) : m.dmg;
    const hits = typeof m.hits === 'function' ? m.hits(this, e) : m.hits;
    e.intent = {
      move: id,
      kind: m.intent,
      extra: m.extra,
      dmg,
      hits,
      sanity: m.sanity,
      label: m.name,
      hidden: m.hidden,
      charging: m.charging,
    };
  }

  /** 적의 의도대로 공격 (의도에 표시된 피해·횟수 사용) */
  enemyAttack(e: EnemyUnit, o: { dmg?: number; hits?: number; type?: DmgType; melee?: boolean; tags?: string[] } = {}): DamageCtx[] {
    const out: DamageCtx[] = [];
    const dmg = o.dmg ?? e.intent?.dmg ?? 0;
    const hits = o.hits ?? e.intent?.hits ?? 1;
    const melee = o.melee ?? this.moveDef(e, e.intent?.move ?? '_wait').melee ?? false;
    for (let i = 0; i < hits; i++) {
      if (this.over || e.dead) break;
      // 광란: 절반 확률로 다른 적을 공격
      let tgt: Unit = this.p;
      if ((e.st.madden ?? 0) > 0) {
        const others = this.alive.filter((x) => x !== e);
        if (others.length && this.rng.chance(0.5)) {
          tgt = this.rng.pick(others);
          this.emit({ t: 'text', uid: e.uid, text: '광란!', tone: 'eldritch' });
        }
      }
      out.push(this.damage({ src: e, tgt, base: dmg, type: o.type ?? 'blunt', attack: true, melee, move: e.intent?.move, tags: o.tags }));
    }
    return out;
  }

  /** 적의 정신 공격 */
  horror(e: EnemyUnit, amount?: number) {
    const n = amount ?? e.intent?.sanity ?? 0;
    this.emit({ t: 'fx', name: 'horror', src: e.uid, tgt: 'p' });
    return this.loseSanity(n, true);
  }

  // ── 종료 ──

  private checkEnd(): boolean {
    if (this.over) return true;
    if (this.p.hp <= 0 && !this.dying) {
      this.defeat('hp');
      return true;
    }
    if (this.alive.length === 0) {
      this.victory();
      return true;
    }
    return false;
  }

  private victory() {
    this.s.phase = 'victory';
    // 살아남았다는 안도
    if (!this.dying && this.p.sanity < this.p.maxSanity) {
      this.p.sanity = Math.min(this.p.maxSanity, this.p.sanity + 2);
      this.emit({ t: 'sanity', delta: 2 });
    }
    this.emit({ t: 'victory' });
    this.fire(this.p, 'onCombatEnd', true);
    this.cleanup();
  }

  private defeat(reason: 'hp' | 'madness') {
    if (this.s.phase === 'defeat') return;
    this.s.phase = 'defeat';
    this.emit({ t: 'defeat', reason });
  }

  private cleanup() {
    const p = this.p;
    p.block = 0;
    p.st = {};
    if (p.hp <= 0) p.hp = 1;
  }
}

export function lvlVal(v: number | number[], lvl: number): number {
  return Array.isArray(v) ? v[Math.min(lvl, v.length - 1)] : v;
}

/** 광기 획득. 이미 MAX_MADNESS-1개면 치명적 */
export function rollMadness(run: RunState, rng: Rng): { id: string | null; fatal: boolean } {
  const negatives = run.madness.filter((id) => !MADNESS.get(id)?.virtue).length;
  // 25% 확률로 각성(긍정)
  const virtues = [...MADNESS.values()].filter((m) => m.virtue && !run.madness.includes(m.id));
  if (virtues.length && rng.chance(0.25)) {
    const v = rng.pick(virtues);
    run.madness.push(v.id);
    v.onGain?.(run);
    return { id: v.id, fatal: false };
  }
  if (negatives + 1 >= MAX_MADNESS) return { id: null, fatal: true };
  const pool = [...MADNESS.values()].filter((m) => !m.virtue && !run.madness.includes(m.id));
  if (!pool.length) return { id: null, fatal: true };
  const m = rng.pick(pool);
  run.madness.push(m.id);
  m.onGain?.(run);
  return { id: m.id, fatal: false };
}
