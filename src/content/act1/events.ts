import { reg } from '../../engine/registry';
import { finish } from '../../engine/events';
import {
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
  rollRune,
  upgradeSkill,
  canUpgradeSkill,
  type RunState,
} from '../../engine/run';
import { MADNESS } from '../../engine/registry';

/** 정신력 손실 + 붕괴 메시지 */
function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다 — ${MADNESS.get(r.madness)?.name ?? '광기'}.`;
  return '';
}

function relicLoot(run: RunState) {
  const id = rollRelic(run);
  return id ? [{ kind: 'relic' as const, id }] : [{ kind: 'gold' as const, id: 'gold', n: 40 }];
}

reg.events([
  {
    id: 'broken-idol',
    title: '부서진 성상',
    icon: 'gi:colombian-statue',
    acts: [1],
    stages: {
      start: (run, ev) => ({
        text: ev.result ?? '물에 잠긴 골목 끝, 반쯤 무너진 성상이 서 있다. 눈이 있어야 할 자리에 검은 진주가 박혀 있다.',
        choices: [
          { label: '기도한다', hint: '정신력 +12', go: (r, e) => finish(e, `차가운 돌에 이마를 댔다. 마음이 조금 가라앉는다. (정신력 +${gainSanityRun(r, 12)})`) },
          {
            label: '진주를 뽑는다',
            hint: '골드 +35, 정신력 -8',
            go: (r, e) => {
              r.player.gold += 35;
              finish(e, '진주를 뽑자 성상의 빈 눈구멍에서 검은 물이 흘렀다. (골드 +35)' + sanity(r, 8));
            },
          },
          {
            label: '성상의 눈을 들여다본다',
            hint: '통찰 +1, 정신력 -12',
            go: (r, e) => {
              r.player.insight += 1;
              finish(e, '진주 속에서 별들이 소용돌이친다. 무언가를 알아버렸다. (통찰 +1)' + sanity(r, 12));
            },
          },
        ],
      }),
    },
  },
  {
    id: 'drowned-pockets',
    title: '말뚝에 걸린 시체',
    icon: 'gi:drowning',
    acts: [1],
    stages: {
      start: () => ({
        text: '부두 말뚝에 익사한 선원이 걸려 있다. 퉁퉁 불은 외투 주머니가 불룩하다.',
        choices: [
          {
            label: '주머니를 뒤진다',
            hint: '무언가 있을지도…',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.6)) {
                r.player.gold += 30;
                const c = rollConsumable(r);
                finish(e, '젖은 지폐와 쓸 만한 물건을 찾았다. (골드 +30)', { loot: c ? [{ kind: 'consumable', id: c }] : [] });
              } else {
                finish(e, '시체의 손이 당신의 손목을 붙잡았다!', { fight: 'a1-drowned1' });
              }
            },
          },
          { label: '명복을 빈다', hint: '정신력 +5', go: (r, e) => finish(e, `잠시 눈을 감았다. (정신력 +${gainSanityRun(r, 5)})`) },
          { label: '지나친다', go: (_r, e) => finish(e, '물결이 시체를 천천히 흔든다.') },
        ],
      }),
    },
  },
  {
    id: 'wandering-doctor',
    title: '부리 가면의 의사',
    icon: 'gi:plague-doctor-profile',
    acts: [1, 2, 3],
    stages: {
      start: (run) => ({
        text: '새 부리 가면을 쓴 의사가 왕진 가방을 열었다. "아픈 곳이 있나? 값은 받겠네."',
        choices: [
          {
            label: '치료받는다 (40 골드)',
            hint: '체력 +25, 정신력 +10',
            disabled: run.player.gold < 40 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 40;
              const h = healRun(r, 25);
              const s = gainSanityRun(r, 10);
              finish(e, `쓰지만 효과는 확실하다. (체력 +${h}, 정신력 +${s})`);
            },
          },
          {
            label: '약을 산다 (20 골드)',
            hint: '소모품 1개',
            disabled: run.player.gold < 20 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 20;
              const id = rng(r, 'event').chance(0.5) ? 'bandage' : 'laudanum';
              finish(e, '의사가 작은 꾸러미를 건넸다.', { loot: [{ kind: 'consumable', id }] });
            },
          },
          {
            label: '그의 실험을 돕는다',
            hint: '최대 체력 +6, 정신력 -10',
            go: (r, e) => {
              r.player.maxHp += 6;
              r.player.hp += 6;
              finish(e, '굵은 바늘이 혈관으로 들어왔다. 몸이 단단해진다… 무언가 대가를 치른 것 같다. (최대 체력 +6)' + sanity(r, 10));
            },
          },
          { label: '거절한다', go: (_r, e) => finish(e, '"언제든 다시 찾게." 의사가 어둠 속으로 사라졌다.') },
        ],
      }),
    },
  },
  {
    id: 'sealed-crate',
    title: '봉인된 화물 상자',
    icon: 'gi:locked-chest',
    acts: [1, 2],
    stages: {
      start: (run) => ({
        text: '교단 문양이 찍힌 화물 상자가 사슬로 묶여 있다. 안에서 무언가 딸깍거린다.',
        choices: [
          {
            label: '억지로 연다',
            hint: '체력 -7, 유물',
            go: (r, e) => {
              const n = hurtRun(r, 7);
              finish(e, `사슬에 손이 찢겼지만 상자가 열렸다. (체력 -${n})`, { loot: relicLoot(r) });
            },
          },
          {
            label: '쇠지렛대로 연다',
            hint: '쇠지렛대 필요',
            disabled: run.equip.weapon?.id !== 'crowbar' && '쇠지렛대가 없다',
            go: (r, e) => finish(e, '쇠지렛대로 손쉽게 뜯어냈다.', { loot: relicLoot(r) }),
          },
          { label: '그대로 둔다', go: (_r, e) => finish(e, '딸깍거리는 소리가 등 뒤에서 오래 따라왔다.') },
        ],
      }),
    },
  },
  {
    id: 'whispering-well',
    title: '속삭이는 우물',
    icon: 'gi:well',
    acts: [1],
    stages: {
      start: (run) => ({
        text: '우물 바닥에서 누군가 이름을 부른다. 당신의 이름이다.',
        choices: [
          {
            label: '물을 마신다',
            hint: '체력 +15, 정신력 -8',
            go: (r, e) => finish(e, `물은 이상하게 따뜻했다. (체력 +${healRun(r, 15)})` + sanity(r, 8)),
          },
          {
            label: '동전을 던진다 (10 골드)',
            hint: '무언가 돌아올지도',
            disabled: run.player.gold < 10 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 10;
              const rune = rng(r, 'event').chance(0.5) ? rollRune(r) : null;
              if (rune) finish(e, '동전이 떨어진 자리에서 빛나는 돌이 떠올랐다.', { loot: [{ kind: 'rune', id: rune }] });
              else finish(e, '물결만 일 뿐, 아무 일도 없었다.');
            },
          },
          {
            label: '귀를 기울인다',
            hint: '통찰 +1, 정신력 -12',
            go: (r, e) => {
              r.player.insight += 1;
              finish(e, '목소리는 당신이 아직 모르는 것들을 알려주었다. (통찰 +1)' + sanity(r, 12));
            },
          },
        ],
      }),
    },
  },
  {
    id: 'cult-gathering',
    title: '교단의 집회',
    icon: 'gi:cultist',
    acts: [1, 2],
    stages: {
      start: () => ({
        text: '촛불이 켜진 창고 안, 로브를 입은 자들이 이해할 수 없는 말로 기도하고 있다.',
        choices: [
          {
            label: '섞여 들어가 함께 기도한다',
            hint: '금기 스킬, 정신력 -12',
            go: (r, e) => {
              const [id] = rollForbidden(r, 1);
              if (id) learnSkill(r, id);
              finish(e, '입이 저절로 그들의 말을 따라 했다. 머릿속에 무언가가 새겨졌다.' + sanity(r, 12));
            },
          },
          // 2층에서는 그 층의 교단 신도들과 싸운다 (1층 조우를 그대로 쓰면 2층에 1층 적이 나와 너무 쉽다)
          { label: '기습한다', hint: '전투', go: (r, e) => finish(e, '촛불을 걷어차며 뛰어들었다!', { fight: r.act >= 2 ? 'a2-cell' : 'a1-cult' }) },
          { label: '조용히 빠져나간다', go: (_r, e) => finish(e, '기도 소리가 등 뒤에서 점점 커졌다.') },
        ],
      }),
    },
  },
  {
    id: 'abandoned-post',
    title: '버려진 경비 초소',
    icon: 'gi:watchtower',
    acts: [1],
    stages: {
      start: () => ({
        text: '녹슨 총기 거치대와 뒤집힌 장비 상자. 경비병들은 모두 어디로 갔을까.',
        choices: [
          {
            label: '장비를 챙긴다',
            hint: '장비 1개',
            go: (r, e) => {
              const id = rollEquip(r, 'normal');
              finish(e, '쓸 만한 것을 골라 들었다.', { loot: id ? [{ kind: 'equip', id }] : [{ kind: 'gold', id: 'gold', n: 30 }] });
            },
          },
          {
            label: '기름과 폭약을 챙긴다',
            hint: '등불 +30, 다이너마이트',
            go: (r, e) => {
              r.light = Math.min(100, r.light + 30);
              finish(e, '등유를 채우고 다이너마이트 한 묶음을 챙겼다. (등불 +30)', { loot: [{ kind: 'consumable', id: 'dynamite' }] });
            },
          },
        ],
      }),
    },
  },
  {
    id: 'fortune-teller',
    title: '노파의 점괘',
    icon: 'gi:crystal-ball',
    acts: [1, 2, 3],
    stages: {
      start: (run) => ({
        text: '카드를 섞던 노파가 고개를 든다. "네 앞길을 봐 주랴?"',
        choices: [
          {
            label: '점을 본다 (15 골드)',
            hint: '이 층의 지도가 드러난다',
            disabled: run.player.gold < 15 && '골드가 부족하다',
            go: (r, e) => {
              r.player.gold -= 15;
              if (r.floor) for (const room of r.floor.rooms) room.seen = room.scouted = true;
              finish(e, '노파가 펼친 카드 위로 이 층의 모든 길이 떠올랐다.');
            },
          },
          {
            label: '카드를 훔친다',
            hint: '골드 +25, 정신력 -15',
            go: (r, e) => {
              r.player.gold += 25;
              finish(e, '노파는 웃으며 무언가를 속삭였다. 그 말이 귀에서 떠나지 않는다. (골드 +25)' + sanity(r, 15));
            },
          },
          { label: '떠난다', go: (_r, e) => finish(e, '"다시 만나겠지." 노파가 카드를 덮었다.') },
        ],
      }),
    },
  },
  {
    id: 'keeper-diary',
    title: '젖은 일기장',
    icon: 'gi:notebook',
    acts: [1],
    stages: {
      start: () => ({
        text: '등대지기의 일기다. 마지막 장엔 같은 문장이 수백 번 적혀 있다. "빛이 나를 부른다."',
        choices: [
          {
            label: '끝까지 읽는다',
            hint: '통찰 +1, 정신력 -5',
            go: (r, e) => {
              r.player.insight += 1;
              finish(e, '마지막 장을 넘기자 종이에 바다 냄새가 배어 나왔다. (통찰 +1)' + sanity(r, 5));
            },
          },
          { label: '불태운다', hint: '정신력 +6', go: (r, e) => finish(e, `불꽃이 문장들을 삼켰다. (정신력 +${gainSanityRun(r, 6)})`) },
        ],
      }),
    },
  },
  {
    id: 'mirror-pool',
    title: '물웅덩이의 그림자',
    icon: 'gi:water-drop',
    acts: [1],
    stages: {
      start: (run) => {
        const mad = run.madness.filter((m) => !MADNESS.get(m)?.virtue);
        return {
          text: '수면에 비친 당신이 먼저 웃는다.',
          choices: [
            {
              label: '마주 웃는다',
              hint: '광기 하나 제거, 최대 정신력 -5',
              disabled: !mad.length && '지울 광기가 없다',
              go: (r, e) => {
                const id = rng(r, 'event').pick(mad);
                r.madness = r.madness.filter((m) => m !== id);
                r.player.maxSanity = Math.max(10, r.player.maxSanity - 5);
                r.player.sanity = Math.min(r.player.sanity, r.player.maxSanity);
                finish(e, `그림자가 당신의 ${MADNESS.get(id)?.name ?? '광기'}을(를) 가져갔다. 무언가 함께 빠져나간 기분이다.`);
              },
            },
            { label: '물을 휘젓는다', hint: '정신력 +3', go: (r, e) => finish(e, `그림자가 흩어졌다. (정신력 +${gainSanityRun(r, 3)})`) },
          ],
        };
      },
    },
  },
  {
    id: 'rat-king',
    title: '쥐들의 왕관',
    icon: 'gi:rat',
    acts: [1],
    stages: {
      start: (run) => ({
        text: '수십 마리의 쥐가 꼬리가 엉킨 채 하나의 덩어리가 되어 꿈틀댄다. 그 한가운데 무언가 반짝인다.',
        choices: [
          {
            label: '손을 넣는다',
            hint: '체력 -5, 골드 +45',
            go: (r, e) => {
              const n = hurtRun(r, 5);
              r.player.gold += 45;
              finish(e, `수십 개의 이빨이 손을 물었지만 금화 주머니를 건졌다. (체력 -${n}, 골드 +45)`);
            },
          },
          {
            label: '화염병을 던진다',
            hint: '화염병 소모, 유물',
            disabled: !run.consumables.includes('molotov') && '화염병이 없다',
            go: (r, e) => {
              r.consumables[r.consumables.indexOf('molotov')] = null;
              finish(e, '불길 속에서 쥐들의 왕관이 녹아내렸다. 잿더미 속에 무언가 남았다.', { loot: relicLoot(r) });
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '찍찍거리는 소리가 한참 따라왔다.') },
        ],
      }),
    },
  },
  {
    id: 'drowned-chapel',
    title: '물에 잠긴 예배당',
    icon: 'gi:church',
    acts: [1],
    stages: {
      start: () => ({
        text: '무릎까지 물이 찬 예배당. 제단 위 성배에 검은 물이 고여 있다.',
        choices: [
          {
            label: '성배의 물을 마신다',
            hint: '???',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.5)) {
                r.player.maxHp += 6;
                r.player.hp += 6;
                finish(e, '몸속으로 차가운 힘이 퍼졌다. (최대 체력 +6)');
              } else {
                r.player.insight += 1;
                finish(e, '검은 물이 목을 타고 내려가며 노래를 불렀다. (통찰 +1)' + sanity(r, 15));
              }
            },
          },
          {
            label: '제단에 피를 바친다',
            hint: '체력 -8, 무작위 스킬 강화',
            go: (r, e) => {
              const n = hurtRun(r, 8);
              const cands = r.skills.filter((s) => canUpgradeSkill(r, s));
              if (cands.length) {
                const s = rng(r, 'event').pick(cands);
                upgradeSkill(r, s.uid);
                finish(e, `피가 제단의 홈을 따라 흘렀다. 기술이 손에 더 익었다. (체력 -${n})`);
              } else finish(e, `피가 제단에 스며들었지만 아무 일도 없었다. (체력 -${n})`);
            },
          },
          { label: '떠난다', go: (_r, e) => finish(e, '등 뒤에서 오르간 소리가 한 번 울렸다.') },
        ],
      }),
    },
  },
  {
    id: 'lost-child',
    title: '울고 있는 아이',
    icon: 'gi:hood',
    acts: [1, 2],
    stages: {
      start: () => ({
        text: '어둠 속에서 아이가 울고 있다. 다가가자 울음이 멈춘다. 아이는 뒤돌아보지 않는다.',
        choices: [
          {
            label: '어깨에 손을 얹는다',
            hint: '???',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.5)) {
                const s = gainSanityRun(r, 15);
                const c = rollConsumable(r);
                // 보상 화면으로 넘긴다 (소모품 칸이 가득 차 있어도 조용히 사라지지 않게)
                finish(e, `아이는 길 잃은 소년이었다. 소년이 쥐여준 물건을 받았다. (정신력 +${s})`, { loot: c ? [{ kind: 'consumable', id: c }] : [] });
              } else {
                finish(e, '아이의 얼굴엔 눈이 없었다.' + sanity(r, 14));
              }
            },
          },
          { label: '물러난다', go: (_r, e) => finish(e, '울음소리가 다시 시작됐다. 조금 더 가까이서.') },
        ],
      }),
    },
  },
]);

// 5층 '잠든 자의 꿈'(sleeper-dream)은 5층 개편 때 '아래의 목소리'(a5-voice-below, act5/events.ts)로 옮겨 갔다
