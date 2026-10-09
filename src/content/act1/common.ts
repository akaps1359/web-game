import { josa } from '../../engine/josa';
import { reg, SKILLS } from '../../engine/registry';
import { isEnemy, type Combat } from '../../engine/combat';
import type { EnemyUnit, TurnNote } from '../../engine/types';
import { cine, setObjective, setUi } from '../lib';

/**
 * 1층(침수된 지하 수로) 정예·수호자 패턴 (2026-10 확장) — 공용 도구와 전용 상태.
 * - 등대지기: 등명기가 돌다 터뜨리는 섬광 → '눈부심'(다음 내 턴 동안 적의 의도가 가려진다, 등명기를 깨면 걷힌다)
 * - 늙은 어부: 낚싯줄로 기술 하나를 건다 → 전열에 '팽팽한 낚싯줄'이 나타나 두 번째 차례에 낚아 간다 (줄을 끊거나 어부를 붕괴시키면 되찾는다)
 * - 익사한 선장: 차오르는 물 (선장이 행동할 때마다 1, 셋이면 숨이 막혀 행동력 -1. 한 턴에 크게 때리거나 익사체를 쓰러뜨리면 1, 붕괴시키면 모두 빠진다)
 *   물이 끝까지 차면 「만조」(퍼즐): 다음 선장 차례까지 물을 빼지 못하면 물에 잠긴다 (최대 체력 30% 피해, 다음 턴 행동력 -1)
 *   「닻사슬」: 전열에 박히는 물건 — 박혀 있는 동안 선장이 행동할 때마다 물이 더 차오른다 (끊으면 빠진다)
 *   체력 절반에서 「두 동강 난 배」(망령 선장): 그 뒤로 「물속의 손」이 선장 차례가 끝날 때마다 가장 비싼 기술을 한 턴 붙잡는다
 * - 교단 집행자: 판결 (다음 내 턴에 집행자에게 피해 N을 주지 못하면 유죄)
 * - 거대 게: 집게가 무기를 문다 (붕괴시키거나 쓰러뜨리면 놓는다)
 * - 바다 무덤의 망령: 유리에 남는 손자국 (끌어내림의 손이 늘어난다)
 * 이 상태들은 '규칙 표시'라 결계에 막히지 않게 직접 건다 (setPlayerSt).
 */

export const DAZZLE = 'a1-dazzle';
export const HOOKED = 'a1-hooked';
export const CAUGHT = 'a1-caught';
export const FLOOD = 'a1-flood';
export const TRIAL = 'a1-trial';
export const DISARMED = 'a1-disarmed';
export const HANDPRINT = 'a1-handprint';
/** 어부가 던진 낚싯줄 (하수인 — 끊으면 기술이 돌아온다) */
export const LINE = 'fishline';

// ── 수치 (설명 문구도 이 값을 쓴다) ──
/** 낚싯줄 체력 / 낚으면 어부 힘 + */
export const LINE_HP = 10;
export const CATCH_STR = 2;
/** 차오르는 물의 끝 (이 높이면 숨이 막힌다) / 한 턴에 선장에게 이만큼 피해를 주면 물이 1 빠진다 */
export const WATER_MAX = 3;
export const BAIL_DMG = 12;
/** 만조를 막거나 맞은 뒤, 다시 부르기까지 (턴) */
export const TIDE_GAP = 3;
/** 만조가 몰려오는 중인가 (c.s.vars 표식 — 이 턴엔 숨을 참아 행동력이 줄지 않는다) */
export const TIDE = 'a1-tide';
/** 만조에 잠기면: 최대 체력의 이 비율만큼 피해 (방어도 무시) / 다음 턴 잃는 행동력 */
export const TIDE_DMG = 0.3;
export const TIDE_AP = 1;
/** 만조에 잠긴 뒤 헐떡임 (다음 내 턴 행동력 -n) */
export const GASP = 'a1-gasp';
/** 판결: 채워야 할 피해 / 유죄의 대가 / 무죄면 집행자 버팀 - */
export const VERDICT_DMG = 15;
export const GUILTY_SAN = 10;
export const GUILTY_VULN = 1;
export const ACQUIT_POISE = 2;
/** 손자국 최대 */
export const HANDPRINT_MAX = 3;
/** 거대 게가 무기를 물고 있는 턴 수 (붕괴·처치 없이도 놓는다 — 약점을 칠 수 없는 출신도 있으니) */
export const CLAMP_TURNS = 2;
/** 심연의 노래에 홀리면 다음 내 턴 잃는 행동력 */
export const CHARM_AP = 1;
export const CHARMED = 'a1-charmed';

// ── 익사한 선장 (계층군주 — 2026-10 강화: 층 수호자보다 확실히 어렵게. 수치는 하네스로 다시 맞춘다) ──
/** 선장 체력 / 버팀 */
export const CAPTAIN_HP = 260;
export const CAPTAIN_POISE = 12;
/** 녹슨 커틀러스 (타격당 피해 × 횟수) / 닻 내려치기 / 익사자의 뱃노래 (정신 피해, 공포) */
export const SWORD_DMG = 9;
export const SWORD_HITS = 2;
export const ANCHOR_DMG = 30;
export const SHANTY_SAN = 12;
export const SHANTY_DREAD = 2;
/** 닻사슬: 체력 / 끊긴 뒤 다시 던지기까지 (턴) / 박혀 있으면 선장이 행동할 때마다 더 차오르는 물 / 끊으면 빠지는 물 */
export const CHAIN_HP = 14;
export const CHAIN_GAP = 3;
export const CHAIN_RISE = 1;
export const CHAIN_DRAIN = 1;
/** 두 동강 난 배: 체력이 이 비율 이하가 되면 / 물이 이 높이까지 차오른다 */
export const WRECK_AT = 0.5;
export const WRECK_WATER = WATER_MAX - 1;
/** 망령 선장: 유령선 돌격 / 물귀신의 합창 (정신 피해, 차오르는 물) */
export const RAM_DMG = 34;
export const CHOIR_SAN = 12;
export const CHOIR_WATER = 1;
/** 물속의 손: 망령 선장 차례가 끝날 때 물이 이 높이 이상이면 기술 하나를 붙잡는다 */
export const HANDS_WATER = 2;
/** 선장이 던진 닻사슬 (하수인 — 끊으면 물이 빠진다) */
export const CHAIN = 'anchor-chain';
/** 닻사슬이 박혀 있다 / 물속의 손 (망령 선장의 규칙 — 상태 수치는 붙잡는 물 높이) */
export const CHAINED = 'a1-chained';
export const HANDS = 'a1-hands';

/** 플레이어에게 '규칙' 상태를 직접 건다 (결계에 막히지 않고, 사경 중에도 그대로). 0이면 지운다 */
export function setPlayerSt(c: Combat, id: string, n: number) {
  const before = c.p.st[id] ?? 0;
  if (n > 0) c.p.st[id] = n;
  else delete c.p.st[id];
  if (n !== before) c.emit({ t: 'status', uid: 'p', id, n: n - before });
}

export function skillName(c: Combat, uid: string): string {
  const owned = c.run.skills.find((s) => s.uid === uid);
  return (owned && SKILLS.get(owned.id)?.name) || '기술';
}

/** 피해 없이 버팀만 깎는다 (0이 되면 붕괴) */
export function chipPoise(c: Combat, e: EnemyUnit, n: number) {
  if (e.dead || e.broken > 0 || e.maxPoise <= 0 || n <= 0) return;
  e.poise = Math.max(0, e.poise - n);
  if (e.poise === 0) c.breakEnemy(e);
  else c.emit({ t: 'text', uid: e.uid, text: `버팀 -${n}`, tone: 'info' });
}

// ───────────── 등대지기: 눈부심 ─────────────

/** 섬광에 눈이 먼다: 다음 내 턴 동안 적의 의도가 가려진다. 처음 한 번은 화면 밖의 당신에게 */
export function dazzle(c: Combat, src: EnemyUnit) {
  if (c.over) return;
  setPlayerSt(c, DAZZLE, 1);
  c.emit({ t: 'text', uid: 'p', text: '눈이 멀었다', tone: 'bad' });
  if (!c.s.vars['a1-flashed']) {
    c.s.vars['a1-flashed'] = 1;
    cine(c, 'sysmsg', { uid: src.uid, text: '화면을 너무 오래 보고 있습니다. 잠시 눈을 감으십시오.' });
  }
}

/** 의도를 가린다 — 힘을 모은 큰 공격(차지와 그 뒤의 일격)은 눈이 멀어도 보인다 */
function veil(c: Combat) {
  for (const e of c.alive) {
    const it = e.intent;
    if (!it || it.hidden || it.charging || e.mem.charge || it.kind === 'stunned') continue;
    it.hidden = true;
    e.mem.dazzled = 1;
  }
}

/** 가린 의도를 되돌린다 */
function unveil(c: Combat) {
  for (const e of c.s.enemies) {
    if (!e.mem.dazzled) continue;
    delete e.mem.dazzled;
    if (!e.intent) continue;
    if (c.moveDef(e, e.intent.move).hidden) e.intent.hidden = true;
    else delete e.intent.hidden;
  }
}

// ───────────── 늙은 어부: 낚싯줄 ─────────────

/** 낚을 수 있는 장착 기술 (다른 적이 쥔 것·이미 잠긴 것 제외) */
function hookable(c: Combat): { uid: string; i: number }[] {
  const held = new Set(c.s.enemies.filter((x) => !x.dead && x.mem.specimen).map((x) => x.mem.specimen - 1));
  return c.run.slots
    .map((uid, i) => ({ uid, i }))
    .filter((x): x is { uid: string; i: number } => !!x.uid && !held.has(x.i) && (c.s.cd[x.uid] ?? 0) < 90);
}

/** 낚싯줄을 던질 수 있는가 (이미 쥔 기술이 없고, 장착한 기술이 둘 이상) */
export function canHook(c: Combat, e: EnemyUnit): boolean {
  return !e.mem.specimen && hookable(c).length >= 2;
}

/** 보상 없이 사라진다 (처치가 아니다) */
function vanish(c: Combat, e: EnemyUnit) {
  if (e.dead) return;
  e.dead = true;
  e.fled = true;
  e.block = 0;
  c.emit({ t: 'death', uid: e.uid });
}

/** 남은 낚싯줄을 거둔다 */
function dropLine(c: Combat) {
  for (const x of c.alive) if (x.def === LINE) vanish(c, x);
}

/**
 * 장착한 기술 하나를 낚싯바늘에 건다: 전열에 '팽팽한 낚싯줄'이 나타난다 (두 번째 차례에 낚아 간다, 끊으면 되찾는다).
 * 걸린 기술은 쓸 수 없다 (재사용 대기 99로 잠금 — 3층 표본 채집과 같은 표식 mem.specimen이라 대기를 되돌리는 기술·각인도 건드리지 않는다).
 */
export function hookSkill(c: Combat, e: EnemyUnit): boolean {
  if (!canHook(c, e)) return false;
  if (!c.spawn(LINE, 0)) return false;
  const pick = c.rng.pick(hookable(c));
  e.mem.specimen = pick.i + 1;
  e.mem.specimenCd = c.s.cd[pick.uid] ?? 0;
  e.mem.specimenAt = c.s.turn;
  e.mem.hook = 1;
  c.s.cd[pick.uid] = 99;
  setPlayerSt(c, HOOKED, 1);
  c.emit({ t: 'text', uid: 'p', text: `「${skillName(c, pick.uid)}」${josa(skillName(c, pick.uid), '이')} 낚싯바늘에 걸렸다`, tone: 'bad' });
  return true;
}

/** 쥔 기술을 돌려준다 (줄이 끊어짐·붕괴·본모습·죽음). 남은 낚싯줄도 사라진다 */
export function releaseSkill(c: Combat, e: EnemyUnit, text: (name: string) => string) {
  const i = (e.mem.specimen ?? 0) - 1;
  e.mem.hook = 0;
  e.mem.caught = 0;
  setPlayerSt(c, HOOKED, 0);
  setPlayerSt(c, CAUGHT, 0);
  dropLine(c);
  if (i < 0) return;
  e.mem.specimen = 0;
  const uid = c.run.slots[i];
  if (!uid) return;
  // 걸려 있던 동안 지난 턴만큼 원래 대기가 줄어 있다
  const left = Math.max(0, (e.mem.specimenCd ?? 0) - (c.s.turn - (e.mem.specimenAt ?? c.s.turn)));
  if (left > 0) c.s.cd[uid] = left;
  else delete c.s.cd[uid];
  c.emit({ t: 'text', uid: 'p', text: text(skillName(c, uid)), tone: 'good' });
}

/** 낚싯줄을 쥔 어부 */
export function angler(c: Combat): EnemyUnit | undefined {
  return c.alive.find((x) => x.mem.hook && x.mem.specimen);
}

/** 줄을 다 감았다: 기술을 낚아 간다 (어부가 본모습을 드러내거나 쓰러질 때까지) */
export function reelIn(c: Combat, line: EnemyUnit) {
  const e = angler(c);
  vanish(c, line);
  if (!e) return;
  e.mem.hook = 0;
  e.mem.caught = 1;
  setPlayerSt(c, HOOKED, 0);
  setPlayerSt(c, CAUGHT, 1);
  const uid = c.run.slots[(e.mem.specimen ?? 0) - 1];
  const name = uid ? skillName(c, uid) : '기술';
  c.apply(e, 'str', CATCH_STR, e);
  c.emit({ t: 'text', uid: e.uid, text: '월척이다', tone: 'eldritch' });
  cine(c, 'glitch', { n: 2 });
  cine(c, 'sysmsg', { uid: e.uid, text: `「${name}」을(를) 잃었습니다.` });
}

/** 쥔 기술의 잠금을 다시 건다 (대기가 매 턴 줄어 숫자로 보이지 않게 — 버튼엔 ✕) */
function keepHeld(c: Combat) {
  for (const e of c.alive) {
    const i = (e.mem.specimen ?? 0) - 1;
    const uid = i >= 0 ? c.run.slots[i] : null;
    if (uid && (e.mem.hook || e.mem.caught)) c.s.cd[uid] = 99;
  }
}

/** 줄이 끊어진다 (낚싯줄을 쓰러뜨림·어부 붕괴) */
export function cutLine(c: Combat, e: EnemyUnit, why: string) {
  if (!e.mem.hook) return;
  c.emit({ t: 'text', uid: e.uid, text: why, tone: 'good' });
  releaseSkill(c, e, (n) => `「${n}」${josa(n, '을')} 되찾았다`);
}

/** 심연의 노래에 홀린다: 다음 내 턴 행동력 -CHARM_AP (결계로 막을 수 있다) */
export function charm(c: Combat) {
  if (!c.over) c.apply(c.p, CHARMED, CHARM_AP, null);
}

// ───────────── 익사한 선장: 차오르는 물 ─────────────

export function waterLevel(c: Combat): number {
  return c.p.st[FLOOD] ?? 0;
}

/** 물 높이를 바꾼다 (화면의 물·기울기도 함께) */
export function setWater(c: Combat, n: number) {
  const before = waterLevel(c);
  const v = Math.max(0, Math.min(WATER_MAX, n));
  setPlayerSt(c, FLOOD, v);
  setUi(c, 'ui:water', v);
  setUi(c, 'ui:tilt', -2 * v);
  // 물이 빠지면 몰려오던 만조도 물러가고, 물속의 손도 붙잡은 기술을 놓는다
  if (v < WATER_MAX) cancelTide(c);
  if (v < before) loosenHands(c, '물이 빠지자 손이 놓았다');
}

// ── 만조 (퍼즐) ──
// 물이 끝까지 차면 선장이 「만조」를 부른다: 다음 선장 차례에 물이 여전히 끝까지 차 있으면 물에 잠긴다
// (최대 체력의 TIDE_DMG만큼 방어도를 무시하는 피해, 다음 턴 행동력 -TIDE_AP, 물은 한 칸 빠진다).
// 플레이어에게는 온전한 한 턴이 있다 (큰 공격 의도, 화면 위에 경고 띠). 물을 빼는 법은 늘 셋 — 선장에게 한 턴에 피해 BAIL_DMG,
// 익사체 처치, 선장 붕괴. 막든 맞든 TIDE_GAP 턴 동안은 다시 부르지 않는다.

/** 지금 만조를 부를 수 있는가 (물이 끝까지 찼고, 지난 만조 뒤 TIDE_GAP 턴이 지났다) */
export function tideReady(c: Combat, cap: EnemyUnit): boolean {
  return !cap.mem.tide && waterLevel(c) >= WATER_MAX && c.s.turn - (cap.mem.tideAt ?? -99) >= TIDE_GAP;
}

/** 만조에 잠기면 받는 피해 (최대 체력 기준) */
export function tideDamage(c: Combat): number {
  return Math.ceil(c.p.maxHp * TIDE_DMG);
}

/** 못 막으면 일어나는 일 (띠를 누르면 보인다) */
function tideFail(c: Combat): string {
  return `물에 잠겨 피해 ${tideDamage(c)} (최대 체력의 ${Math.round(TIDE_DMG * 100)}%, 방어도 무시), 다음 턴 행동력 -${TIDE_AP}`;
}

/** 목표 띠: 물을 빼는 법 (선장에게 남은 피해는 맞을 때마다 줄어든다). 익사체도 닻사슬도 쓰러뜨리면 물이 빠진다 */
export function tideObjective(c: Combat, cap: EnemyUnit) {
  const need = Math.max(0, BAIL_DMG - (cap.mem.bail ?? 0));
  const kill = c.alive.filter((x) => x.def === 'drowned' || x.def === CHAIN);
  const names = [kill.some((x) => x.def === 'drowned') && '익사체', kill.some((x) => x.def === CHAIN) && '닻사슬'].filter(Boolean);
  setObjective(c, {
    text: `물을 빼라: 선장에게 피해 ${need}${names.length ? ` 또는 ${names.join('·')} 처치` : ''} · 1턴 남음`,
    hit: { uid: cap.uid, need },
    ...(kill.length ? { kill: kill.map((x) => x.uid) } : {}),
    fail: tideFail(c),
  });
}

/** 만조를 부른다 (의도를 정할 때). 처음엔 화면 밖의 당신에게 */
export function callTide(c: Combat, cap: EnemyUnit) {
  cap.mem.tide = 1;
  c.s.vars[TIDE] = 1;
  tideObjective(c, cap);
  c.emit({ t: 'text', uid: cap.uid, text: '만조가 몰려온다. 물을 빼지 못하면 잠긴다', tone: 'eldritch' });
  if (!c.s.vars['a1-tideSeen']) {
    c.s.vars['a1-tideSeen'] = 1;
    cine(c, 'whisper', { text: '숨을 참아라. 지금은 {time}. 다음 물결이 오면 너는 잠긴다.' });
  }
}

/** 만조가 물러간다 (물이 빠졌다·선장이 쓰러졌다). 내 턴이면 선장은 곧바로 다른 행동을 고른다 */
export function cancelTide(c: Combat) {
  if (!c.s.vars[TIDE]) return;
  delete c.s.vars[TIDE];
  setObjective(c, null);
  const cap = c.s.enemies.find((x) => x.def === 'captain' && x.mem.tide);
  if (!cap) return;
  cap.mem.tide = 0;
  cap.mem.tideAt = c.s.turn;
  if (cap.dead) return;
  c.emit({ t: 'text', uid: cap.uid, text: '물이 빠지자 만조가 물러간다', tone: 'good' });
  // 붕괴로 멈췄으면 그대로 둔다. 적의 차례 중이면 만조 행동이 헛돌며 끝난다
  if (c.s.phase === 'player' && cap.broken !== 2) c.planIntent(cap);
}

/** 만조가 닿았다: 물이 여전히 끝까지 차 있으면 물에 잠긴다 — 큰 피해(방어도 무시)와 헐떡임, 물결이 지나가며 물이 1 빠진다 */
export function resolveTide(c: Combat, cap: EnemyUnit) {
  const pending = !!cap.mem.tide;
  cap.mem.tide = 0;
  cap.mem.tideAt = c.s.turn;
  delete c.s.vars[TIDE];
  setObjective(c, null);
  if (!pending || waterLevel(c) < WATER_MAX) {
    c.emit({ t: 'text', uid: cap.uid, text: '물이 빠져 만조가 닿지 못했다', tone: 'good' });
    return;
  }
  cine(c, 'water', { n: WATER_MAX });
  c.s.vars['a1-tideHits'] = (c.s.vars['a1-tideHits'] ?? 0) + 1;
  c.emit({ t: 'text', uid: 'p', text: '만조에 잠겼다', tone: 'bad' });
  // 보통 피해처럼 들어간다 (쓰러지면 사경) — 방어도만 무시
  c.damage({ src: cap, tgt: c.p, base: tideDamage(c), type: 'true', ignoreBlock: true, tags: ['tide'] });
  if (c.over) return;
  c.apply(c.p, GASP, TIDE_AP, cap);
  setWater(c, WATER_MAX - 1);
}

/** 선장이 크게 휘청이면 물이 1 빠진다 (한 턴에 피해 BAIL_DMG 이상) */
export function bailWater(c: Combat, e: EnemyUnit) {
  const lv = waterLevel(c);
  if (lv <= 0) return;
  setWater(c, lv - 1);
  c.emit({ t: 'text', uid: e.uid, text: '선장이 휘청이자 물이 빠진다', tone: 'good' });
}

/** 물이 n 차오른다 (선장이 행동할 때마다 1, 닻사슬·합창이 더). say: 띄울 글 (차오른 높이를 받는다) */
export function riseWater(c: Combat, e: EnemyUnit, n = 1, say?: (lv: number) => string) {
  const lv = waterLevel(c);
  if (lv >= WATER_MAX || c.over || n <= 0) return;
  const to = Math.min(WATER_MAX, lv + n);
  setWater(c, to);
  // 물이 밀려드는 연출은 처음 그 높이에 닿을 때만 (매 턴 틀지 않는다 — 높이는 화면 아래의 물이 늘 보여 준다)
  if (to > (c.s.vars['a1-waterPeak'] ?? 0)) {
    c.s.vars['a1-waterPeak'] = to;
    cine(c, 'water', { n: to });
  }
  c.emit({ t: 'text', uid: e.uid, text: say ? say(to) : `물이 차오른다 (${to}/${WATER_MAX})`, tone: 'bad' });
}

// ── 닻사슬 ──
// 선장이 전열에 닻사슬을 박는다 (하수인, 공격하지 않는다). 박혀 있는 동안 선장이 행동할 때마다 물이 CHAIN_RISE 더 차오르고,
// 끊으면(쓰러뜨리면) CHAIN_DRAIN 빠진다. 한 번에 하나, 끊긴 뒤 CHAIN_GAP 턴은 다시 던지지 않는다 (AI가 센다).

export function chainAlive(c: Combat): boolean {
  return c.alive.some((x) => x.def === CHAIN);
}

/** 닻사슬을 던진다 (전열에, 차 있으면 후열에 — 후열에서도 근접으로 닿는다). 박힐 자리가 없으면 헛돈다 */
export function throwChain(c: Combat, cap: EnemyUnit): boolean {
  if (c.over || chainAlive(c)) return false;
  const ch = c.spawn(CHAIN, 0);
  if (!ch) {
    c.emit({ t: 'text', uid: cap.uid, text: '사슬이 걸릴 곳이 없다', tone: 'info' });
    return false;
  }
  setPlayerSt(c, CHAINED, 1);
  c.emit({ t: 'text', uid: ch.uid, text: '닻사슬이 박혔다. 배가 끌려 내려간다', tone: 'bad' });
  return true;
}

/** 닻사슬이 끊어졌다 (쓰러뜨림): 배가 떠올라 물이 빠진다. 선장은 한동안 다시 던지지 않는다 */
export function cutChain(c: Combat, ch: EnemyUnit) {
  if (!chainAlive(c)) setPlayerSt(c, CHAINED, 0);
  const cap = c.alive.find((x) => x.def === 'captain');
  if (cap) cap.mem.chainAt = c.s.turn;
  const lv = waterLevel(c);
  if (lv <= 0) {
    c.emit({ t: 'text', uid: ch.uid, text: '닻사슬이 끊어졌다', tone: 'good' });
    return;
  }
  setWater(c, lv - CHAIN_DRAIN);
  c.emit({ t: 'text', uid: ch.uid, text: '닻사슬이 끊어지자 배가 떠오른다', tone: 'good' });
}

/** 선장이 쓰러지면 사슬도 힘을 잃고 가라앉는다 (처치가 아니다 — 물을 빼지 않는다) */
export function dropChain(c: Combat) {
  for (const x of c.alive) if (x.def === CHAIN) vanish(c, x);
  setPlayerSt(c, CHAINED, 0);
}

// ── 물속의 손 (망령 선장) ──
// 망령 선장의 차례가 끝날 때 물이 HANDS_WATER 이상이면, 다음 내 턴에 쓸 수 있는 장착 기술 중 행동력이 가장 큰 것(같으면 왼쪽)을
// 붙잡는다 — 그 턴 동안 쓸 수 없고, 턴이 끝나면 놓는다. 익사체를 쓰러뜨리거나 물이 빠지면(물 빼기·닻사슬·붕괴) 곧바로 놓는다.
// 무기·방어 기본기는 장착 칸에 없어 붙잡히지 않는다 (늘 할 것이 남는다).
// 표본 채집과 같은 표식(선장의 mem.specimen)이라 대기를 되돌리는 효과로는 풀리지 않는다. 대기는 '1턴'으로 보인다.

/** 붙잡은 기술의 대기 (다음 내 턴이 시작되며 1 줄어 '1턴'으로 보인다) */
const GRIP_LOCK = 2;

/** 기술을 붙잡고 있는 선장 (쓰러진 선장도 — 쓰러지는 순간 놓게) */
function gripper(c: Combat): EnemyUnit | undefined {
  return c.s.enemies.find((x) => x.def === 'captain' && (x.mem.specimen ?? 0) > 0);
}

/**
 * 물속의 손이 붙잡을 기술: 다음 내 턴에 쓸 수 있는 장착 기술(대기 1 이하) 중 행동력이 가장 큰 것, 같으면 왼쪽.
 * 손이 지금 쥔 기술은 턴이 끝나면 놓으니 다시 붙잡을 수 있는 것으로 본다. 다른 적이 쥔 기술·전투당 1회를 다 쓴 기술은 뺀다
 */
export function graspTarget(c: Combat): { uid: string; i: number } | null {
  const own = gripper(c);
  const held = new Set(c.s.enemies.filter((x) => !x.dead && x !== own && x.mem.specimen).map((x) => x.mem.specimen - 1));
  let best: { uid: string; i: number; cost: number } | null = null;
  for (let i = 0; i < c.run.slots.length; i++) {
    const uid = c.run.slots[i];
    // 대기 1은 다음 내 턴이 시작되며 풀린다 (방금 쓴 기술도 붙잡힌다)
    if (!uid || held.has(i) || (c.s.cd[uid] ?? 0) > 1) continue;
    const info = c.skillInfo(uid);
    if (!info) continue;
    const cost = c.costOf(info);
    if (!best || cost > best.cost) best = { uid, i, cost };
  }
  return best ? { uid: best.uid, i: best.i } : null;
}

/** 물속의 손이 기술 하나를 붙잡는다 (망령 선장 차례가 끝날 때). 처음엔 유리에 손바닥이 닿는다 */
export function grabSkill(c: Combat, cap: EnemyUnit): boolean {
  if (c.over || cap.dead || gripper(c)) return false;
  const t = graspTarget(c);
  if (!t) {
    c.emit({ t: 'text', uid: 'p', text: '물속의 손이 빈 물만 움켜쥔다', tone: 'good' });
    return false;
  }
  cap.mem.specimen = t.i + 1;
  cap.mem.gripCd = c.s.cd[t.uid] ?? 0;
  cap.mem.gripAt = c.s.turn;
  c.s.cd[t.uid] = GRIP_LOCK;
  const name = skillName(c, t.uid);
  c.emit({ t: 'text', uid: 'p', text: `물속의 손이 「${name}」${josa(name, '을')} 붙잡았다`, tone: 'bad' });
  if (!c.s.vars['a1-gripSeen']) {
    c.s.vars['a1-gripSeen'] = 1;
    cine(c, 'handprints', { uid: cap.uid, n: 4 });
  }
  return true;
}

/** 붙잡은 기술을 놓는다 (붙잡고 있던 동안 지난 턴만큼 원래 대기도 흘렀다) */
export function loosenHands(c: Combat, why: string) {
  const cap = gripper(c);
  if (!cap) return;
  const i = cap.mem.specimen - 1;
  cap.mem.specimen = 0;
  const uid = c.run.slots[i];
  if (!uid) return;
  const left = (cap.mem.gripCd ?? 0) - (c.s.turn - (cap.mem.gripAt ?? c.s.turn));
  if (left > 0) c.s.cd[uid] = left;
  else delete c.s.cd[uid];
  c.emit({ t: 'text', uid: 'p', text: `${why}: 「${skillName(c, uid)}」`, tone: 'good' });
}

/** 붙잡힌 기술은 내 턴 내내 잠겨 있다 (턴이 시작되며 대기가 줄어도) */
function keepGrip(c: Combat) {
  const cap = gripper(c);
  const uid = cap && !cap.dead ? c.run.slots[cap.mem.specimen - 1] : null;
  if (uid) c.s.cd[uid] = Math.max(1, c.s.cd[uid] ?? 0);
}

/** 선장 차례가 끝났을 때의 물 높이 — 지금 의도대로라면 (물속의 손 미리보기) */
function waterAfter(c: Combat, cap: EnemyUnit): number {
  const lv = waterLevel(c);
  const move = cap.intent?.move;
  // 붕괴·기절로 쉬는 차례엔 차오르지 않는다. 만조가 닿으면 잠긴 뒤 한 칸 빠진다
  if (cap.broken === 2 || (cap.st.stun ?? 0) > 0) return lv;
  if (move === 'hightide') return lv >= WATER_MAX ? WATER_MAX - 1 : lv;
  const chain = chainAlive(c) || move === 'chain' ? CHAIN_RISE : 0;
  return Math.min(WATER_MAX, lv + 1 + chain + (move === 'choir' ? CHOIR_WATER : 0));
}

/** 물속의 손의 지금 모습 (칩): 붙잡은 기술, 아니면 선장 차례가 끝나면 붙잡을 기술 */
function handsNote(c: Combat): TurnNote | null {
  const cap = c.alive.find((x) => x.def === 'captain' && x.form);
  if (!cap) return null;
  const base = { icon: 'gi:skeletal-hand', title: '물속의 손', bad: true };
  const own = gripper(c);
  if (own && !own.dead) {
    const uid = c.run.slots[own.mem.specimen - 1];
    const name = uid ? skillName(c, uid) : '기술';
    return { ...base, text: name, now: true, desc: `「${name}」${josa(name, '을')} 붙잡고 있다. 이번 턴엔 쓸 수 없고, 턴이 끝나면 놓는다. 익사체를 쓰러뜨리거나 물을 빼면 곧바로 놓는다` };
  }
  const t = graspTarget(c);
  if (!t) return null;
  const name = skillName(c, t.uid);
  const after = waterAfter(c, cap);
  return after >= HANDS_WATER
    ? { ...base, text: name, now: true, desc: `선장 차례가 끝나면 물이 ${after}까지 차 있어 「${name}」${josa(name, '을')} 붙잡는다 (다음 내 턴 동안 쓸 수 없다). 그때 물이 ${HANDS_WATER} 아래로 남게 빼 두면 막는다` }
    : { ...base, text: name, now: false, desc: `선장 차례가 끝나도 물이 ${after}뿐이라 붙잡지 못한다 (물이 ${HANDS_WATER} 이상이면 「${name}」${josa(name, '을')} 붙잡는다)` };
}

// ───────────── 교단 집행자: 판결 ─────────────

/** 판결을 내린다: 집행자의 다음 차례가 오기 전까지 (내 턴의 피해 + 그 차례에 터지는 지속 피해) VERDICT_DMG를 채우지 못하면 유죄 */
export function sentence(c: Combat, e: EnemyUnit) {
  setPlayerSt(c, TRIAL, VERDICT_DMG);
  trialObjective(c, e, VERDICT_DMG);
  e.mem.verdictAt = c.s.turn;
  c.emit({ t: 'text', uid: e.uid, text: `판결: 피해 ${VERDICT_DMG}로 무죄를 증명하라`, tone: 'eldritch' });
}

/** 목표 띠: 무죄를 증명하는 법 (남은 피해는 집행자가 맞을 때마다 줄어든다). 봇도 이 띠를 보고 집행자를 친다 */
function trialObjective(c: Combat, e: EnemyUnit, need: number) {
  setObjective(c, { text: `무죄를 증명하라: 집행자에게 피해 ${need}`, hit: { uid: e.uid, need }, fail: `유죄: 정신력 -${GUILTY_SAN}, 취약 ${GUILTY_VULN}` });
}

/** 판결 중 집행자가 맞은 피해를 센다 (방어도에 막힌 몫 포함, 내 턴의 피해와 지속 피해). 다 채우면 무죄 */
export function plead(c: Combat, e: EnemyUnit, amount: number, dot = false) {
  const left = c.p.st[TRIAL] ?? 0;
  if (left <= 0 || amount <= 0 || (c.s.phase !== 'player' && !dot)) return;
  const rest = left - amount;
  if (rest > 0) {
    setPlayerSt(c, TRIAL, rest);
    trialObjective(c, e, rest);
    return;
  }
  setPlayerSt(c, TRIAL, 0);
  if (c.s.obj?.hit?.uid === e.uid) setObjective(c, null);
  c.emit({ t: 'text', uid: e.uid, text: '무죄. 판결이 뒤집혔다', tone: 'good' });
  if (!e.dead) chipPoise(c, e, ACQUIT_POISE);
}

/** 집행자의 차례가 왔다 (지속 피해가 터진 뒤, 행동하기 전): 아직 판결이 남아 있으면 유죄 */
export function judge(c: Combat) {
  if ((c.p.st[TRIAL] ?? 0) <= 0 || c.over) return;
  setPlayerSt(c, TRIAL, 0);
  setObjective(c, null);
  c.emit({ t: 'text', uid: 'p', text: '유죄', tone: 'bad' });
  cine(c, 'scrawl', { text: '유죄' });
  c.loseSanity(GUILTY_SAN, true);
  if (!c.over) c.apply(c.p, 'vuln', GUILTY_VULN, null);
}

// ───────────── 거대 게: 무기 물림 ─────────────

/** 집게가 무기를 문다: 무기 기본 공격을 쓸 수 없다 */
export function clampWeapon(c: Combat, e: EnemyUnit): boolean {
  if ((c.p.st[DISARMED] ?? 0) > 0 || c.over) return false;
  e.mem.clamp = 1;
  e.mem.clampLeft = CLAMP_TURNS;
  c.s.cd.weapon = 99;
  setPlayerSt(c, DISARMED, 1);
  c.emit({ t: 'text', uid: 'p', text: '집게가 무기를 물었다', tone: 'bad' });
  return true;
}

/** 집게가 무기를 놓는다 */
export function freeWeapon(c: Combat, why: string) {
  for (const x of c.s.enemies) delete x.mem.clamp;
  if ((c.s.cd.weapon ?? 0) >= 90) delete c.s.cd.weapon;
  if ((c.p.st[DISARMED] ?? 0) <= 0) return;
  setPlayerSt(c, DISARMED, 0);
  c.emit({ t: 'text', uid: 'p', text: why, tone: 'good' });
}

// ───────────── 바다 무덤의 망령: 손자국 ─────────────

export function handprints(c: Combat): number {
  return c.p.st[HANDPRINT] ?? 0;
}

/** 손자국이 남는다 (최대 HANDPRINT_MAX) */
export function leavePrint(c: Combat, e: EnemyUnit) {
  const n = handprints(c);
  if (n >= HANDPRINT_MAX || c.over) return;
  setPlayerSt(c, HANDPRINT, n + 1);
  c.emit({ t: 'text', uid: e.uid, text: '유리에 손자국이 남았다', tone: 'eldritch' });
}

// ───────────── 상태 ─────────────

reg.statuses([
  {
    id: DAZZLE,
    name: '눈부심',
    icon: 'gi:blindfold',
    kind: 'debuff',
    desc: '섬광에 눈이 멀었다. 이번 턴 적의 의도가 보이지 않는다 (힘을 모은 큰 공격만 보인다). 등명기를 깨면 걷힌다. 등명기는 후열에 있어도 근접으로 닿는다',
    tickStart(c, u) {
      if (isEnemy(u)) return;
      veil(c);
      c.emit({ t: 'text', uid: 'p', text: '눈앞이 하얗다. 아무것도 보이지 않는다', tone: 'bad' });
    },
    tickEnd(c, u) {
      if (isEnemy(u)) {
        delete u.st[DAZZLE];
        return;
      }
      unveil(c);
      setPlayerSt(c, DAZZLE, 0);
    },
    hooks: {
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || victim.def !== 'lamp') return;
        unveil(c);
        setPlayerSt(c, DAZZLE, 0);
        c.emit({ t: 'text', uid: 'p', text: '등명기가 깨지자 눈앞이 걷힌다', tone: 'good' });
      },
    },
  },
  {
    id: HOOKED,
    name: '낚싯바늘',
    icon: 'gi:fishing-hook',
    kind: 'debuff',
    desc: '기술 하나가 낚싯바늘에 걸려 쓸 수 없다. 팽팽한 낚싯줄을 쓰러뜨려 끊거나 어부를 붕괴시키면 되찾는다. 끊지 못하면 낚싯줄의 두 번째 차례에 낚아 간다',
    tickStart(c, u) {
      if (!isEnemy(u)) keepHeld(c);
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.mem.hook) cutLine(c, victim, '붕괴로 낚싯줄이 끊어졌다');
      },
    },
  },
  {
    id: CAUGHT,
    name: '낚인 기술',
    icon: 'gi:fishing-pole',
    kind: 'debuff',
    desc: '어부가 기술 하나를 낚아 갔다. 어부가 본모습을 드러내거나 쓰러지면 되찾는다',
    tickStart(c, u) {
      if (!isEnemy(u)) keepHeld(c);
    },
  },
  {
    id: CHARMED,
    name: '매혹',
    icon: 'gi:musical-notes',
    kind: 'debuff',
    desc: '심연의 노래에 홀렸다. 내 턴이 시작될 때 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `노래가 귓가에 맴돈다 (행동력 -${n})`, tone: 'bad' });
      c.clear(u, CHARMED);
    },
  },
  {
    id: GASP,
    name: '헐떡임',
    icon: 'gi:drowning',
    kind: 'debuff',
    desc: '만조에 잠겼다 나왔다. 내 턴이 시작될 때 행동력 -{n}',
    tickStart(c, u, n) {
      if (isEnemy(u)) return;
      c.s.ap = Math.max(1, c.s.ap - n);
      c.emit({ t: 'text', uid: 'p', text: `물을 토해 낸다 (행동력 -${n})`, tone: 'bad' });
      c.clear(u, GASP);
    },
  },
  {
    id: FLOOD,
    name: '침수',
    icon: 'gi:drowning',
    kind: 'debuff',
    desc: `물이 {n}/${WATER_MAX}까지 찼다. 선장이 행동할 때마다 1씩 차오른다 (닻사슬이 박혀 있으면 ${CHAIN_RISE} 더). ${WATER_MAX}이 되면 숨이 막혀 내 턴이 시작될 때 행동력 -1, 선장은 「만조」를 부른다. 다음 선장 차례까지 물을 빼지 못하면 물에 잠겨 최대 체력의 ${Math.round(TIDE_DMG * 100)}% 피해, 다음 턴 행동력 -${TIDE_AP} (만조가 몰려오는 턴엔 숨을 참아 행동력이 줄지 않는다). 한 턴에 선장에게 피해 ${BAIL_DMG} 이상을 주거나 익사체를 쓰러뜨리면 1, 닻사슬을 끊으면 ${CHAIN_DRAIN}, 선장을 붕괴시키면 모두 빠진다. 선장 차례에 터지는 출혈·독·화상도 센다`,
    tickStart(c, u, n) {
      // 만조가 몰려오는 턴엔 숨을 참는다 (만조를 막을 행동력은 남겨 둔다)
      if (isEnemy(u) || n < WATER_MAX || c.s.vars[TIDE]) return;
      c.s.ap = Math.max(1, c.s.ap - 1);
      c.emit({ t: 'text', uid: 'p', text: '숨이 막힌다 (행동력 -1)', tone: 'bad' });
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit !== c.p || victim.def !== 'captain' || waterLevel(c) <= 0) return;
        setWater(c, 0);
        c.emit({ t: 'text', uid: victim.uid, text: '선장이 무너지자 물이 빠져나간다', tone: 'good' });
      },
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || waterLevel(c) <= 0) return;
        if (victim.def === 'captain') {
          setWater(c, 0);
          c.emit({ t: 'text', uid: 'p', text: '배의 저주가 풀려 물이 빠진다', tone: 'good' });
        } else if (victim.def === 'drowned') {
          setWater(c, waterLevel(c) - 1);
          c.emit({ t: 'text', uid: 'p', text: '익사체가 쓰러지며 물이 빠진다', tone: 'good' });
        }
      },
    },
  },
  {
    id: CHAINED,
    name: '닻사슬',
    icon: 'gi:sinking-ship',
    kind: 'debuff',
    desc: `닻사슬이 배를 끌어내린다. 선장이 행동할 때마다 물이 ${CHAIN_RISE} 더 차오른다. 닻사슬을 쓰러뜨려 끊으면 물이 ${CHAIN_DRAIN} 빠진다. 닻사슬은 후열에 있어도 근접으로 닿는다`,
  },
  {
    id: HANDS,
    name: '물속의 손',
    icon: 'gi:skeletal-hand',
    kind: 'debuff',
    desc: `배가 두 동강 난 뒤로 물속에서 손이 뻗어 온다. 망령 선장의 차례가 끝날 때 물이 {n} 이상이면, 다음 내 턴에 쓸 수 있는 기술 중 행동력이 가장 큰 것(같으면 왼쪽)을 붙잡아 그 턴 동안 쓸 수 없게 한다. 턴이 끝나면 놓는다. 익사체를 쓰러뜨리거나 물을 빼면 (선장에게 한 턴에 피해 ${BAIL_DMG}, 닻사슬 끊기, 선장 붕괴) 곧바로 놓는다. 무기·방어 기본기는 붙잡지 않는다`,
    tickStart(c, u) {
      if (!isEnemy(u)) keepGrip(c);
    },
    // 그 턴만 붙잡는다
    tickEnd(c, u) {
      if (!isEnemy(u)) loosenHands(c, '손이 스르르 풀렸다');
    },
    hooks: {
      turnNote: (c) => handsNote(c),
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim)) return;
        if (victim.def === 'drowned') loosenHands(c, '익사체가 쓰러지자 손이 놓았다');
        else if (victim.def === 'captain') {
          loosenHands(c, '선장이 쓰러지자 손이 흩어졌다');
          setPlayerSt(c, HANDS, 0);
        }
      },
    },
  },
  {
    id: TRIAL,
    name: '판결',
    icon: 'gi:banging-gavel',
    kind: 'debuff',
    desc: `집행자의 차례가 오기 전까지 집행자에게 피해를 {n} 더 주지 못하면 유죄: 정신력 -${GUILTY_SAN}, 취약 ${GUILTY_VULN}. 다 채우면 무죄: 집행자 버팀 -${ACQUIT_POISE}. 방어도에 막힌 피해와 집행자 차례에 터지는 출혈·독·화상도 센다`,
    hooks: {
      onAnyDeath(c, s, victim) {
        if (s.unit !== c.p || !isEnemy(victim) || victim.def !== 'enforcer') return;
        setPlayerSt(c, TRIAL, 0);
        if (c.s.obj?.hit?.uid === victim.uid) setObjective(c, null);
        c.emit({ t: 'text', uid: 'p', text: '재판관이 쓰러졌다. 판결은 무효다', tone: 'good' });
      },
    },
  },
  {
    id: DISARMED,
    name: '무기 물림',
    icon: 'gi:pincers',
    kind: 'debuff',
    desc: `거대 게의 집게가 무기를 물고 있어 무기 기본 공격을 쓸 수 없다. ${CLAMP_TURNS}턴 뒤에 놓는다. 게를 붕괴시키거나 쓰러뜨리면 곧바로 놓는다`,
    tickStart(c, u) {
      if (isEnemy(u)) return;
      // 대기를 되돌리는 기술로 잠깐 빼내도, 게가 물고 있는 한 다시 문다
      if (c.alive.some((x) => x.mem.clamp)) c.s.cd.weapon = 99;
      else freeWeapon(c, '집게가 무기를 놓았다');
    },
    hooks: {
      onBreak(c, s, victim) {
        if (s.unit === c.p && victim.mem.clamp) freeWeapon(c, '붕괴로 집게가 무기를 놓았다');
      },
      onAnyDeath(c, s, victim) {
        if (s.unit === c.p && isEnemy(victim) && victim.mem.clamp) freeWeapon(c, '집게가 무기를 놓았다');
      },
    },
  },
  {
    id: HANDPRINT,
    name: '손자국',
    icon: 'gi:open-palm',
    kind: 'debuff',
    desc: `유리에 남은 망령의 손자국 {n}개. '바다 무덤으로'의 손이 그만큼 늘어난다 (최대 ${HANDPRINT_MAX}). 끌어내리면 사라진다`,
  },
]);
