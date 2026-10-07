import { MADNESS, reg, SKILLS } from '../../engine/registry';
import { finish } from '../../engine/events';
import { advanceTime, floorSignal, revealPath } from '../../engine/dungeon';
import { DMG_TYPES } from '../../engine/types';
import {
  canUpgradeSkill,
  gainSanityRun,
  healRun,
  hurtRun,
  learnSkill,
  loseSanityRun,
  rng,
  rollConsumable,
  rollEquip,
  rollForbidden,
  rollRelic,
  upgradeSkill,
  type LootItem,
  type RunState,
} from '../../engine/run';
import { FETUS } from './fetus';
import { INSIGHT_PRICE, cutMaxSanity, floorFoes, learnWeak, weakNote } from '../eventkit';

function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다. (${MADNESS.get(r.madness)?.name ?? '광기'})`;
  return '';
}

function upgradable(run: RunState) {
  return run.skills.filter((s) => canUpgradeSkill(run, s));
}

function relicLoot(run: RunState): LootItem[] {
  const id = rollRelic(run);
  return id ? [{ kind: 'relic', id }] : [{ kind: 'gold', id: 'gold', n: 45 }];
}

/** 5층 — 꿈꾸는 우주의 이벤트 */
reg.events([
  {
    id: 'a5-voice-below',
    title: '아래의 목소리',
    icon: 'gi:sleepy',
    acts: [5],
    stages: {
      start: () => ({
        text: '모든 소리가 사라졌다. 1층부터 당신을 부르던 그 목소리가 이제 바로 곁에서 들린다. 부르는 소리가 아니었다. 아주 큰 무언가가 꿈결에 중얼거리는 소리였다.',
        choices: [
          {
            label: '귀를 막고 버틴다',
            hint: '체력 +20, 정신력 +20',
            go: (r, e) => finish(e, `이를 악물고 현실을 붙잡았다. 중얼거림이 조금 멀어졌다. (체력 +${healRun(r, 20)}, 정신력 +${gainSanityRun(r, 20)})`),
          },
          {
            label: '잠꼬대에 귀 기울인다',
            hint: `통찰 +1, 최대 정신력 -${INSIGHT_PRICE.maxSanity}`,
            go: (r, e) => {
              r.player.insight += 1;
              cutMaxSanity(r, INSIGHT_PRICE.maxSanity);
              finish(
                e,
                `그것은 별보다 오래된 꿈을 꾸고 있었다. 꿈의 한 자락에 당신의 이름이 적혀 있다. 그 이름을 읽은 자리는 다시 메워지지 않는다. (통찰 +1, 최대 정신력 -${INSIGHT_PRICE.maxSanity})`,
              );
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a5-forerunners',
    title: '먼저 온 자들',
    icon: 'gi:lantern-flame',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '섬 가장자리 허공에 조사자들의 유해가 떠 있다. 모두 우주 한가운데를 향해 웅크린 채, 몇몇의 손에는 꺼진 등불이 들려 있다. 그중 한 사람의 얼굴이 낯익다.',
        choices: [
          {
            label: '그들의 장비를 챙긴다',
            hint: '정예 장비 1개, 정신력 -10',
            go: (r, e) => {
              const id = rollEquip(r, 'elite');
              finish(e, '죽은 손가락을 하나씩 펴서 쓸 만한 것을 꺼냈다. 그들은 끝까지 놓지 않으려 했다.' + sanity(r, 10), {
                loot: id ? [{ kind: 'equip', id }] : [{ kind: 'gold', id: 'gold', n: 60 }],
              });
            },
          },
          {
            label: '그들의 수기를 읽는다',
            hint: '스킬 1개 강화, 정신력 -10',
            disabled: !upgradable(run).length && '더 갈고닦을 기술이 없다',
            go: (r, e) => {
              const s = rng(r, 'event').pick(upgradable(r));
              upgradeSkill(r, s.uid);
              finish(
                e,
                '마지막 장에 밑줄이 그어져 있다. "목소리는 부르는 게 아니었다. 그것은 잠꼬대였다." 그 아래, 그들이 실패한 지점이 적혀 있다. (스킬 강화)' +
                  sanity(r, 10),
              );
            },
          },
          {
            label: '등잔의 기름을 모은다',
            hint: '등불 가득, 체력 +15',
            go: (r, e) => {
              r.light = 100;
              finish(e, `꺼진 등잔들에서 남은 기름을 모았다. 이제 그들의 빛이 앞길을 비춘다. (등불 가득, 체력 +${healRun(r, 15)})`);
            },
          },
          {
            label: '그들을 위해 기도한다',
            hint: '정신력 +20',
            go: (r, e) => finish(e, `이름 모를 이들을 위해 잠시 눈을 감았다. 그들처럼 되지는 않을 것이다. (정신력 +${gainSanityRun(r, 20)})`),
          },
        ],
      }),
    },
  },
  {
    id: 'a5-starry-rite',
    title: '끝나지 않는 자장가',
    icon: 'gi:star-altar',
    acts: [5],
    stages: {
      start: () => ({
        text: '떠도는 섬의 제단 앞에서 교단원들이 자장가를 부르고 있다. 그들은 태아를 깨우려는 것이 아니다. 그것이 영원히 태어나지 않기를, 이 꿈이 끝나지 않기를 빌고 있다.',
        choices: [
          {
            label: '숨어서 노랫말을 엿듣는다',
            hint: '별의 태아의 약점을 모두 알게 된다, 정신력 -12',
            go: (r, e) => {
              r.knownWeak = { ...r.knownWeak, [FETUS]: [...DMG_TYPES] };
              finish(e, '자장가는 태아의 세 모습을 노래하고 있었다. 잠든 몸, 깨어나는 알, 태어난 것. 그 틈새가 머릿속에 새겨졌다. (별의 태아의 약점 공개)' + sanity(r, 12));
            },
          },
          {
            label: '노래에 목소리를 보탠다',
            hint: '최대 체력 +15, 정신력 -25',
            go: (r, e) => {
              r.player.maxHp += 15;
              r.player.hp += 15;
              finish(e, '별빛이 담긴 잔을 함께 비우고 자장가를 불렀다. 몸이 꿈의 무게에 맞게 다시 빚어졌다. (최대 체력 +15)' + sanity(r, 25));
            },
          },
          {
            label: '노래를 끊는다',
            hint: '정예 전투',
            go: (_r, e) => finish(e, '제단을 걷어차자 대사제가 천천히 고개를 돌렸다. 그 앞으로 검은 덩어리가 굴러 나온다!', { fight: 'a5-elite-hierophant' }),
          },
        ],
      }),
    },
  },
  {
    id: 'a5-star-cradle',
    title: '별의 요람',
    icon: 'gi:star-formation',
    acts: [5],
    stages: {
      start: () => ({
        text: '성운이 소용돌이치는 요람 한가운데서 별 하나가 태어나려 한다. 빛이 맥박처럼 뛸 때마다 발밑의 섬이 함께 떨린다. 아주 먼 곳에서, 훨씬 큰 무언가도 같은 박자로 뛰고 있다.',
        choices: [
          {
            label: '갓 태어난 빛에 손을 뻗는다',
            hint: '유물, 정신력 -12',
            go: (r, e) => finish(e, '손끝이 타는 듯하더니 별의 조각 하나가 손바닥에 남았다. 아직 따뜻하다.' + sanity(r, 12), { loot: relicLoot(r) }),
          },
          {
            label: '탄생을 지켜본다',
            hint: '최대 정신력 +5, 정신력 +15, 시간 +2',
            go: (r, e) => {
              r.player.maxSanity += 5;
              const s = gainSanityRun(r, 15);
              advanceTime(r, 2);
              finish(e, `별이 눈을 떴다. 무섭도록 아름다웠다. 이 우주가 꿈이라 해도, 이 순간만은 진짜였다. (최대 정신력 +5, 정신력 +${s})`);
            },
          },
          {
            label: '요람을 깨뜨린다',
            hint: '전투',
            go: (_r, e) => finish(e, '요람에 금이 가자 성운이 몸부림쳤다. 그 그늘에서 별을 삼키던 것이 고개를 든다!', { fight: 'a5-nursery' }),
          },
        ],
      }),
    },
  },
]);

// ───────────── 꿈의 땅 — 2026-10 개편 때 3층(꿈의 경계)에서 옮겨 왔다 (id 접두사 a3- → a5-) ─────────────

reg.events([
  {
    id: 'a5-strange-bed',
    title: '낯선 침대',
    icon: 'gi:bed',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '별빛 사이에 낡은 침대가 떠 있다. 이불은 아직 따뜻하고 베개에는 누군가 방금 일어난 듯한 자국이 남아 있다.',
        choices: [
          {
            label: '눕는다',
            hint: '체력 +30%, 정신력 +10, 시간 +6',
            disabled: run.relics.some((x) => x.id === 'sleeper-scale') && '비늘이 꿈틀거려 잠들 수 없다',
            go: (r, e) => {
              const half = r.madness.includes('insomnia') ? 0.5 : 1;
              const h = healRun(r, r.player.maxHp * 0.3 * half);
              const s = gainSanityRun(r, 10);
              advanceTime(r, 6);
              floorSignal(r, { t: 'event', id: 'a5-strange-bed', choice: 'sleep' });
              finish(e, `눕자마자 깊은 잠에 빠졌다. 꿈 한구석에서 누군가 그 꿈을 맛보며 입맛을 다셨다. (체력 +${h}, 정신력 +${s})`);
            },
          },
          {
            label: '베개를 뜯어 본다',
            hint: '이 층 적들의 약점을 알게 된다, 정신력 -10',
            go: (r, e) => {
              const names = learnWeak(r, floorFoes(r));
              finish(
                e,
                '베개 속에는 깃털 대신 누군가의 꿈이 가득 차 있었다. 이 꿈속을 떠도는 것들에게 쫓기는 꿈이었다. 꿈꾼 이는 그것들이 무엇에 약한지 알고 있었다.' +
                  weakNote(names) +
                  (names.length ? sanity(r, 10) : ''),
              );
            },
          },
          {
            label: '침대 밑을 살핀다',
            hint: '무언가 있을지도…',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.5)) {
                r.player.gold += 40;
                finish(e, '먼지 속에서 누군가 잃어버린 돈주머니를 찾았다. (골드 +40)');
              } else finish(e, '침대 밑에서 잠든 사람들이 기어 나왔다. 눈은 감겨 있는데 손은 당신을 더듬어 찾는다!', { fight: 'a5-e-sleepers' });
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '몇 걸음 가다 돌아보니 침대는 사라지고 없었다.') },
        ],
      }),
    },
  },
  {
    id: 'a5-ulthar-cat',
    title: '울타르의 고양이',
    icon: 'gi:cat',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '눈이 달빛처럼 빛나는 검은 고양이가 앞을 막아선다. 울타르의 고양이들은 꿈의 땅에서 가장 오래된 수호자들이다. 이 섬까지 어떻게 왔을까. 고양이가 꼬리를 한 번 흔들더니 빤히 바라본다.',
        choices: [
          {
            label: '먹을 것을 나눠준다',
            hint: '소모품 1개 → 유물',
            disabled: !run.consumables.some(Boolean) && '줄 것이 없다',
            go: (r, e) => {
              const idx = r.consumables.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
              r.consumables[rng(r, 'event').pick(idx)] = null;
              finish(e, '고양이는 천천히 먹더니 어둠 속으로 사라졌다. 그 자리에 작은 선물이 놓여 있었다.', { loot: relicLoot(r) });
            },
          },
          {
            label: '고양이를 따라간다',
            hint: '포탈 비석까지 가는 길이 드러난다, 시간 +2',
            go: (r, e) => {
              const f = r.floor;
              const portal = f ? f.rooms[f.portal] : null;
              if (f && portal) {
                portal.seen = portal.scouted = true;
                revealPath(f, f.pos, f.portal);
              }
              advanceTime(r, 2);
              finish(e, '고양이는 섬과 섬 사이를 몇 번이나 건너뛰더니 포탈 비석이 보이는 곳에서 꼬리를 감추었다.');
            },
          },
          { label: '쓰다듬는다', hint: '정신력 +14', go: (r, e) => finish(e, `고양이가 가르랑거린다. 이 꿈속에도 따뜻한 것이 있다. (정신력 +${gainSanityRun(r, 14)})`) },
        ],
      }),
    },
  },
  {
    id: 'a5-moon-galley',
    title: '달의 갤리선',
    icon: 'gi:galleon',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '별들 사이에 검은 갤리선이 떠 있다. 노는 뿔 달린 렝의 노예들이 젓는다. 갑판 위에서는 두꺼비 같은 달짐승들이 붉은 루비를 세고 있다.',
        choices: [
          {
            label: '등불 기름과 루비를 바꾼다',
            hint: '등불 -30, 골드 +70',
            disabled: run.light < 30 && '등불이 부족하다',
            go: (r, e) => {
              r.light -= 30;
              r.player.gold += 70;
              finish(e, '달짐승이 기름 냄새를 킁킁 맡더니 루비 한 줌을 내밀었다. 손이 끈적하다. (등불 -30, 골드 +70)');
            },
          },
          {
            label: '노예들의 사슬을 끊는다',
            hint: '정신력 +12, 전투',
            go: (r, e) => {
              const s = gainSanityRun(r, 12);
              finish(e, `사슬이 끊어지자 노예들이 별들 사이로 뛰어내렸다. 분노한 달짐승들이 갑판에서 내려온다! (정신력 +${s})`, { fight: 'a5-moonbeasts' });
            },
          },
          {
            label: '루비를 훔친다',
            hint: '골드 +50, 들킬지도',
            go: (r, e) => {
              r.player.gold += 50;
              if (rng(r, 'event').chance(0.5)) finish(e, '루비 주머니를 품에 넣고 어둠 속으로 빠져나왔다. (골드 +50)');
              else finish(e, '루비를 챙기는 순간 노예들의 창끝이 당신을 향했다! (골드 +50)', { fight: 'a5-galley' });
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '갤리선은 소리 없이 별들 사이로 미끄러져 갔다. 달을 향해.') },
        ],
      }),
    },
  },
  {
    id: 'a5-seventy-steps',
    title: '얕은 잠의 일흔 계단',
    icon: 'gi:stairs',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '희미한 빛이 새어 나오는 계단이 허공으로 이어진다. 꿈꾸는 자들은 이를 얕은 잠의 일흔 계단이라 부른다. 계단 끝 불꽃의 동굴에서 두 사제가 기다리고 있다.',
        choices: [
          {
            label: '끝까지 내려간다',
            hint: '체력 +20, 정신력 +15, 시간 +3',
            go: (r, e) => {
              const h = healRun(r, 20);
              const s = gainSanityRun(r, 15);
              advanceTime(r, 3);
              floorSignal(r, { t: 'event', id: 'a5-seventy-steps', choice: 'descend' });
              finish(e, `사제들이 이마에 손을 얹자 잠이 한층 깊어졌다. 깨어 보니 몸이 가볍다. (체력 +${h}, 정신력 +${s})`);
            },
          },
          {
            label: '계단을 하나하나 센다',
            hint: '포탈 비석까지 가는 길이 드러난다, 정신력 -6',
            go: (r, e) => {
              const f = r.floor;
              const portal = f ? f.rooms[f.portal] : null;
              if (f && portal) {
                portal.seen = portal.scouted = true;
                revealPath(f, f.pos, f.portal);
              }
              finish(e, '일흔 개가 아니었다. 위로 난 일흔한 번째 계단이 있었다. 그 끝에서 포탈 비석의 빛이 깜빡였다.' + sanity(r, 6));
            },
          },
          {
            label: '사제들에게 가르침을 청한다 (40 골드)',
            hint: '무작위 스킬 강화',
            disabled: (run.player.gold < 40 && '골드가 부족하다') || (!run.skills.some((s) => canUpgradeSkill(run, s)) && '강화할 스킬이 없다'),
            go: (r, e) => {
              r.player.gold -= 40;
              const s = rng(r, 'event').pick(r.skills.filter((x) => canUpgradeSkill(r, x)));
              upgradeSkill(r, s.uid);
              finish(e, `나스트와 카만타가 꿈속의 몸놀림을 보여 주었다. (${SKILLS.get(s.id)?.name ?? '기술'} 강화)`);
            },
          },
          { label: '돌아선다', go: (_r, e) => finish(e, '계단을 등지자 등 뒤의 빛이 천천히 꺼졌다.') },
        ],
      }),
    },
  },
  {
    id: 'a5-star-procession',
    title: '별빛 행렬',
    icon: 'gi:cowled',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '별빛 로브를 입은 순례자들이 소리 없이 줄지어 지나간다. 모두 우주 한가운데의 요람을 향해 걷고 있다. 그들이 지나간 자리마다 별가루가 눈처럼 쌓인다. 행렬 끝에 선 이가 손짓한다.',
        choices: [
          {
            label: '행렬에 합류한다',
            hint: '최대 체력 -6, 금기 스킬',
            go: (r, e) => {
              const [id] = rollForbidden(r, 1);
              if (!id) {
                finish(e, '몇 걸음을 함께 걸었지만 그들의 노래는 더 이상 새로운 것을 알려 주지 않았다.');
                return;
              }
              r.player.maxHp = Math.max(10, r.player.maxHp - 6);
              r.player.hp = Math.min(r.player.hp, r.player.maxHp);
              learnSkill(r, id);
              finish(e, `몇 걸음을 함께 걸었을 뿐인데 손끝이 별빛으로 부서져 흩어졌다. 대신 그들이 부르던 노래가 머릿속에 새겨졌다. (최대 체력 -6, ${SKILLS.get(id)?.name ?? '금기'} 습득)`);
            },
          },
          {
            label: '등불을 나눠준다',
            hint: '등불 -25, 정신력 +20, 최대 정신력 +4',
            disabled: run.light < 25 && '등불이 부족하다',
            go: (r, e) => {
              r.light -= 25;
              r.player.maxSanity += 4;
              const s = gainSanityRun(r, 20);
              finish(e, `순례자가 등불에서 불씨를 옮겨 갔다. 그 불씨가 별이 되어 요람으로 흘러간다. (등불 -25, 정신력 +${s}, 최대 정신력 +4)`);
            },
          },
          {
            label: '행렬을 가로막는다',
            hint: '전투',
            go: (_r, e) => finish(e, '순례자들이 일제히 고개를 돌렸다. 로브 아래에는 얼굴 대신 별빛이 흘러내린다!', { fight: 'a5-pilgrims' }),
          },
          { label: '지켜본다', go: (_r, e) => finish(e, '마지막 순례자가 별 사이로 사라지자 발자국도, 별가루도 사라졌다.') },
        ],
      }),
    },
  },
  {
    id: 'a5-dream-mirror',
    title: '꿈의 거울',
    icon: 'gi:mirror-mirror',
    acts: [5],
    stages: {
      start: (run) => {
        const p = run.player;
        const hp = p.hp / p.maxHp;
        const san = p.sanity / p.maxSanity;
        const look = san > hp + 0.05 ? '상처는 덜하지만 눈빛이 흐리다' : san < hp - 0.05 ? '상처투성이지만 눈빛이 맑다' : '당신과 꼭 닮았다';
        return {
          text: `별빛처럼 일렁이는 거울. 거울 속의 당신은 조금 늦게 움직인다. 그쪽은 ${look}.`,
          choices: [
            {
              label: '거울 속의 나와 자리를 바꾼다',
              hint: '체력과 정신력의 비율이 서로 뒤바뀐다',
              go: (r, e) => {
                const pp = r.player;
                const h = pp.hp / pp.maxHp;
                const s = pp.sanity / pp.maxSanity;
                pp.hp = Math.max(1, Math.min(pp.maxHp, Math.round(pp.maxHp * s)));
                pp.sanity = Math.max(1, Math.min(pp.maxSanity, Math.round(pp.maxSanity * h)));
                finish(e, `거울 속으로 걸어 들어갔다. 돌아보니 거울 밖의 당신이 손을 흔들고 있다. (체력 ${pp.hp}/${pp.maxHp}, 정신력 ${pp.sanity}/${pp.maxSanity})`);
              },
            },
            {
              label: '거울을 깨뜨린다',
              hint: '체력 -8, 유물',
              go: (r, e) => {
                const n = hurtRun(r, 8);
                finish(e, `거울 조각이 손을 베었다. 조각 하나에는 아직 무언가가 비친다. (체력 -${n})`, { loot: relicLoot(r) });
              },
            },
            { label: '외면한다', go: (_r, e) => finish(e, '거울 속의 당신은 끝까지 눈을 떼지 않았다.') },
          ],
        };
      },
    },
  },
  {
    id: 'a5-zoog-wood',
    title: '주그들의 숲',
    icon: 'gi:mushrooms',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '떠도는 섬 위로 거대한 버섯 숲이 자라 있다. 줄기 사이로 작은 눈들이 반짝인다. 파닥이는 소리로 말하는 주그들이 주위를 둘러싼다. 다들 등불을 몹시 탐내는 눈치다.',
        choices: [
          {
            label: '등불 기름을 나눠준다',
            hint: '등불 -30, 소모품 2개',
            disabled: run.light < 30 && '등불이 부족하다',
            go: (r, e) => {
              r.light -= 30;
              const loot: LootItem[] = [];
              for (let i = 0; i < 2; i++) {
                const id = rollConsumable(r);
                if (id) loot.push({ kind: 'consumable', id });
              }
              finish(e, '주그들이 기름을 핥아 먹고는 숲에서 주워 온 물건들을 내밀었다. (등불 -30)', { loot });
            },
          },
          {
            label: '달나무 술을 산다 (25 골드)',
            hint: '체력 +18, 정신력 +12, 통찰 -1',
            disabled: run.player.gold < 25 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 25;
              const h = healRun(r, 18);
              const s = gainSanityRun(r, 12);
              const lost = r.player.insight > 0 ? 1 : 0;
              r.player.insight -= lost;
              finish(e, `달나무 수액으로 빚은 술은 달고 어지러웠다. 무엇을 잊었는지조차 떠오르지 않는다. (체력 +${h}, 정신력 +${s}${lost ? ', 통찰 -1' : ''})`);
            },
          },
          {
            label: '그들의 수다를 엿듣는다',
            hint: '이 층의 지도 전체 공개, 등불 -20',
            go: (r, e) => {
              if (r.floor) for (const room of r.floor.rooms) room.seen = room.scouted = true;
              r.light = Math.max(0, r.light - 20);
              finish(e, '주그들의 수다에 어느 섬이 어디로 떠가는지가 섞여 있었다. 정신을 차려 보니 등불 심지가 갉아먹혀 있었다. (지도 공개, 등불 -20)');
            },
          },
          { label: '쫓아낸다', hint: '전투', go: (_r, e) => finish(e, '등불을 휘두르자 주그들이 작은 이빨을 드러냈다!', { fight: 'a5-e-zoogs' }) },
        ],
      }),
    },
  },
]);
