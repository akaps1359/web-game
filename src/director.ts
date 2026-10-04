import type { CombatEvent, Snap } from './engine/combat';
import { ENEMIES, MADNESS, STATUSES } from './engine/registry';
import { stage } from './render/stage';
import { sound } from './sound';
import { store } from './state/store';
import { DMG_COLOR, DMG_NAME } from './ui/text';

// ───────────── 떠오르는 글자 ─────────────

export interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  kind: 'num' | 'word' | 'big';
}

export const fx = {
  floaters: [] as Floater[],
  banner: null as null | { id: number; text: string; tone: 'player' | 'enemy' | 'good' | 'bad' | 'eldritch' },
  moveLabel: null as null | { id: number; uid: string; text: string },
};

let fid = 0;

export function floater(x: number, y: number, text: string, color = '#fff', kind: Floater['kind'] = 'num', size = 26) {
  const f: Floater = { id: ++fid, x: x + (Math.random() - 0.5) * 24, y, text, color, size, kind };
  fx.floaters.push(f);
  store.emit();
  setTimeout(
    () => {
      fx.floaters = fx.floaters.filter((x) => x.id !== f.id);
      store.emit();
    },
    kind === 'big' ? 1400 : 1000,
  );
}

function banner(text: string, tone: NonNullable<typeof fx.banner>['tone'], ms = 1000) {
  const b = { id: ++fid, text, tone };
  fx.banner = b;
  store.emit();
  setTimeout(() => {
    if (fx.banner?.id === b.id) {
      fx.banner = null;
      store.emit();
    }
  }, ms / speed());
}

function speed() {
  return store.meta.speed ?? 1;
}

function wait(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms / speed()));
}

/** 플레이어 기준점 (DOM의 #p-anchor) */
function playerPoint(): { x: number; y: number } {
  const el = document.getElementById('p-anchor');
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight * 0.62 };
}

function unitPoint(uid: string | undefined, top = 0.55): { x: number; y: number } {
  if (!uid || uid === 'p') return playerPoint();
  const a = stage.battle.anchor(uid);
  if (!a) return { x: window.innerWidth / 2, y: window.innerHeight * 0.3 };
  return { x: a.x, y: a.y - a.size * top };
}

export function syncBattle(snap: Snap | null) {
  const c = store.combat;
  const enemies = snap
    ? snap.e.map((e) => {
        const real = c?.s.enemies.find((x) => x.uid === e.uid);
        return { uid: e.uid, row: e.row, scale: real?.scale ?? 1, dead: e.dead, broken: e.broken, form: real?.form, def: real?.def ?? '' };
      })
    : (c?.s.enemies ?? []);
  stage.battle.sync(enemies, (id) => ENEMIES.get(id));
}

// ───────────── 재생 ─────────────

let queue: CombatEvent[] = [];
let running: Promise<void> | null = null;

export function play(events: CombatEvent[]): Promise<void> {
  queue.push(...events);
  if (!running) running = run();
  return running;
}

export function busy(): boolean {
  return !!running;
}

async function run() {
  store.busy = true;
  store.emit();
  try {
    while (queue.length) {
      const ev = queue.shift()!;
      if (ev.snap) store.snap = ev.snap;
      await step(ev);
    }
  } finally {
    store.snap = null;
    store.busy = false;
    running = null;
    syncBattle(null);
    store.emit();
  }
}

const SFX_BY_TYPE: Record<string, string> = {
  slash: 'slash',
  pierce: 'pierce',
  blunt: 'blunt',
  fire: 'fire',
  arcane: 'arcane',
  void: 'void',
  true: 'debuff',
};

async function step(ev: CombatEvent) {
  switch (ev.t) {
    case 'turn':
      syncBattle(store.snap);
      if (ev.side === 'player') {
        banner(`${ev.turn}턴 — 당신의 차례`, 'player', 900);
        sound.sfx('turnStart');
        store.emit();
        await wait(380);
      } else {
        banner('적의 차례', 'enemy', 700);
        store.emit();
        await wait(300);
      }
      return;
    case 'skill': {
      store.emit();
      const fxName = ev.dtype ? SFX_BY_TYPE[ev.dtype] : 'select';
      if (ev.school === 'firearm' && ev.dtype === 'pierce') sound.sfx('gunshot');
      else if (!ev.dtype) sound.sfx('buff');
      else sound.sfx(fxName, { volume: 0.5 });
      banner(ev.echo ? `${ev.name} (메아리)` : ev.name, 'player', 700);
      await wait(140);
      return;
    }
    case 'move': {
      store.emit();
      fx.moveLabel = { id: ++fid, uid: ev.uid, text: ev.name };
      if (ev.kind === 'attack' || ev.kind === 'horror' || ev.kind === 'debuff') stage.battle.lunge(ev.uid);
      else stage.battle.pulse(ev.uid, ev.kind === 'block' ? 0x8fd0ff : ev.kind === 'buff' ? 0xffc060 : 0xe86a8a);
      if (ev.kind === 'charge') sound.sfx('charge');
      else if (ev.kind === 'buff') sound.sfx('buff');
      else if (ev.kind === 'block') sound.sfx('block', { volume: 0.6 });
      else if (ev.kind === 'summon') sound.sfx('riftOpen', { volume: 0.6 });
      store.emit();
      await wait(320);
      return;
    }
    case 'dmg': {
      store.emit();
      const isDot = ev.tags.includes('dot');
      if (ev.tgt === 'p') {
        const pp = playerPoint();
        if (ev.hpLoss > 0) {
          stage.shake(Math.min(16, 4 + ev.hpLoss * 0.6), 0.3);
          stage.flash(0xc01818, Math.min(0.4, 0.12 + ev.hpLoss / 60));
          floater(pp.x, pp.y - 30, `-${ev.hpLoss}`, '#ff6a5a', 'num', 30);
          sound.sfx('playerHit', { pitch: 0.9 + Math.random() * 0.2 });
        } else if (ev.blocked > 0) {
          floater(pp.x, pp.y - 30, '막음', '#8fc4ea', 'word', 20);
          sound.sfx('block', { volume: 0.7 });
        } else if (ev.amount === 0 && ev.attack) {
          floater(pp.x, pp.y - 30, '빗나감', '#cfc8b8', 'word', 20);
        }
        await wait(isDot ? 140 : 260);
        return;
      }
      const p = unitPoint(ev.tgt);
      if (isDot) {
        stage.battle.dot(ev.tgt, ev.tags.find((t) => t === 'bleed' || t === 'poison' || t === 'burn') ?? '');
        floater(p.x, p.y, `${ev.hpLoss || ev.amount}`, ev.tags.includes('poison') ? '#7fe060' : ev.tags.includes('burn') ? '#ff8a45' : '#e05050', 'num', 22);
        await wait(160);
        return;
      }
      stage.battle.hit(ev.tgt, ev.dtype, ev.amount, { crit: ev.crit, weak: ev.weak, blocked: ev.blocked > 0 });
      const big = ev.crit || ev.weak;
      floater(p.x, p.y, ev.hpLoss > 0 ? `${ev.hpLoss}` : ev.blocked > 0 ? `(${ev.blocked})` : '0', DMG_COLOR[ev.dtype], 'num', big ? 36 : 28);
      if (ev.weak) floater(p.x, p.y - 34, `약점 · ${DMG_NAME[ev.dtype]}`, DMG_COLOR[ev.dtype], 'word', 16);
      if (ev.crit) floater(p.x, p.y - 52, '치명타!', '#ffe080', 'word', 18);
      if (ev.amount > 0) stage.shake(big ? 7 : 3, 0.15);
      sound.sfx(ev.blocked > 0 && ev.hpLoss === 0 ? 'block' : SFX_BY_TYPE[ev.dtype], { pitch: 0.92 + Math.random() * 0.16 });
      await wait(big ? 260 : 200);
      return;
    }
    case 'block': {
      store.emit();
      const p = unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.6);
      if (ev.uid !== 'p') stage.battle.shield(ev.uid);
      floater(p.x, p.y - (ev.uid === 'p' ? 30 : 0), `+${ev.amount}`, '#8fc4ea', 'num', 22);
      sound.sfx('block', { volume: 0.5 });
      await wait(150);
      return;
    }
    case 'heal': {
      store.emit();
      const p = unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.6);
      floater(p.x, p.y - (ev.uid === 'p' ? 30 : 0), `+${ev.amount}`, '#6ee08a', 'num', 24);
      if (ev.uid !== 'p') stage.battle.pulse(ev.uid, 0x6ee08a);
      sound.sfx('heal', { volume: 0.6 });
      await wait(170);
      return;
    }
    case 'status': {
      store.emit();
      const def = STATUSES.get(ev.id);
      if (!def || def.hidden || ev.n === 0) return;
      const p = unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.95);
      if (ev.n > 0) {
        floater(p.x, p.y - (ev.uid === 'p' ? 52 : 0), `${def.name} ${ev.n > 0 ? '+' : ''}${ev.n}`, def.kind === 'buff' ? '#f0cf7a' : '#c8a0ff', 'word', 15);
        if (def.kind === 'debuff' && ev.uid === 'p') sound.sfx('debuff', { volume: 0.5 });
        await wait(110);
      }
      return;
    }
    case 'reveal': {
      store.emit();
      const p = unitPoint(ev.uid, 1.05);
      floater(p.x, p.y, `약점 발견: ${DMG_NAME[ev.dtype]}`, DMG_COLOR[ev.dtype], 'word', 15);
      sound.sfx('reveal', { volume: 0.6 });
      await wait(160);
      return;
    }
    case 'break': {
      syncBattle(store.snap);
      store.emit();
      stage.battle.breakFx(ev.uid);
      stage.shake(12, 0.35);
      stage.flash(0xffd060, 0.25);
      const p = unitPoint(ev.uid, 0.7);
      floater(p.x, p.y, '붕괴!', '#ffe080', 'big', 40);
      sound.sfx('break');
      await wait(520);
      return;
    }
    case 'recover': {
      store.emit();
      const p = unitPoint(ev.uid, 1);
      floater(p.x, p.y, '버팀 회복', '#cfc8b8', 'word', 14);
      await wait(150);
      return;
    }
    case 'death': {
      store.emit();
      stage.battle.death(ev.uid);
      sound.sfx('enemyDeath');
      syncBattle(store.snap);
      await wait(380);
      return;
    }
    case 'flee': {
      store.emit();
      const p = unitPoint(ev.uid, 0.7);
      floater(p.x, p.y, '도주', '#cfc8b8', 'word', 18);
      stage.battle.death(ev.uid);
      syncBattle(store.snap);
      await wait(320);
      return;
    }
    case 'spawn': {
      syncBattle(store.snap);
      store.emit();
      setTimeout(() => stage.battle.spawnFx(ev.uid), 30);
      sound.sfx('riftOpen', { volume: 0.5 });
      await wait(320);
      return;
    }
    case 'row': {
      syncBattle(store.snap);
      store.emit();
      sound.sfx('footstep', { volume: 0.5 });
      await wait(180);
      return;
    }
    case 'sanity': {
      store.emit();
      const pp = playerPoint();
      if (ev.delta < 0) {
        floater(pp.x + 40, pp.y - 10, `정신 ${ev.delta}`, '#b99bff', 'num', 22);
        stage.flash(0x5030c0, 0.16);
        sound.sfx(Math.abs(ev.delta) >= 6 ? 'whisper' : 'sanityLoss', { volume: 0.7 });
      } else {
        floater(pp.x + 40, pp.y - 10, `정신 +${ev.delta}`, '#d0bfff', 'num', 20);
      }
      if (store.snap) {
        stage.setSanity(store.snap.p.sanity);
        sound.sanity(store.snap.p.sanity);
      }
      await wait(200);
      return;
    }
    case 'insight': {
      store.emit();
      const pp = playerPoint();
      floater(pp.x, pp.y - 60, `통찰 +${ev.delta}`, '#4fffc4', 'big', 26);
      sound.sfx('reveal');
      await wait(400);
      return;
    }
    case 'breakdown': {
      store.emit();
      const name = MADNESS.get(ev.madness)?.name;
      banner(ev.fatal ? '정신이 완전히 무너졌다' : `정신 붕괴 — ${name ?? '광기'}`, 'eldritch', 1800);
      stage.flash(0x30ffc0, 0.35);
      stage.shake(14, 0.6);
      sound.sfx('breakdown');
      await wait(1300);
      return;
    }
    case 'text': {
      store.emit();
      const p = ev.uid ? unitPoint(ev.uid, ev.uid === 'p' ? 0 : 0.95) : { x: window.innerWidth / 2, y: window.innerHeight * 0.35 };
      const color = ev.tone === 'good' ? '#9fffb0' : ev.tone === 'bad' ? '#ff9a8a' : ev.tone === 'eldritch' ? '#4fffc4' : '#e9e3d6';
      floater(p.x, p.y - (ev.uid === 'p' ? 40 : 0), ev.text, color, 'word', 15);
      await wait(260);
      return;
    }
    case 'fx': {
      store.emit();
      if (ev.name === 'horror' && ev.src) stage.battle.horror(ev.src);
      else if (ev.name === 'tentacle' && ev.tgt) {
        stage.battle.tentacle(true, ev.tgt);
        sound.sfx('void', { volume: 0.5 });
      } else if (ev.name === 'detonate' && ev.tgt) {
        stage.battle.pulse(ev.tgt, 0xb48cff);
        sound.sfx('arcane');
      } else if (ev.name === 'transform') {
        stage.flash(0x40ffc0, 0.4);
        stage.shake(14, 0.5);
        syncBattle(store.snap);
        sound.sfx('breakdown');
        await wait(600);
      }
      await wait(120);
      return;
    }
    case 'victory':
      store.emit();
      banner('승리', 'good', 1400);
      sound.sfx('victoryHit');
      await wait(900);
      return;
    case 'defeat':
      store.emit();
      banner(ev.reason === 'madness' ? '광기에 삼켜졌다' : '쓰러졌다', 'bad', 2000);
      stage.flash(0x000000, 0.7);
      await wait(1400);
      return;
  }
}
