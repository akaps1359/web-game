import { reg, ENCOUNTERS, MADNESS, RELICS, RUNES } from '../../engine/registry';
import { finish } from '../../engine/events';
import { advanceTime, distances } from '../../engine/dungeon';
import {
  canUpgradeSkill,
  gainSanityRun,
  hurtRun,
  loseSanityRun,
  rng,
  rollConsumable,
  rollEquip,
  rollForbidden,
  rollRelic,
  rollRune,
  rollSkills,
  upgradeSkill,
  type LootItem,
  type RunState,
} from '../../engine/run';
import { floorFoes, learnWeak, weakNote } from '../eventkit';

/** 체스 두는 자: 통찰 1당 이길 확률 (기본 45%, 최대 75% — 통찰 4면 최대) */
const CHESS_BASE = 0.45;
const CHESS_PER = 0.075;
const CHESS_MAX = 0.75;

/** 정신력 손실 + 붕괴 메시지 */
function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다 — ${MADNESS.get(r.madness)?.name ?? '광기'}.`;
  return '';
}

/** 이 층의 일반/정예 조우 (균열·추적자·군주 제외) */
function encPool(run: RunState, kind: 'normal' | 'elite') {
  return ENCOUNTERS.filter(
    (e) =>
      e.act === run.act &&
      e.kind === kind &&
      !e.early &&
      // 가중치 0 = 특정 이벤트 전용 전투 (미고의 원통·틴달로스의 사냥개 등) — 무작위로 고르지 않는다
      (e.weight ?? 1) > 0 &&
      !e.id.startsWith('rift') &&
      !e.id.startsWith('stalker') &&
      !e.id.startsWith('lord'),
  );
}

function pickEnc(run: RunState, kind: 'normal' | 'elite'): string | null {
  const pool = encPool(run, kind);
  return pool.length ? rng(run, 'event').pick(pool).id : null;
}

/** 무작위 스킬 n개 강화. 실제 강화한 수 반환 */
function upgradeRandom(run: RunState, n: number): number {
  let done = 0;
  for (let i = 0; i < n; i++) {
    const cands = run.skills.filter((s) => canUpgradeSkill(run, s));
    if (!cands.length) break;
    if (upgradeSkill(run, rng(run, 'event').pick(cands).uid)) done++;
  }
  return done;
}

/** 맞바꿀 수 있는 유물: 획득 효과(onGain)가 없는 일반 유물만 (되돌릴 수 없는 효과 방지) */
function tradeableRelics(run: RunState) {
  return run.relics.filter((r) => {
    const d = RELICS.get(r.id);
    return !!d && !d.onGain && d.rarity !== 'boss' && d.rarity !== 'special';
  });
}

reg.events([
  {
    id: 'x-rune-carver',
    title: '눈먼 각인사',
    icon: 'gi:rune-stone',
    acts: [1, 2, 3, 4],
    stages: {
      start: (run) => ({
        text: '붕대로 눈을 가린 노인이 어둠 속에서 돌을 깎고 있다. "기술에 새길 문양이 필요한가? 값은 네가 정해라."',
        choices: [
          {
            label: '골드로 치른다 (50 골드)',
            hint: '각인 1개',
            disabled: run.player.gold < 50 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 50;
              const id = rollRune(r);
              finish(e, '노인이 돌을 건넸다. 아직 따뜻하다.', { loot: id ? [{ kind: 'rune', id }] : [{ kind: 'gold', id: 'gold', n: 50 }] });
            },
          },
          {
            label: '피로 치른다',
            hint: '체력 -10, 희귀 각인',
            go: (r, e) => {
              const n = hurtRun(r, 10);
              const rares = [...RUNES.values()].filter((x) => x.rarity === 'rare');
              const id = rares.length ? rng(r, 'event').pick(rares).id : rollRune(r);
              finish(e, `끌이 손바닥을 갈랐다. 피가 문양의 홈을 따라 흘렀다. (체력 -${n})`, { loot: id ? [{ kind: 'rune', id }] : [] });
            },
          },
          {
            label: '기억으로 치른다',
            hint: '정신력 -12, 각인 2개',
            go: (r, e) => {
              const loot: LootItem[] = [];
              for (let i = 0; i < 2; i++) {
                const id = rollRune(r);
                if (id) loot.push({ kind: 'rune', id });
              }
              finish(e, '노인이 당신의 이마에 손을 얹었다. 어린 시절의 어떤 오후가 통째로 사라졌다.' + sanity(r, 12), { loot });
            },
          },
          { label: '그냥 지나간다', go: (_r, e) => finish(e, '끌 소리가 등 뒤에서 한참 이어졌다.') },
        ],
      }),
    },
  },
  {
    id: 'x-blood-altar',
    title: '피를 마시는 제단',
    icon: 'gi:sword-altar',
    acts: [1, 2, 3, 4],
    stages: {
      start: (run) => {
        const canSkill = run.skills.some((s) => canUpgradeSkill(run, s));
        const canGear = Object.values(run.equip).some((x) => x && x.lvl < 2);
        return {
          text: '검게 굳은 피로 덮인 제단. 홈이 파인 돌판이 무언가를 기다리며 미세하게 떨린다.',
          choices: [
            {
              label: '손목을 긋는다',
              hint: '최대 체력 -6, 무작위 스킬 2개 강화',
              disabled: !canSkill && '강화할 스킬이 없다',
              go: (r, e) => {
                const p = r.player;
                p.maxHp = Math.max(10, p.maxHp - 6);
                p.hp = Math.min(p.hp, p.maxHp);
                const n = upgradeRandom(r, 2);
                finish(e, `제단이 피를 삼키자 손끝에 낯선 감각이 깃들었다. (최대 체력 -6, 스킬 ${n}개 강화)`);
              },
            },
            {
              label: '정신을 바친다',
              hint: '정신력 -15, 장착한 장비 중 무작위 하나 강화',
              disabled: !canGear && '강화할 장비가 없다',
              go: (r, e) => {
                const items = Object.values(r.equip).filter((x): x is NonNullable<typeof x> => !!x && x.lvl < 2);
                const it = rng(r, 'event').pick(items);
                it.lvl++;
                finish(e, `제단의 홈을 타고 검은 빛이 장비에 스며들었다. (장비 강화 +${it.lvl})` + sanity(r, 15));
              },
            },
            {
              label: '제단을 닦아낸다',
              hint: '정신력 +8',
              go: (r, e) => finish(e, `굳은 피를 긁어내자 제단은 그저 돌이 되었다. (정신력 +${gainSanityRun(r, 8)})`),
            },
            { label: '떠난다', go: (_r, e) => finish(e, '돌판의 떨림이 멎었다. 다음 손님을 기다리는 것이다.') },
          ],
        };
      },
    },
  },
  {
    id: 'x-chess-player',
    title: '체스 두는 자',
    icon: 'gi:chess-king',
    acts: [2, 3, 4],
    stages: {
      start: (run) => ({
        text: '두건 쓴 형체가 빈 의자를 마주하고 체스를 두고 있다. 상대편의 말이 저절로 움직인다. 형체가 당신에게 빈자리를 가리킨다.',
        choices: [
          {
            label: '대국을 받아들인다',
            hint: '이기면 무작위 스킬 2개 강화, 지면 정신력 -15 (통찰이 높을수록 유리)',
            // 이겨도 얻을 것이 없으면 지는 위험만 남는다 (피의 제단·연회와 같은 규칙)
            disabled: !run.skills.some((s) => canUpgradeSkill(run, s)) && '강화할 스킬이 없다',
            go: (r, e) => {
              const win = rng(r, 'event').chance(Math.min(CHESS_MAX, CHESS_BASE + CHESS_PER * r.player.insight));
              if (win) {
                const n = upgradeRandom(r, 2);
                finish(e, `외통수. 형체가 고개를 숙이자 손끝에 수읽기의 감각이 남았다. (스킬 ${n}개 강화)`);
              } else finish(e, '당신의 왕이 쓰러지는 순간, 머릿속의 무언가도 함께 쓰러졌다.' + sanity(r, 15));
            },
          },
          {
            label: '판을 엎는다',
            hint: '전투',
            disabled: !encPool(run, 'normal').length && '아무도 응하지 않는다',
            go: (r, e) => {
              const enc = pickEnc(r, 'normal');
              if (enc) finish(e, '말들이 바닥에 흩어지자, 그림자 속의 하수인들이 일어섰다!', { fight: enc });
              else finish(e, '판이 뒤집혔지만 아무 일도 일어나지 않았다.');
            },
          },
          {
            label: '상대의 수를 훔쳐본다',
            hint: '이 층 적들의 약점을 알게 된다, 정신력 -10',
            go: (r, e) => {
              const names = learnWeak(r, floorFoes(r));
              finish(
                e,
                '보이지 않는 상대의 수가 보이기 시작했다. 그것은 체스가 아니었다. 판 위의 말들은 이 층의 것들이었고, 어느 말이 어디로 무너지는지 다 보였다.' +
                  weakNote(names) +
                  (names.length ? sanity(r, 10) : ''),
              );
            },
          },
          { label: '자리를 뜬다', go: (_r, e) => finish(e, '등 뒤에서 말이 놓이는 소리가 났다. "체크."') },
        ],
      }),
    },
  },
  {
    id: 'x-faceless-merchant',
    title: '얼굴 없는 상인',
    icon: 'gi:duality-mask',
    acts: [2, 3, 4],
    stages: {
      start: (run) => ({
        text: '가면 아래에 얼굴이 없는 상인이 진열장을 연다. "물건은 물건으로 사는 법이지."',
        choices: [
          {
            label: '유물을 맞바꾼다',
            hint: '무작위 유물 1개를 잃고 한 단계 귀한 유물 (희귀는 다른 희귀)',
            disabled: !tradeableRelics(run).length && '내놓을 유물이 없다',
            go: (r, e) => {
              const old = rng(r, 'event').pick(tradeableRelics(r));
              const oldDef = RELICS.get(old.id);
              // 잃기 전에 굴려서 같은 유물이 돌아오지 않게 한다
              const id = rollRelic(r, oldDef?.rarity === 'common' ? 'uncommon' : 'rare');
              if (!id) {
                finish(e, '상인이 진열장을 훑어보더니 고개를 저었다. "지금은 맞바꿀 게 없군."');
                return;
              }
              r.relics = r.relics.filter((x) => x.id !== old.id);
              finish(e, `상인이 ${oldDef?.name ?? '유물'}을(를) 가면 속으로 삼키고, 다른 것을 내밀었다.`, { loot: [{ kind: 'relic', id }] });
            },
          },
          {
            label: '장비를 맞바꾼다',
            hint: '가방의 무작위 장비 1개 → 다른 장비 (+1 강화)',
            disabled: !run.bag.length && '가방이 비어 있다',
            go: (r, e) => {
              const id = rollEquip(r, 'elite');
              if (!id) {
                finish(e, '"쓸 만한 게 없군." 상인이 진열장을 닫았다.');
                return;
              }
              const old = rng(r, 'event').pick(r.bag);
              r.bag = r.bag.filter((x) => x.uid !== old.uid);
              finish(e, '상인의 손이 가방 속으로 들어갔다 나왔다. 무게가 달라졌다.', { loot: [{ kind: 'equip', id, n: 1 }] });
            },
          },
          {
            label: '기억을 판다',
            hint: '골드 +50, 정신력 -8',
            go: (r, e) => {
              r.player.gold += 50;
              finish(e, '가면이 당신의 얼굴을 잠시 흉내 냈다. 주머니가 무거워졌다. (골드 +50)' + sanity(r, 8));
            },
          },
          { label: '거래하지 않는다', go: (_r, e) => finish(e, '"언젠가는 팔게 될 거야." 상인이 어둠 속으로 녹아들었다.') },
        ],
      }),
    },
  },
  {
    id: 'x-drowned-library',
    title: '물에 잠긴 서고',
    icon: 'gi:bookshelf',
    acts: [1],
    stages: {
      start: () => ({
        text: '무너진 서가 사이로 검은 물이 찰랑인다. 높은 선반에 젖지 않은 책 몇 권이 남아 있다.',
        choices: [
          {
            label: '쓸 만한 책을 찾는다',
            hint: '기술서 1개, 시간 +4',
            go: (r, e) => {
              advanceTime(r, 4);
              const [id] = rollSkills(r, 1, 'elite');
              finish(e, '몇 시간을 뒤진 끝에 쓸 만한 교본을 찾았다.', { loot: id ? [{ kind: 'skill', id }] : [{ kind: 'gold', id: 'gold', n: 30 }] });
            },
          },
          {
            label: '쇠사슬로 묶인 책을 연다',
            hint: '금기 스킬, 정신력 -10',
            go: (r, e) => {
              const [id] = rollForbidden(r, 1);
              finish(e, '사슬이 저절로 풀렸다. 책장이 넘어갈 때마다 누군가 숨을 쉬었다.' + sanity(r, 10), {
                loot: id ? [{ kind: 'skill', id }] : [],
              });
            },
          },
          {
            label: '책으로 불을 지핀다',
            hint: '등불 +30, 정신력 +5',
            go: (r, e) => {
              r.light = Math.min(100, r.light + 30);
              finish(e, `종이 타는 냄새가 곰팡내를 덮었다. 잠시나마 따뜻하다. (등불 +30, 정신력 +${gainSanityRun(r, 5)})`);
            },
          },
        ],
      }),
    },
  },
  {
    id: 'x-lost-expedition',
    title: '실종된 탐사대',
    icon: 'gi:camping-tent',
    acts: [2, 3, 4],
    stages: {
      start: (run) => ({
        text: '찢어진 천막과 꺼진 모닥불. 탐사대의 짐은 그대로인데 사람은 없다. 발자국은 모두 한 방향, 더 깊은 곳을 향한다.',
        choices: [
          {
            label: '짐을 뒤진다',
            hint: '소모품 2개… 아마도',
            go: (r, e) => {
              const enc = rng(r, 'event').chance(0.35) ? pickEnc(r, 'normal') : null;
              if (enc) {
                finish(e, '천막 안의 침낭이 꿈틀거렸다. 안에 든 것은 사람이 아니었다!', { fight: enc });
                return;
              }
              const loot: LootItem[] = [];
              for (let i = 0; i < 2; i++) {
                const id = rollConsumable(r);
                if (id) loot.push({ kind: 'consumable', id });
              }
              loot.push({ kind: 'gold', id: 'gold', n: 20 });
              finish(e, '아직 쓸 만한 보급품을 챙겼다.', { loot });
            },
          },
          {
            label: '탐사 일지를 읽는다',
            hint: '주변 지도와 포탈 비석 위치, 정신력 -6',
            go: (r, e) => {
              const f = r.floor;
              if (f) {
                const d = distances(f, f.pos);
                for (const room of f.rooms) if (d[room.id] <= 2) room.seen = room.scouted = true;
                const portal = f.rooms[f.portal];
                if (portal) portal.seen = portal.scouted = true;
              }
              finish(e, '마지막 장에는 지도와 함께 한 문장이 적혀 있었다. "그것은 우리가 오기를 기다렸다."' + sanity(r, 6));
            },
          },
          {
            label: '발자국을 따라간다',
            hint: '정예 전투 (승리 시 유물)',
            disabled: !encPool(run, 'elite').length && '발자국이 어둠 속에서 끊겼다',
            go: (r, e) => {
              const enc = pickEnc(r, 'elite');
              if (enc) finish(e, '발자국이 끝나는 곳에서, 그것이 탐사대의 마지막 사람을 먹고 있었다.', { fight: enc });
              else finish(e, '발자국은 어둠 속에서 뚝 끊겼다.');
            },
          },
          { label: '떠난다', go: (_r, e) => finish(e, '꺼진 모닥불에서 아직 연기가 피어오르고 있었다.') },
        ],
      }),
    },
  },
]);
