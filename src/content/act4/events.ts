import { josa } from '../../engine/josa';
import { ESSENCES, MADNESS, reg } from '../../engine/registry';
import { finish } from '../../engine/events';
import { advanceTime } from '../../engine/dungeon';
import {
  canUpgradeSkill,
  gainSanityRun,
  healRun,
  hurtRun,
  learnSkill,
  loseSanityRun,
  removeEssence,
  rng,
  rollConsumable,
  rollForbidden,
  rollRelic,
  upgradeSkill,
  type RunState,
} from '../../engine/run';
import { INSIGHT_PRICE, floorFoes, learnWeak, weakNote } from '../eventkit';

/** 정신력 손실 + 붕괴 메시지 */
function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다. (${MADNESS.get(r.madness)?.name ?? '광기'})`;
  return '';
}

function relicLoot(run: RunState, tier: 'boss' | 'any' = 'any') {
  const id = rollRelic(run, tier) ?? (tier === 'boss' ? rollRelic(run) : null);
  return id ? [{ kind: 'relic' as const, id }] : [{ kind: 'gold' as const, id: 'gold', n: 60 }];
}

/** 최대 정신력 감소 (최소 10) */
function cutMaxSanity(run: RunState, n: number) {
  const p = run.player;
  p.maxSanity = Math.max(10, p.maxSanity - n);
  p.sanity = Math.min(p.sanity, p.maxSanity);
}

/** 최대 체력 감소 (최소 1) */
function cutMaxHp(run: RunState, n: number) {
  const p = run.player;
  p.maxHp = Math.max(1, p.maxHp - n);
  p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
}

function upgradable(run: RunState) {
  return run.skills.filter((s) => canUpgradeSkill(run, s));
}

function pendingMeteors(run: RunState) {
  const f = run.floor;
  return f ? f.rooms.filter((x) => x.meteor !== undefined && !f.vars['meteor' + x.id]) : [];
}

reg.events([
  {
    id: 'a4-telescope',
    title: '거꾸로 놓인 망원경',
    icon: 'gi:telescope',
    acts: [4],
    stages: {
      start: (run) => ({
        text: '무너진 천문대. 놋쇠 망원경이 하늘이 아니라 발밑의 심연을 향해 있다. 렌즈 너머에서 무언가가 이쪽을 들여다본다.',
        choices: [
          {
            label: '렌즈를 들여다본다',
            hint: '이 층의 지도 전체 공개, 정신력 -10',
            go: (r, e) => {
              if (r.floor) for (const room of r.floor.rooms) room.seen = room.scouted = true;
              finish(e, '심연의 지도가 눈에 새겨졌다. 지도 역시 당신을 보았다.' + sanity(r, 10));
            },
          },
          {
            label: '별의 궤도를 다시 계산한다',
            hint: '아직 떨어지지 않은 유성이 모두 6시간 늦게 떨어진다, 정신력 -6',
            disabled: !pendingMeteors(run).length && '떨어질 유성이 남아 있지 않다',
            go: (r, e) => {
              for (const room of pendingMeteors(r)) {
                room.meteor = (room.meteor ?? 0) + 6;
                if (r.floor) delete r.floor.vars['meteorWarn' + room.id];
              }
              finish(e, '망원경의 눈금을 돌리자 하늘의 불덩이들이 머뭇거렸다. 별들이 그 계산대로 움직였다. 그게 더 두렵다.' + sanity(r, 6));
            },
          },
          {
            label: '망원경을 부순다',
            hint: '정신력 +8',
            go: (r, e) => finish(e, `유리가 깨지자 시선이 끊겼다. (정신력 +${gainSanityRun(r, 8)})`),
          },
        ],
      }),
    },
  },
  {
    id: 'a4-fallen-star',
    title: '떨어진 별',
    icon: 'gi:fragmented-meteor',
    acts: [4],
    stages: {
      start: () => ({
        text: '아직 뜨거운 운석 조각이 바닥에 박혀 있다. 표면의 무늬가 눈꺼풀처럼 천천히 깜빡인다.',
        choices: [
          {
            label: '맨손으로 쥔다',
            hint: '최대 체력 +8, 최대 정신력 -8',
            go: (r, e) => {
              r.player.maxHp += 8;
              r.player.hp += 8;
              cutMaxSanity(r, 8);
              finish(e, '손바닥이 타들어 갔지만 열기는 곧 혈관으로 스며들었다. 그 열이 가슴 안쪽에 자리를 잡았다. (최대 체력 +8, 최대 정신력 -8)');
            },
          },
          {
            label: '갈아서 삼킨다',
            hint: '체력 -12, 금기 스킬 1개',
            go: (r, e) => {
              const n = hurtRun(r, 12);
              const [id] = rollForbidden(r, 1);
              if (id) learnSkill(r, id);
              finish(e, `별의 가루가 목구멍을 긁으며 내려갔다. 머릿속에 낯선 말이 피어난다. (체력 -${n})`);
            },
          },
          {
            label: '무늬와 눈을 맞춘다',
            hint: '이 층 적들의 약점과 급소를 알게 된다, 정신력 -12',
            go: (r, e) => {
              const names = learnWeak(r, floorFoes(r));
              finish(
                e,
                '눈꺼풀이 열렸다. 그 안에는 별이 태어나기 전의 어둠이 있었다. 이 궁정의 것들이 그 어둠의 어느 틈에서 기어 나왔는지 보였다.' +
                  weakNote(names) +
                  (names.length ? sanity(r, 12) : ''),
              );
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '등 뒤에서 무늬가 계속 깜빡였다.') },
        ],
      }),
    },
  },
  {
    id: 'a4-court-feast',
    title: '끝나지 않는 연회',
    icon: 'gi:carnival-mask',
    acts: [4],
    stages: {
      start: (run) => ({
        text: '가면을 쓴 궁정인들이 끝없는 연회를 벌이고 있다. 단조로운 피리 소리에 맞춰 춤추던 이들이 빈자리를 권한다. 접시 위의 음식이 아직 꿈틀거린다.',
        choices: [
          {
            label: '춤에 끼어든다',
            hint: '무작위 스킬 2개 강화, 정신력 -18',
            disabled: !upgradable(run).length && '더 갈고닦을 기술이 없다',
            go: (r, e) => {
              const picks = rng(r, 'event').sample(upgradable(r), 2);
              for (const s of picks) upgradeSkill(r, s.uid);
              finish(e, `몸이 저절로 박자를 따랐다. 몇 시간인지 몇 년인지 모를 춤이 끝나자 손발이 낯설 만큼 날렵해져 있었다. (스킬 ${picks.length}개 강화)` + sanity(r, 18));
            },
          },
          {
            label: '음식을 먹는다',
            hint: '체력 +30, 최대 정신력 -6',
            go: (r, e) => {
              const n = healRun(r, 30);
              cutMaxSanity(r, 6);
              finish(e, `씹을 때마다 이 사이에서 작은 비명이 새어 나왔다. 배는 불렀다. (체력 +${n}, 최대 정신력 -6)`);
            },
          },
          {
            label: '가면을 벗긴다',
            hint: '전투',
            go: (_r, e) => finish(e, '가면 아래엔 아무것도 없었다. 연회가 일제히 당신을 향해 돌아섰다!', { fight: 'a4-court' }),
          },
          { label: '조용히 빠져나간다', go: (_r, e) => finish(e, '피리 소리가 한참 동안 귓속에 남았다.') },
        ],
      }),
    },
  },
  {
    id: 'a4-blind-throne',
    title: '눈먼 왕의 옥좌',
    icon: 'gi:stone-throne',
    acts: [4],
    stages: {
      start: () => ({
        text: '혼돈의 한가운데를 본뜬 빈 옥좌. 그 둘레를 무형의 피리꾼들이 맴돌며 단조로운 곡을 끝없이 분다. 옥좌는 누군가를 기다리고 있다.',
        choices: [
          {
            label: '옥좌에 앉는다',
            hint: '힘 +1 (영구), 최대 체력 -12, 정신력 -10',
            go: (r, e) => {
              r.player.str += 1;
              cutMaxHp(r, 12);
              finish(e, '앉는 순간 우주가 당신을 중심으로 돌기 시작했다. 일어서고 보니 옥좌에 살점 한 조각이 남아 있었다. (힘 +1, 최대 체력 -12)' + sanity(r, 10));
            },
          },
          {
            label: '곡조를 따라 흥얼거린다',
            hint: '의지 +1 (영구), 정신력 -12',
            go: (r, e) => {
              r.player.will += 1;
              finish(e, '곡조에는 끝도 시작도 없었다. 그 안에서 버티는 법을 배웠다. (의지 +1)' + sanity(r, 12));
            },
          },
          {
            label: '피리꾼들을 쫓아낸다',
            hint: '전투',
            go: (_r, e) => finish(e, '피리 소리가 뚝 끊겼다. 형체 없는 것들이 흘러온다!', { fight: 'a4-pipers' }),
          },
          { label: '떠난다', go: (_r, e) => finish(e, '옥좌는 여전히 기다린다. 언제까지나.') },
        ],
      }),
    },
  },
  {
    id: 'a4-yith-archive',
    title: '이스의 기록 보관소',
    icon: 'gi:bookshelf',
    acts: [4],
    stages: {
      start: (run) => ({
        text: '원뿔 모양의 존재들이 남긴 거대한 서고. 책마다 아직 일어나지 않은 일들이 적혀 있다. 한 권의 표지에 당신의 이름이 있다.',
        choices: [
          {
            label: '이름이 적힌 책을 펼친다',
            hint: '금기 스킬 1개, 정신력 -12',
            go: (r, e) => {
              const [id] = rollForbidden(r, 1);
              if (id) learnSkill(r, id);
              finish(e, '마지막 장은 비어 있었다. 대신 그 앞 장에서 쓸 만한 것을 찾았다.' + sanity(r, 12));
            },
          },
          {
            label: '지나간 싸움을 복기한다',
            hint: '스킬 1개 강화, 6시간이 흐른다 (조수가 차오를 수 있다)',
            disabled: !upgradable(run).length && '더 갈고닦을 기술이 없다',
            go: (r, e) => {
              const s = rng(r, 'event').pick(upgradable(r));
              upgradeSkill(r, s.uid);
              advanceTime(r, 6);
              finish(e, '그동안 치른 모든 싸움이 낯선 필체로 적혀 있었다. 다 읽고 나니 시간이 한참 흘러 있었다. (스킬 강화, 6시간 경과)');
            },
          },
          {
            label: '책을 불태운다',
            hint: '정신력 +12, 통찰 -1',
            disabled: run.player.insight < 1 && '태워 없앨 앎이 없다',
            go: (r, e) => {
              r.player.insight -= 1;
              finish(e, `불길 속에서 표지의 이름이 지워졌다. 조금 덜 알게 되었고 그만큼 편해졌다. (통찰 -1, 정신력 +${gainSanityRun(r, 12)})`);
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a4-black-showman',
    title: '검은 사내의 공연',
    icon: 'gi:tesla-coil',
    acts: [4],
    stages: {
      start: (run) => ({
        text: '천막 안이 관객으로 가득하다. 피부가 검고 키가 큰 사내가 유리와 쇠로 된 기계를 하나씩 꺼내 보인다. 기계가 번쩍일 때마다 관객들의 그림자가 벽에서 한 장씩 떨어져 나간다.',
        choices: [
          {
            label: '기계 하나를 산다 (80 골드)',
            hint: '유물',
            disabled: run.player.gold < 80 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 80;
              finish(e, '사내가 웃으며 상자를 건넸다. "잘 쓰게. 언젠가 돌려받으러 가겠네."', { loot: relicLoot(r) });
            },
          },
          {
            label: '공연을 끝까지 본다',
            hint: `통찰 +1, 최대 체력 -${INSIGHT_PRICE.maxHp}`,
            go: (r, e) => {
              r.player.insight += 1;
              cutMaxHp(r, INSIGHT_PRICE.maxHp);
              finish(
                e,
                `마지막 기계가 켜졌을 때 별 너머의 텅 빈 왕좌가 보였다. 천막을 나설 때 그림자가 반 박자 늦게 따라왔다. 무대 위에 무언가를 한 조각 두고 왔다. (통찰 +1, 최대 체력 -${INSIGHT_PRICE.maxHp})`,
              );
            },
          },
          {
            label: '사내의 정체를 외친다',
            hint: '전투',
            go: (_r, e) => finish(e, '관객들이 일제히 고개를 돌렸다. 그들에게는 얼굴이 없었다!', { fight: 'a4-faceless' }),
          },
          { label: '천막을 나선다', go: (_r, e) => finish(e, '등 뒤에서 박수 소리가 오래도록 멈추지 않았다.') },
        ],
      }),
    },
  },
  {
    id: 'a4-black-grove',
    title: '검은 숲의 제단',
    icon: 'gi:evil-tree',
    acts: [4],
    stages: {
      start: (run) => {
        const offer = run.essences.filter((x) => !ESSENCES.get(x.id)?.lord);
        return {
          text: '뒤틀린 나무들이 원을 이룬 숲. 한가운데 돌 제단엔 이끼와 뿌리가 엉겨 있다. 나무들이 숨을 쉰다. 아주 천천히, 당신과 같은 박자로.',
          choices: [
            {
              label: '숲의 숨결을 받아들인다',
              hint: '최대 체력 +12, 의지 -1 (영구)',
              go: (r, e) => {
                r.player.maxHp += 12;
                r.player.hp += 12;
                r.player.will -= 1;
                finish(e, '숨을 들이쉴 때마다 이끼가 폐 속으로 번졌다. 몸은 단단해졌지만 생각 몇 개가 뿌리째 뽑혀 나갔다. (최대 체력 +12, 의지 -1)');
              },
            },
            {
              label: '정수 하나를 바친다',
              hint: '흡수한 정수 하나가 사라진다, 수호자 유물',
              disabled: !offer.length && '바칠 정수가 없다',
              go: (r, e) => {
                const es = rng(r, 'event').pick(offer);
                const name = ESSENCES.get(es.id)?.name ?? '정수';
                removeEssence(r, es.uid, true);
                finish(e, `${name}${josa(name, '이')} 몸에서 뜯겨 나와 나무뿌리 속으로 사라졌다. 숲이 답례를 내밀었다.`, { loot: relicLoot(r, 'boss') });
              },
            },
            {
              label: '숲에 불을 지른다',
              hint: '전투',
              go: (_r, e) => finish(e, '불길이 번지자 나무들이 뿌리를 뽑고 일어섰다. 아니, 처음부터 나무가 아니었다!', { fight: 'a4-grove' }),
            },
            { label: '떠난다', go: (_r, e) => finish(e, '숲의 숨소리가 한동안 당신의 숨소리와 겹쳐 들렸다.') },
          ],
        };
      },
    },
  },
  {
    id: 'a4-hourglass',
    title: '거꾸로 흐르는 모래시계',
    icon: 'gi:empty-hourglass',
    acts: [4],
    stages: {
      start: (run) => ({
        text: '방 한가운데 사람 키만 한 모래시계가 떠 있다. 모래가 아래에서 위로 흐른다. 시간의 파수꾼들이 두고 간 것이다.',
        choices: [
          {
            label: '모래시계를 뒤집는다',
            hint: '시간을 12시간 되돌린다 (조수 -2), 최대 정신력 -8',
            disabled: (run.floor?.hours ?? 0) < 12 && '되돌릴 시간이 아직 없다',
            go: (r, e) => {
              const f = r.floor;
              if (f) {
                f.hours = Math.max(0, f.hours - 12);
                f.tide = Math.floor(f.hours / 12) * (f.vars.tideMul ?? 1);
              }
              cutMaxSanity(r, 8);
              finish(e, '모래가 방향을 바꾸자 차오르던 조수가 빠져나갔다. 기억 몇 조각도 함께 거꾸로 흘러갔다. (조수 -2, 최대 정신력 -8)');
            },
          },
          {
            label: '흐르는 모래를 마신다',
            hint: '체력·정신력 모두 회복, 12시간이 흐른다 (조수 +2)',
            go: (r, e) => {
              const h = healRun(r, r.player.maxHp);
              const s = gainSanityRun(r, r.player.maxSanity);
              advanceTime(r, 12);
              finish(e, `모래는 따뜻했다. 눈을 떴을 때 상처는 아물어 있었다. 시간도 너무 많이 지나 있었다. (체력 +${h}, 정신력 +${s}, 12시간 경과)`);
            },
          },
          {
            label: '모래를 한 줌 챙긴다',
            hint: '소모품 1개',
            go: (r, e) => {
              const c = rollConsumable(r);
              finish(e, '손가락 사이로 모래가 위로 흘러내렸다. 남은 것만 챙겼다.', { loot: c ? [{ kind: 'consumable', id: c }] : [{ kind: 'gold', id: 'gold', n: 30 }] });
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a4-orbiting-stones',
    title: '궤도를 도는 돌들',
    icon: 'gi:moon-orbit',
    acts: [4],
    stages: {
      start: (run) => ({
        text: '돌덩이 수십 개가 소리 없이 방 한가운데를 돌고 있다. 그 궤도는 하늘의 별자리와 똑같은 모양이다. 중심에는 아무것도 없다. 아니, 보이지 않는 무언가가 있다.',
        choices: [
          {
            label: '궤도 하나를 끊는다',
            hint: '아직 떨어지지 않은 유성 하나가 사라진다, 체력 -10',
            disabled: !pendingMeteors(run).length && '떨어질 유성이 남아 있지 않다',
            go: (r, e) => {
              const room = rng(r, 'event').pick(pendingMeteors(r));
              delete room.meteor;
              const n = hurtRun(r, 10);
              finish(e, `돌 하나를 붙잡아 궤도 밖으로 끌어냈다. 팔이 부러질 듯 아팠지만 하늘의 불덩이 하나가 빛을 잃었다. (체력 -${n}, 유성 하나 소멸)`);
            },
          },
          {
            label: '중심에 손을 뻗는다',
            hint: '???',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.5)) {
                r.player.maxHp += 6;
                r.player.hp += 6;
                finish(e, `손끝에 따뜻한 무언가가 닿더니 손을 꼭 쥐었다가 놓아주었다. (최대 체력 +6, 체력 +${healRun(r, 20)})`);
              } else {
                finish(e, '손이 닿은 곳에는 아무것도 없었다. 그 빈자리가 팔을 타고 기어올랐다.' + sanity(r, 14));
              }
            },
          },
          {
            label: '돌 하나를 주머니에 넣는다',
            hint: '골드 +45, 가장 이른 유성이 3시간 일찍 떨어진다',
            go: (r, e) => {
              r.player.gold += 45;
              const next = pendingMeteors(r).sort((a, b) => (a.meteor ?? 0) - (b.meteor ?? 0))[0];
              if (next) next.meteor = Math.max((r.floor?.hours ?? 0) + 1, (next.meteor ?? 0) - 3);
              finish(e, '돌은 금덩이처럼 무거웠다. 머리 위 어딘가에서 궤도가 일그러지는 소리가 났다. (골드 +45)');
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '돌들은 아무도 다녀가지 않았다는 듯 계속 돌았다.') },
        ],
      }),
    },
  },
]);
