import { MADNESS, SKILLS, reg } from '../../engine/registry';
import { finish } from '../../engine/events';
import { advanceTime, floorSignal } from '../../engine/dungeon';
import {
  canUpgradeSkill,
  gainSanityRun,
  healRun,
  hurtRun,
  learnSkill,
  loseSanityRun,
  rng,
  rollEquip,
  rollForbidden,
  rollRelic,
  rollSkills,
  upgradeSkill,
  type RunState,
} from '../../engine/run';
import { tollCheck } from './floor';
import { INSIGHT_PRICE, cutMaxSanity, floorFoes, learnWeak, weakNote } from '../eventkit';

/** 정신력 손실 + 붕괴 메시지 */
function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다. (${MADNESS.get(r.madness)?.name ?? '광기'})`;
  return '';
}

function relicLoot(run: RunState) {
  const id = rollRelic(run);
  return id ? [{ kind: 'relic' as const, id }] : [{ kind: 'gold' as const, id: 'gold', n: 40 }];
}

/** 시간을 흘려보내고 종소리를 확인 */
function passTime(run: RunState, hours: number) {
  advanceTime(run, hours);
  if (run.floor) tollCheck(run, run.floor);
}

reg.events([
  {
    id: 'a2-belfry',
    title: '무너진 종탑',
    icon: 'gi:clock-tower',
    acts: [2],
    stages: {
      start: () => ({
        text: '반쯤 무너진 종탑 아래, 녹슨 대종이 밧줄 하나에 매달려 있다. 재가 엉겨 붙은 밧줄은 방금까지 누군가 쥐고 있었던 것처럼 따뜻하다.',
        choices: [
          {
            label: '종을 울린다',
            hint: '유물, 정신력 -8. 이 층의 교단 신도 힘 +1',
            go: (r, e) => {
              if (r.floor) {
                r.floor.vars.bellAdd = (r.floor.vars.bellAdd ?? 0) + 1;
                floorSignal(r, { t: 'event', id: 'a2-belfry' });
              }
              finish(
                e,
                '종소리가 수도원 전체를 훑고 지나갔다. 종 안쪽에 숨겨져 있던 공물이 발치에 떨어졌다. 한참 아래에서 낮은 울음이 그 소리에 답했다.' + sanity(r, 8),
                { loot: relicLoot(r) },
              );
            },
          },
          {
            label: '밧줄을 끊는다',
            hint: '체력 -6. 이 층의 종소리 효과 -1',
            go: (r, e) => {
              const n = hurtRun(r, 6);
              if (r.floor) r.floor.vars.bellMute = Math.min(4, (r.floor.vars.bellMute ?? 0) + 1);
              finish(e, `녹슨 칼날로 밧줄을 끊었다. 떨어지는 종이 팔을 긁고 지나갔다. 한동안 종소리는 조금 작게 들릴 것이다. (체력 -${n})`);
            },
          },
          { label: '종 밑을 지나간다', go: (_r, e) => finish(e, '종 아래를 지날 때 종이 아주 작게 한 번 흔들렸다.') },
        ],
      }),
    },
  },
  {
    id: 'a2-confessional',
    title: '고해소',
    icon: 'gi:closed-doors',
    acts: [2],
    stages: {
      start: () => ({
        text: '나무 칸막이 너머에서 재 섞인 숨소리가 들린다. "고백하라, 길 잃은 자여. 그러면 가벼워지리라."',
        choices: [
          {
            label: '죄를 고백한다',
            hint: '정신력 +20, 최대 체력 -4',
            go: (r, e) => {
              r.player.maxHp = Math.max(1, r.player.maxHp - 4);
              r.player.hp = Math.min(r.player.hp, r.player.maxHp);
              finish(e, `말을 마치자 정말로 가벼워졌다. 살점 한 줌을 함께 덜어낸 것처럼. (정신력 +${gainSanityRun(r, 20)}, 최대 체력 -4)`);
            },
          },
          {
            label: '칸막이 너머를 엿본다',
            hint: '이 층 적들의 약점과 급소를 알게 된다, 정신력 -10',
            go: (r, e) => {
              const names = learnWeak(r, floorFoes(r));
              finish(
                e,
                '격자 틈으로 보인 것은 사람의 얼굴이 아니었다. 그것은 고백을 받아 적고 있었다. 펼쳐진 장부에는 이 수도원 식구들의 죄가 빼곡했다. 그들이 무엇에 무너지는지도.' +
                  weakNote(names) +
                  (names.length ? sanity(r, 10) : ''),
              );
            },
          },
          {
            label: '칸막이를 칼로 찌른다',
            hint: '전투',
            go: (_r, e) => finish(e, '칼끝에 물컹한 것이 걸렸다. 칸막이가 열리고 고해 신부가 걸어 나온다.', { fight: 'a2-confessor1' }),
          },
          { label: '지나간다', go: (_r, e) => finish(e, '"언젠가는 고백하게 될 것이다." 목소리가 등 뒤에서 속삭였다.') },
        ],
      }),
    },
  },
  {
    id: 'a2-ossuary',
    title: '납골당의 만찬',
    icon: 'gi:bone-gnawer',
    acts: [2],
    stages: {
      start: (run) => ({
        text: '뼈가 천장까지 쌓인 납골당. 쭈그려 앉아 뼈를 뜯던 구울들이 일제히 고개를 든다. 그중 하나가 기름진 고깃덩이를 내민다.',
        choices: [
          {
            label: '받아 먹는다',
            hint: '체력 +25, 최대 정신력 -5',
            go: (r, e) => {
              const h = healRun(r, 25);
              r.player.maxSanity = Math.max(10, r.player.maxSanity - 5);
              r.player.sanity = Math.min(r.player.sanity, r.player.maxSanity);
              finish(e, `무슨 고기인지는 생각하지 않기로 했다. 놀랍도록 배가 든든하다. (체력 +${h}, 최대 정신력 -5)`);
            },
          },
          {
            label: '뼈 더미를 뒤진다',
            hint: '장비를 찾을지도… 구울들이 화를 낼지도',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.55)) {
                const id = rollEquip(r, 'elite');
                finish(e, '구울들이 식사에 정신이 팔린 틈에 뼈 더미에서 쓸 만한 물건을 건졌다.', {
                  loot: id ? [{ kind: 'equip', id }] : [{ kind: 'gold', id: 'gold', n: 45 }],
                });
              } else finish(e, '뼈 더미가 무너졌다. 구울들이 식탁에서 일어선다.', { fight: 'a2-ghouls' });
            },
          },
          {
            label: '등불을 휘두르며 물러난다',
            hint: '등불 -15',
            disabled: run.light < 15 && '등불이 너무 약하다',
            go: (r, e) => {
              r.light = Math.max(0, r.light - 15);
              finish(e, '구울들은 빛을 싫어했다. 기름은 꽤 줄었지만 무사히 빠져나왔다. (등불 -15)');
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a2-scriptorium',
    title: '재에 묻힌 필사실',
    icon: 'gi:burning-book',
    acts: [2],
    stages: {
      start: (run) => ({
        text: '필사대와 책장이 재에 반쯤 묻혀 있다. 재 위로 삐져나온 양피지에서 아직 마르지 않은 글씨가 천천히 번져 간다.',
        choices: [
          {
            label: '그을린 책장을 맞춘다 (3시간)',
            hint: '스킬 하나 강화. 시간이 흐른다',
            disabled: !run.skills.some((s) => canUpgradeSkill(run, s)) && '강화할 스킬이 없다',
            go: (r, e) => {
              passTime(r, 3);
              const all = r.skills.filter((s) => canUpgradeSkill(r, s));
              const slotted = all.filter((s) => r.slots.includes(s.uid));
              const s = rng(r, 'event').pick(slotted.length ? slotted : all);
              upgradeSkill(r, s.uid);
              finish(e, `재를 털어 가며 그을린 책장을 한 장씩 맞추었다. 타다 남은 글씨 사이로 잊었던 요령이 떠올랐다. (${SKILLS.get(s.id)?.name ?? '스킬'} 강화, 3시간 경과)`);
            },
          },
          {
            label: '재 속의 책을 파낸다',
            hint: '체력 -6, 기술서',
            go: (r, e) => {
              const n = hurtRun(r, 6);
              const [id] = rollSkills(r, 1);
              finish(e, `미지근한 재 속에서 작은 이빨이 손가락을 물었지만 가죽 장정의 책 한 권을 끄집어냈다. (체력 -${n})`, {
                loot: id ? [{ kind: 'skill', id }] : [{ kind: 'gold', id: 'gold', n: 30 }],
              });
            },
          },
          {
            label: '번져 가는 글씨를 읽는다',
            hint: '금기 스킬, 정신력 -12',
            go: (r, e) => {
              const [id] = rollForbidden(r, 1);
              if (id) learnSkill(r, id);
              finish(e, '글씨는 읽을수록 다른 문장이 되었다. 마지막 문장은 손등에 적혀 있었다.' + sanity(r, 12));
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a2-saint-finger',
    title: '성인의 손가락뼈',
    icon: 'gi:skull-in-jar',
    acts: [2],
    stages: {
      start: () => ({
        text: '깨진 유리관 속에 성인의 손가락뼈가 놓여 있다. 뼈는 아직도 한쪽을 가리킨다. 아래쪽이다.',
        choices: [
          { label: '기도한다', hint: '정신력 +12', go: (r, e) => finish(e, `오래된 기도문이 저절로 입에서 흘러나왔다. (정신력 +${gainSanityRun(r, 12)})`) },
          {
            label: '뼈를 챙긴다',
            hint: '유물, 정신력 -10',
            go: (r, e) =>
              finish(e, '뼈를 감싸 쥐자 손바닥이 차가워졌다. 뼈는 주머니 속에서도 계속 아래를 가리킨다.' + sanity(r, 10), { loot: relicLoot(r) }),
          },
          {
            label: '뼈가 가리키는 곳을 따라간다 (2시간)',
            hint: '포탈 비석의 위치가 드러난다. 시간이 흐른다',
            go: (r, e) => {
              passTime(r, 2);
              const f = r.floor;
              if (f && f.portal >= 0) {
                const p = f.rooms[f.portal];
                p.seen = p.scouted = true;
              }
              finish(e, '뼈가 가리키는 쪽으로 한참을 헤맨 끝에 포탈 비석의 울림을 들었다. (2시간 경과)');
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a2-black-font',
    title: '검은 세례반',
    icon: 'gi:chalice-drops',
    acts: [2],
    stages: {
      start: (run) => ({
        text: '세례반에 재와 피를 갠 것이 먹처럼 검게 고여 있다. 그 표면 아래에서 눈 하나가 천천히 뜨인다. 이쪽을 알아보는 눈이다.',
        choices: [
          {
            label: '머리를 담근다',
            hint: `통찰 +1, 최대 체력 +5, 최대 정신력 -${INSIGHT_PRICE.maxSanity}`,
            go: (r, e) => {
              const p = r.player;
              p.insight += 1;
              p.maxHp += 5;
              p.hp += 5;
              cutMaxSanity(r, INSIGHT_PRICE.maxSanity);
              finish(e, `미지근하고 끈적한 것이 귓속으로, 콧속으로, 생각 속으로 스며들었다. 다시 고개를 들었을 때 숨 쉬는 법이 조금 달라져 있었다. (통찰 +1, 최대 체력 +5, 최대 정신력 -${INSIGHT_PRICE.maxSanity})`);
            },
          },
          {
            label: '상처에 바른다',
            hint: '체력 +20, 정신력 -8',
            go: (r, e) => finish(e, `검은 것이 닿자 상처가 연기를 내며 아물었다. 피부 아래에서 가는 실 같은 것이 꿈틀거린다. (체력 +${healRun(r, 20)})` + sanity(r, 8)),
          },
          {
            label: '성수를 붓는다',
            hint: '성수 소모, 유물',
            disabled: !run.consumables.includes('holy-water') && '성수가 없다',
            go: (r, e) => {
              r.consumables[r.consumables.indexOf('holy-water')] = null;
              finish(e, '성수가 닿자 검은 것이 비명을 지르며 끓어올랐다. 바닥에 묻혀 있던 것이 드러났다.', { loot: relicLoot(r) });
            },
          },
          { label: '떠난다', go: (_r, e) => finish(e, '등 뒤에서 끈적한 것이 뚝뚝 떨어지는 소리가 따라왔다.') },
        ],
      }),
    },
  },
  {
    id: 'a2-ash-choir',
    title: '재 속의 합창',
    icon: 'gi:sing',
    acts: [2],
    stages: {
      start: () => ({
        text: '재가 수북이 쌓인 성가대석에서 노래가 들린다. 재 위로 고개만 내민 잿빛 얼굴들이 같은 박자로 입을 열고 닫는다. 한 자리가 비어 있다.',
        choices: [
          {
            label: '따라 부른다',
            hint: '정신력 -10, 성가대원의 정수',
            go: (r, e) => {
              const color = rng(r, 'event').int(0, 1);
              finish(e, '목소리가 재 속의 노래와 겹치는 순간 낯선 음 하나가 목구멍 안쪽에 자리를 잡았다. 입안에서 재 맛이 난다.' + sanity(r, 10), {
                loot: [{ kind: 'essence', id: 'chorister', color }],
              });
            },
          },
          {
            label: '빈자리에 촛불을 놓는다',
            hint: '등불 -10, 정신력 +15',
            go: (r, e) => {
              r.light = Math.max(0, r.light - 10);
              finish(e, `노래가 잦아들고 아이들이 하나둘 재 속으로 고개를 묻었다. (등불 -10, 정신력 +${gainSanityRun(r, 15)})`);
            },
          },
          {
            label: '성가대석으로 뛰어든다',
            hint: '전투',
            go: (_r, e) => finish(e, '노래가 뚝 그쳤다. 잿빛 얼굴들이 일제히 이쪽을 본다.', { fight: 'a2-choir' }),
          },
        ],
      }),
    },
  },
  {
    id: 'a2-penitents',
    title: '고행자의 행렬',
    icon: 'gi:whip',
    acts: [2],
    stages: {
      start: () => ({
        text: '두건을 쓴 자들이 서로의 등을 채찍질하며 줄지어 지나간다. 행렬의 맨 끝 사람이 말없이 채찍을 내민다.',
        choices: [
          {
            label: '채찍을 받는다',
            hint: '체력 -10, 최대 체력 -5, 힘 +1 (영구)',
            go: (r, e) => {
              const n = hurtRun(r, 10);
              r.player.maxHp = Math.max(1, r.player.maxHp - 5);
              r.player.hp = Math.max(1, Math.min(r.player.hp, r.player.maxHp));
              r.player.str += 1;
              finish(e, `등이 찢어질 때마다 팔에 힘이 붙었다. 행렬은 뒤도 돌아보지 않고 어둠 속으로 사라졌다. (체력 -${n}, 최대 체력 -5, 힘 +1)`);
            },
          },
          {
            label: '행렬을 따라 걷는다 (4시간)',
            hint: '체력 +12, 정신력 +15. 시간이 흐른다',
            go: (r, e) => {
              passTime(r, 4);
              finish(e, `느린 걸음에 맞추어 함께 걸었다. 낮게 웅얼거리는 기도 소리에 마음이 가라앉는다. (체력 +${healRun(r, 12)}, 정신력 +${gainSanityRun(r, 15)}, 4시간 경과)`);
            },
          },
          {
            label: '행렬을 가로지른다',
            hint: '전투',
            go: (_r, e) => finish(e, '행렬이 멈췄다. 채찍들이 일제히 이쪽을 향했다.', { fight: 'a2-sermon' }),
          },
        ],
      }),
    },
  },
  {
    id: 'a2-last-monk',
    title: '마지막 수도사',
    icon: 'gi:monk-face',
    acts: [2],
    stages: {
      start: (run) => ({
        text: '촛불 하나에 의지해 숨어 있던 늙은 수도사가 떨리는 손을 내민다. "기름을… 조금만 나눠 주게. 빛이 꺼지면 그것들이 온다네."',
        choices: [
          {
            label: '등유를 나눠 준다',
            hint: '등불 -25, 정신력 +6. 이 층의 지도가 드러난다',
            disabled: run.light < 25 && '나눠 줄 기름이 부족하다',
            go: (r, e) => {
              r.light = Math.max(0, r.light - 25);
              if (r.floor) for (const room of r.floor.rooms) room.seen = room.scouted = true;
              finish(e, `수도사는 고맙다며 수도원의 도면을 펼쳐 보였다. 모든 회랑과 방이 그 위에 있었다. (등불 -25, 정신력 +${gainSanityRun(r, 6)})`);
            },
          },
          {
            label: '그의 초를 빼앗는다',
            hint: '등불 +25, 정신력 -10',
            go: (r, e) => {
              r.light = Math.min(100, r.light + 25);
              finish(e, '촛불을 등불에 옮겨 붙이자 수도사가 어둠 속에서 울기 시작했다. 울음은 곧 다른 소리로 바뀌었다. (등불 +25)' + sanity(r, 10));
            },
          },
          {
            label: '함께 기도한다',
            hint: '정신력 +8',
            go: (r, e) => finish(e, `둘이서 작은 목소리로 기도했다. 잠시나마 종소리가 들리지 않았다. (정신력 +${gainSanityRun(r, 8)})`),
          },
        ],
      }),
    },
  },
  {
    id: 'a2-bellows',
    title: '거대한 풀무',
    icon: 'gi:bellows',
    acts: [2],
    stages: {
      start: (run) => {
        const ashen = run.floor?.rooms.some((x) => x.flooded) ?? false;
        return {
          text: '회랑의 재를 날려 보내던 거대한 풀무. 가죽 주름 사이에 수도사의 시체가 끼어 있다. 이걸 다시 움직이면 아래쪽 회랑에 쌓인 재가 걷힐지도 모른다.',
          choices: [
            {
              label: '풀무를 밟는다',
              hint: '체력 -8. 이 층의 재에 파묻힌 방에서 재가 걷힌다',
              disabled: !ashen && '이미 재가 걷혔다',
              go: (r, e) => {
                const n = hurtRun(r, 8);
                if (r.floor) for (const room of r.floor.rooms) room.flooded = false;
                finish(e, `시체를 끌어내고 발판을 밟았다. 뿜어져 나온 뜨거운 재가 얼굴을 할퀴었지만 멀리서 재가 쓸려 나가는 소리가 울렸다. (체력 -${n})`);
              },
            },
            {
              label: '시체의 주머니를 뒤진다',
              hint: '골드 +35, 정신력 -6',
              go: (r, e) => {
                r.player.gold += 35;
                finish(e, '그을려 굳은 손가락 사이에서 금화 주머니를 빼냈다. (골드 +35)' + sanity(r, 6));
              },
            },
            { label: '떠난다', go: (_r, e) => finish(e, '등 뒤에서 풀무가 혼자 한 번 숨을 쉬었다.') },
          ],
        };
      },
    },
  },
]);
