import { reg, EQUIPS, MADNESS, SKILLS } from '../../engine/registry';
import { finish } from '../../engine/events';
import { advanceTime, distances, floorSignal, reveal, shiftCorridors } from '../../engine/dungeon';
import { connectSeen, revealPath } from './floor';
import {
  canUpgradeSkill,
  gainEquip,
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

/** 정신력 손실 + 붕괴 메시지 */
function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다 — ${MADNESS.get(r.madness)?.name ?? '광기'}.`;
  return '';
}

function relicLoot(run: RunState): LootItem[] {
  const id = rollRelic(run);
  return id ? [{ kind: 'relic', id }] : [{ kind: 'gold', id: 'gold', n: 45 }];
}

reg.events([
  {
    id: 'a3-strange-bed',
    title: '낯선 침대',
    icon: 'gi:bed',
    acts: [3],
    stages: {
      start: (run) => ({
        text: '복도 한가운데 낡은 침대가 놓여 있다. 이불은 아직 따뜻하고, 베개에는 누군가 방금 일어난 듯한 자국이 남아 있다.',
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
              floorSignal(r, { t: 'event', id: 'a3-strange-bed', choice: 'sleep' });
              finish(e, `눕자마자 깊은 잠에 빠졌다. 꿈속 어딘가에서 무언가가 당신의 꿈을 맛보는 소리가 들렸다. (체력 +${h}, 정신력 +${s})`);
            },
          },
          {
            label: '베개를 뜯어 본다',
            hint: '통찰 +1, 정신력 -10',
            go: (r, e) => {
              r.player.insight += 1;
              finish(e, '베개 속에는 깃털 대신 누군가의 꿈이 가득 차 있었다. 그 꿈의 끝을 보고 말았다. (통찰 +1)' + sanity(r, 10));
            },
          },
          {
            label: '침대 밑을 살핀다',
            hint: '무언가 있을지도…',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.5)) {
                r.player.gold += 40;
                finish(e, '먼지 속에서 누군가 잃어버린 돈주머니를 찾았다. (골드 +40)');
              } else finish(e, '침대 밑에서 잠든 사람들이 기어 나왔다. 눈은 감겨 있는데, 손은 당신을 더듬어 찾는다!', { fight: 'a3-e-sleepers' });
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '몇 걸음 가다 돌아보니 침대는 사라지고 없었다.') },
        ],
      }),
    },
  },
  {
    id: 'a3-ulthar-cat',
    title: '울타르의 고양이',
    icon: 'gi:cat',
    acts: [3],
    stages: {
      start: (run) => ({
        text: '눈이 달빛처럼 빛나는 검은 고양이가 앞을 막아선다. 울타르의 고양이들은 꿈의 땅에서 가장 오래된 수호자들이다. 고양이가 꼬리를 한 번 흔들고 당신을 빤히 바라본다.',
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
              finish(e, '고양이는 몇 번이나 모퉁이를 돌더니, 포탈 비석이 보이는 곳에서 꼬리를 감추었다.');
            },
          },
          { label: '쓰다듬는다', hint: '정신력 +14', go: (r, e) => finish(e, `고양이가 가르랑거린다. 이 꿈속에도 따뜻한 것이 있다. (정신력 +${gainSanityRun(r, 14)})`) },
        ],
      }),
    },
  },
  {
    id: 'a3-moon-galley',
    title: '달의 갤리선',
    icon: 'gi:galleon',
    acts: [3],
    stages: {
      start: (run) => ({
        text: '안개 낀 지하 호수에 검은 갤리선이 정박해 있다. 노를 젓는 것은 뿔 달린 렝의 노예들이고, 갑판 위에서는 두꺼비 같은 달짐승들이 붉은 루비를 세고 있다.',
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
              finish(e, `사슬이 끊어지자 노예들이 물속으로 뛰어들었다. 분노한 달짐승들이 갑판에서 내려온다! (정신력 +${s})`, { fight: 'a3-moonbeasts' });
            },
          },
          {
            label: '루비를 훔친다',
            hint: '골드 +50, 들킬지도',
            go: (r, e) => {
              r.player.gold += 50;
              if (rng(r, 'event').chance(0.5)) finish(e, '루비 주머니를 품에 넣고 안개 속으로 빠져나왔다. (골드 +50)');
              else finish(e, '루비를 챙기는 순간 노예들의 창끝이 당신을 향했다! (골드 +50)', { fight: 'a3-galley' });
            },
          },
          { label: '지나친다', go: (_r, e) => finish(e, '갤리선은 소리 없이 안개 속으로 미끄러져 갔다. 달을 향해.') },
        ],
      }),
    },
  },
  {
    id: 'a3-talking-cylinder',
    title: '말하는 원통',
    icon: 'gi:skull-in-jar',
    acts: [3],
    stages: {
      start: () => ({
        text: '돌 선반 위에 금속 원통 하나가 놓여 있다. 원통에 이어진 작은 장치에서 목소리가 흘러나온다. 당신의 목소리다. "제발… 나를 꺼내 줘."',
        choices: [
          {
            label: '장치에 귀를 댄다',
            hint: '통찰 +2, 정신력 -18',
            go: (r, e) => {
              r.player.insight += 2;
              finish(e, '원통 속의 당신은 별 너머에서 본 것들을 전부 들려주었다. 그중 몇 가지는 듣지 말았어야 했다. (통찰 +2)' + sanity(r, 18));
            },
          },
          {
            label: '원통을 연다',
            hint: '???',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.5)) finish(e, '안에는 아무것도 없었다. 원통 바닥에 낯선 금속 조각 하나가 붙어 있을 뿐.', { loot: relicLoot(r) });
              else finish(e, '뚜껑이 열리자 윙윙거리는 날갯소리가 방을 채웠다. 원통의 주인들이 돌아왔다!', { fight: 'a3-migos' });
            },
          },
          { label: '원통을 부순다', hint: '정신력 +8', go: (r, e) => finish(e, `목소리가 멎었다. 이상하게도 마음이 놓인다. (정신력 +${gainSanityRun(r, 8)})`) },
        ],
      }),
    },
  },
  {
    id: 'a3-seventy-steps',
    title: '얕은 잠의 일흔 계단',
    icon: 'gi:stairs',
    acts: [3],
    stages: {
      start: (run) => ({
        text: '희미한 빛이 새어 나오는 계단이 아래로 이어진다. 꿈꾸는 자들은 이것을 얕은 잠의 일흔 계단이라 부른다. 계단 끝 불꽃의 동굴에서 두 사제가 당신을 기다린다.',
        choices: [
          {
            label: '끝까지 내려간다',
            hint: '체력 +20, 정신력 +15, 시간 +3',
            go: (r, e) => {
              const h = healRun(r, 20);
              const s = gainSanityRun(r, 15);
              advanceTime(r, 3);
              floorSignal(r, { t: 'event', id: 'a3-seventy-steps', choice: 'descend' });
              finish(e, `사제들이 이마에 손을 얹자 잠이 한층 깊어졌다. 깨어 보니 몸이 가볍다. (체력 +${h}, 정신력 +${s})`);
            },
          },
          {
            label: '계단을 하나하나 센다',
            hint: '통찰 +1, 정신력 -10',
            go: (r, e) => {
              r.player.insight += 1;
              finish(e, '일흔 개가 아니었다. 일흔한 번째 계단이 있었고, 그것은 위로 나 있었다. (통찰 +1)' + sanity(r, 10));
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
    id: 'a3-ash-procession',
    title: '잿빛 행렬',
    icon: 'gi:cowled',
    acts: [3],
    stages: {
      start: (run) => ({
        text: '잿빛 로브를 입은 순례자들이 소리 없이 줄지어 지나간다. 그들이 지나간 자리마다 재가 눈처럼 쌓인다. 행렬의 끝에 선 이가 당신에게 손짓한다.',
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
              finish(e, `몇 걸음을 함께 걸었을 뿐인데 손끝이 재로 부서졌다. 대신 그들이 부르던 노래가 머릿속에 새겨졌다. (최대 체력 -6, ${SKILLS.get(id)?.name ?? '금기'} 습득)`);
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
              finish(e, `순례자가 당신의 등불에서 불씨를 옮겨 갔다. 그가 남긴 축복이 마음을 데운다. (등불 -25, 정신력 +${s}, 최대 정신력 +4)`);
            },
          },
          {
            label: '행렬을 가로막는다',
            hint: '전투',
            go: (_r, e) => finish(e, '순례자들이 일제히 고개를 돌렸다. 로브 아래에는 얼굴 대신 재가 흘러내린다!', { fight: 'a3-pilgrims' }),
          },
          { label: '지켜본다', go: (_r, e) => finish(e, '마지막 순례자가 모퉁이를 돌자 발자국도, 재도 사라졌다.') },
        ],
      }),
    },
  },
  {
    id: 'a3-dream-mirror',
    title: '꿈의 거울',
    icon: 'gi:mirror-mirror',
    acts: [3],
    stages: {
      start: (run) => {
        const p = run.player;
        const hp = p.hp / p.maxHp;
        const san = p.sanity / p.maxSanity;
        const look = san > hp + 0.05 ? '상처는 덜하지만 눈빛이 흐리다' : san < hp - 0.05 ? '상처투성이지만 눈빛이 맑다' : '당신과 꼭 닮았다';
        return {
          text: `물처럼 일렁이는 거울. 거울 속의 당신은 조금 늦게 움직인다. 그쪽의 당신은 ${look}.`,
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
            { label: '외면한다', go: (_r, e) => finish(e, '거울 속의 당신은 끝까지 당신을 바라보았다.') },
          ],
        };
      },
    },
  },
  {
    id: 'a3-angled-corner',
    title: '각진 모서리',
    icon: 'gi:triangle-target',
    acts: [3],
    stages: {
      start: () => ({
        text: '방의 한 모서리가 이상하게 날카롭다. 아무리 봐도 각도가 맞지 않는다. 모서리 안쪽에서 푸른 연기가 새어 나오고, 오래 굶주린 무언가가 냄새를 맡는 소리가 들린다.',
        choices: [
          {
            label: '모서리를 회반죽으로 메운다',
            hint: '시간 +2, 정신력 +6. 추적자가 멀어진다',
            go: (r, e) => {
              advanceTime(r, 2);
              const s = gainSanityRun(r, 6);
              const f = r.floor;
              let extra = '';
              if (f?.stalker?.active) {
                const d = distances(f, f.pos);
                let far = f.stalker.room;
                for (let i = 0; i < d.length; i++) if (d[i] !== Infinity && d[i] > (d[far] ?? 0)) far = i;
                f.stalker.room = far;
                extra = ' 멀리서 무언가가 길을 잃고 울부짖었다.';
              }
              finish(e, `모서리가 둥글게 메워지자 냄새 맡는 소리가 멀어졌다. (정신력 +${s})` + extra);
            },
          },
          {
            label: '모서리 안을 들여다본다',
            hint: '통찰 +1, 위험',
            go: (r, e) => {
              r.player.insight += 1;
              if (rng(r, 'event').chance(0.5)) finish(e, '모서리 너머로 굽은 시간이 보였다. 다행히 그것들은 아직 당신을 보지 못했다. (통찰 +1)' + sanity(r, 6));
              else finish(e, '눈이 마주쳤다. 푸른 고름을 흘리며 그것들이 모서리를 비집고 나온다! (통찰 +1)', { fight: 'a3-hounds' });
            },
          },
          {
            label: '벽의 각도를 따라 걷는다',
            hint: '복도가 뒤틀리고, 주변 지도가 드러난다',
            go: (r, e) => {
              const f = r.floor;
              if (f) {
                shiftCorridors(r, f, 4);
                const d = distances(f, f.pos);
                for (const room of f.rooms) if (d[room.id] <= 3) room.seen = true;
                reveal(r, f, f.pos);
                connectSeen(f);
              }
              finish(e, '각도를 따라 걷자 길이 접히고 펼쳐졌다. 낯선 통로들이 눈앞에 드러난다.');
            },
          },
        ],
      }),
    },
  },
  {
    id: 'a3-zoog-wood',
    title: '주그들의 숲',
    icon: 'gi:mushrooms',
    acts: [3],
    stages: {
      start: (run) => ({
        text: '거대한 버섯 줄기 사이로 작은 눈들이 반짝인다. 파닥이는 소리로 말하는 주그들이 당신을 둘러싼다. 그들은 당신의 등불을 몹시 탐내는 것 같다.',
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
              finish(e, `달나무 수액으로 빚은 술은 달고 어지러웠다. 무언가를 잊어버린 것 같다. (체력 +${h}, 정신력 +${s}${lost ? ', 통찰 -1' : ''})`);
            },
          },
          {
            label: '그들의 수다를 엿듣는다',
            hint: '통찰 +1, 등불 -20',
            go: (r, e) => {
              r.player.insight += 1;
              r.light = Math.max(0, r.light - 20);
              finish(e, '주그들의 속삭임에 숲 너머의 비밀이 섞여 있었다. 정신을 차려 보니 등불 심지가 갉아먹혀 있다. (통찰 +1, 등불 -20)');
            },
          },
          { label: '쫓아낸다', hint: '전투', go: (_r, e) => finish(e, '등불을 휘두르자 주그들이 작은 이빨을 드러냈다!', { fight: 'a3-e-zoogs' }) },
        ],
      }),
    },
  },
  {
    id: 'a3-gaunt-roost',
    title: '얼굴 없는 둥지',
    icon: 'gi:evil-bat',
    acts: [3],
    stages: {
      start: () => ({
        text: '천장이 보이지 않는 높은 방. 어둠 속에 얼굴 없는 것들이 거꾸로 매달려 잠들어 있다. 바닥에는 그들이 낚아채 온 것들의 잔해가 흩어져 있다.',
        choices: [
          {
            label: '잔해를 뒤진다',
            hint: '장비, 깨울지도… (등불이 어두우면 덜 위험하다)',
            go: (r, e) => {
              const id = rollEquip(r, 'normal');
              let got: string;
              if (id && gainEquip(r, id)) got = `${EQUIPS.get(id)?.name ?? '장비'}을(를) 챙겼다.`;
              else {
                r.player.gold += 35;
                got = '골드 +35.';
              }
              if (rng(r, 'event').chance(r.light < 25 ? 0.25 : 0.6)) {
                finish(e, `잔해 속에서 쓸 만한 것을 건졌다. ${got} 그 순간, 머리 위에서 고무 같은 날개가 펼쳐졌다!`, { fight: 'a3-e-gaunts' });
              } else finish(e, `잔해 속에서 쓸 만한 것을 건졌다. ${got} 그것들은 끝내 깨어나지 않았다.`);
            },
          },
          {
            label: '돌을 던져 깨운다',
            hint: '전투',
            go: (_r, e) => finish(e, '돌이 천장에 닿기도 전에, 얼굴 없는 것들이 일제히 날개를 펼쳤다!', { fight: 'a3-e-gaunts' }),
          },
          {
            label: '그 아래를 지나간다',
            hint: '정신력 -5',
            go: (r, e) => finish(e, '날갯짓 소리 하나 나지 않았다. 그 침묵이 오히려 더 무서웠다.' + sanity(r, 5)),
          },
        ],
      }),
    },
  },
]);
