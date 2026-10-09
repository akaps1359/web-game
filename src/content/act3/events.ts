import { josa } from '../../engine/josa';
import { reg, ENEMIES, EQUIPS, MADNESS, SKILLS } from '../../engine/registry';
import { finish } from '../../engine/events';
import { advanceTime, connectSeen, distances, floorSignal, reveal, revealPath, shiftCorridors } from '../../engine/dungeon';
import {
  canUpgradeSkill,
  gainEquip,
  gainSanityRun,
  healRun,
  hurtRun,
  loseSanityRun,
  rng,
  rollConsumable,
  rollEquip,
  rollRelic,
  upgradeSkill,
  type LootItem,
  type RunState,
} from '../../engine/run';
import { INSIGHT_PRICE, canTakeMadness, cutMaxSanity, floorFoes, learnWeak, takeMadness, weakNote } from '../eventkit';

// 꿈의 땅 이벤트(낯선 침대, 울타르의 고양이, 달의 갤리선, 일흔 계단, 잿빛 행렬, 꿈의 거울, 주그들의 숲)는 5층(act5/events.ts)으로 옮겨 갔다.

/** 정신력 손실 + 붕괴 메시지 */
function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다. (${MADNESS.get(r.madness)?.name ?? '광기'})`;
  return '';
}

/** 쇼고스 계열 (벽화가 그린 원형질) */
const SHOGGOTHS = () => [...ENEMIES.values()].filter((d) => d.act === 3 && d.tags?.includes('shoggoth')).map((d) => d.id);
/** 각도 속에 사는 것들 */
const ANGLES = ['tindalos', 'angle-king', 'angle-whelp'];

function relicLoot(run: RunState): LootItem[] {
  const id = rollRelic(run);
  return id ? [{ kind: 'relic', id }] : [{ kind: 'gold', id: 'gold', n: 45 }];
}

/** 계층군주 진척 신호 (숨은 조건) */
function lordSignal(run: RunState, id: string, choice: string) {
  if (run.floor) floorSignal(run, { t: 'event', id, choice });
}

reg.events([
  {
    id: 'a3-talking-cylinder',
    title: '말하는 원통',
    icon: 'gi:skull-in-jar',
    acts: [3],
    stages: {
      start: () => ({
        text: '얼음 선반 위에 금속 원통 하나가 놓여 있다. 원통에 이어진 작은 장치에서 목소리가 흘러나온다. 당신의 목소리다. "제발… 나를 꺼내 줘."',
        choices: [
          {
            label: '장치에 귀를 댄다',
            hint: `통찰 +1, 최대 정신력 -${INSIGHT_PRICE.maxSanity}`,
            go: (r, e) => {
              r.player.insight += 1;
              cutMaxSanity(r, INSIGHT_PRICE.maxSanity);
              finish(
                e,
                `원통 속의 당신은 별 너머에서 본 것들을 전부 들려주었다. 그중 몇 가지는 듣지 말았어야 했다. 들은 자리만큼 마음이 깎여 나갔다. (통찰 +1, 최대 정신력 -${INSIGHT_PRICE.maxSanity})`,
              );
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
    id: 'a3-angled-corner',
    title: '각진 모서리',
    icon: 'gi:triangle-target',
    acts: [3],
    stages: {
      start: () => ({
        text: '오각형 방의 한 모서리가 유난히 날카롭다. 아무리 봐도 각도가 맞지 않는다. 모서리 안쪽에서 푸른 연기가 새어 나온다. 오래 굶주린 것이 킁킁거리며 냄새를 맡는 소리가 들린다.',
        choices: [
          {
            label: '모서리를 얼음으로 메운다',
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
            hint: '각도의 사냥개·각도의 왕의 약점과 급소를 알게 된다, 위험',
            go: (r, e) => {
              const note = weakNote(learnWeak(r, ANGLES));
              if (rng(r, 'event').chance(0.5)) finish(e, '모서리 너머로 굽은 시간이 보였다. 그 속을 헤매는 것들이 어디가 무른지도. 다행히 그것들은 아직 이쪽을 보지 못했다.' + note + sanity(r, 6));
              else finish(e, '눈이 마주쳤다. 푸른 고름을 흘리며 그것들이 모서리를 비집고 나온다!' + note, { fight: 'a3-hounds' });
            },
          },
          {
            label: '벽의 각도를 따라 걷는다',
            hint: '복도가 뒤틀리고 주변 지도가 드러난다',
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
    id: 'a3-gaunt-roost',
    title: '얼굴 없는 둥지',
    icon: 'gi:evil-bat',
    acts: [3],
    stages: {
      start: () => ({
        text: '꼭대기가 보이지 않는 오각형 탑의 안쪽. 어둠 속에 얼굴 없는 것들이 거꾸로 매달려 잠들어 있다. 바닥에는 그들이 낚아채 온 것들의 잔해가 얼어붙어 있다.',
        choices: [
          {
            label: '잔해를 뒤진다',
            hint: '장비, 깨울지도… (등불이 어두우면 덜 위험하다)',
            go: (r, e) => {
              const id = rollEquip(r, 'normal');
              let got: string;
              if (id && gainEquip(r, id)) got = `${EQUIPS.get(id)?.name ?? '장비'}${josa(EQUIPS.get(id)?.name ?? '장비', '을')} 챙겼다.`;
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

  // ───────────── 얼어붙은 고대 도시 ─────────────
  {
    id: 'a3-murals',
    title: '고대인의 벽화',
    icon: 'gi:hieroglyph-y',
    acts: [3],
    weight: 1.4,
    stages: {
      start: (run) => ({
        text: '오각형 회랑의 벽 전체에 벽화가 새겨져 있다. 통 같은 몸에 별 모양 머리를 한 것들이 별에서 내려와 도시를 쌓고 검은 원형질을 빚어 부린다. 회랑 끝으로 갈수록 선이 거칠어진다. 같은 장면이 몇 번이고 덧새겨져 있다.',
        choices: [
          {
            label: '도시를 쌓는 장면을 따라 그린다 (2시간)',
            hint: '스킬 하나 강화. 시간이 흐른다',
            disabled: !run.skills.some((s) => canUpgradeSkill(run, s)) && '강화할 스킬이 없다',
            go: (r, e) => {
              advanceTime(r, 2);
              const all = r.skills.filter((s) => canUpgradeSkill(r, s));
              const slotted = all.filter((s) => r.slots.includes(s.uid));
              const s = rng(r, 'event').pick(slotted.length ? slotted : all);
              upgradeSkill(r, s.uid);
              finish(e, `돌을 다루는 그들의 손놀림을 따라 그리다 보니 내 손도 조금 달라졌다. (${SKILLS.get(s.id)?.name ?? '스킬'} 강화, 2시간 경과)`);
            },
          },
          {
            label: '원형질을 빚는 장면을 들여다본다',
            hint: '쇼고스들의 약점과 급소를 알게 된다, 정신력 -8',
            go: (r, e) => {
              const names = learnWeak(r, SHOGGOTHS());
              finish(
                e,
                '그들은 원형질에 피리 소리로 명령했다. 원형질은 눈과 입과 손을 만들어 내며 시키는 대로 했다. 벽화는 말을 듣지 않는 원형질을 다스리는 법도 새겨 두었다. 아주 오랫동안은 그것으로 충분했다.' +
                  weakNote(names) +
                  (names.length ? sanity(r, 8) : ''),
              );
            },
          },
          {
            label: '회랑 끝, 거칠게 덧새긴 벽화를 읽는다',
            hint: '유물, 정신력 -12',
            go: (r, e) => {
              lordSignal(r, 'a3-murals', 'revolt');
              finish(
                e,
                '마지막 벽화에서는 노예들이 주인들을 삼키고 있었다. 새긴 손이 떨렸는지 선이 삐뚤빼뚤했다. 벽화 아래 얼음 틈에서 그 손의 주인이 떨어뜨린 것을 주웠다.' + sanity(r, 12),
                { loot: relicLoot(r) },
              );
            },
          },
          { label: '지나간다', go: (_r, e) => finish(e, '등 뒤에서 벽화 속 별 모양 머리들이 일제히 돌아가는 소리가 난 것 같았다.') },
        ],
      }),
    },
  },
  {
    id: 'a3-frozen-shape',
    title: '얼음 속의 형체',
    icon: 'gi:iceberg',
    acts: [3],
    weight: 1.4,
    stages: {
      start: (run) => ({
        text: '검은 얼음벽 속에 거대한 형체가 갇혀 있다. 펼친 막날개, 통 같은 몸통, 별 모양의 머리. 얼음 너머로 반쯤 뜬 다섯 개의 눈이 보인다. 촉수로 무언가를 감싸 안고 있다.',
        choices: [
          {
            label: '등유를 부어 얼음을 녹인다',
            hint: '등불 -25. 품에 안은 것을 얻는다… 그것이 깨어날지도',
            disabled: run.light < 25 && '등불이 너무 약하다',
            go: (r, e) => {
              r.light = Math.max(0, r.light - 25);
              lordSignal(r, 'a3-frozen-shape', 'melt');
              if (rng(r, 'event').chance(0.55)) {
                finish(e, '얼음이 녹아내리며 품에 안긴 것이 굴러떨어졌다. 형체는 끝내 움직이지 않았다. 아직은. (등불 -25)', { loot: relicLoot(r) });
              } else finish(e, '녹은 물이 흘러내리자 막날개가 떨렸다. 다섯 눈이 완전히 열렸다! (등불 -25)', { fight: 'a3-hunters' });
            },
          },
          {
            label: '얼음을 깨어 손에 쥔 것만 빼낸다',
            hint: '체력 -10, 장비',
            go: (r, e) => {
              const n = hurtRun(r, 10);
              const id = rollEquip(r, 'elite');
              finish(e, `얼음 조각이 손등을 베었지만 촉수 사이에 끼어 있던 물건을 빼냈다. (체력 -${n})`, {
                loot: id ? [{ kind: 'equip', id }] : [{ kind: 'gold', id: 'gold', n: 45 }],
              });
            },
          },
          {
            label: '다섯 눈을 마주 본다',
            hint: '의지 +1 (영구), 정신력 -12',
            go: (r, e) => {
              r.player.will += 1;
              finish(e, '얼음 너머의 눈동자가 아주 천천히 당신을 따라 움직였다. 그것은 오래전부터 깨어 있었다. 끝까지 눈을 피하지 않고 버텼다. 이제 웬만한 것은 견딜 수 있다. (의지 +1)' + sanity(r, 12));
            },
          },
          { label: '건드리지 않는다', go: (_r, e) => finish(e, '지나가는 내내, 다섯 개의 눈이 등 뒤를 따라왔다.') },
        ],
      }),
    },
  },
  {
    id: 'a3-tekeli-li',
    title: '테켈리-리',
    icon: 'gi:sound-waves',
    acts: [3],
    weight: 1.4,
    stages: {
      start: () => ({
        text: '어두운 터널 저편에서 피리 소리가 들린다. 테켈리-리. 테켈리-리. 처음엔 바람 소리인 줄 알았다. 소리가 점점 가까워진다. 터널을 꽉 채운 무언가가 미끄러지는 소리가 그 뒤를 따른다.',
        choices: [
          {
            label: '피리 소리를 흉내 내어 대답한다',
            hint: '소모품… 대답이 틀리면 전투',
            go: (r, e) => {
              lordSignal(r, 'a3-tekeli-li', 'answer');
              if (rng(r, 'event').chance(0.5)) {
                const c = rollConsumable(r);
                finish(e, '소리가 뚝 멎었다. 그것은 당신을 옛 주인으로 여긴 듯 물러갔다. 지나간 자리에 삼키다 만 것이 남아 있었다.', {
                  loot: c ? [{ kind: 'consumable', id: c }] : [{ kind: 'gold', id: 'gold', n: 40 }],
                });
              } else finish(e, '대답이 틀렸다. 피리 소리가 비명처럼 높아지며 원형질이 터널을 메우고 쏟아진다!', { fight: 'a3-spawn-pair' });
            },
          },
          {
            label: '옆 통로로 숨어 지나가기를 기다린다 (2시간)',
            hint: '시간이 흐른다',
            go: (r, e) => {
              advanceTime(r, 2);
              finish(e, '거대한 원형질이 터널을 꽉 메운 채 지나갔다. 쓸고 간 벽이 거울처럼 매끄럽게 닦여 있었다. (2시간 경과)');
            },
          },
          {
            label: '귀를 막고 반대쪽으로 달린다',
            hint: '정신력 -8',
            go: (r, e) => finish(e, '귀를 막아도 피리 소리는 머릿속에서 계속 울렸다. 테켈리-리.' + sanity(r, 8)),
          },
        ],
      }),
    },
  },
  {
    id: 'a3-rookery',
    title: '눈먼 펭귄의 둥지',
    icon: 'gi:penguin',
    acts: [3],
    weight: 1.4,
    stages: {
      start: () => ({
        text: '얼음 동굴 바닥에 사람 키만 한 흰 펭귄들이 모여 있다. 눈이 있어야 할 자리가 매끈하다. 소리가 나면 일제히 그쪽으로 고개를 돌린다. 둥지마다 커다란 알이 하나씩 놓여 있다.',
        choices: [
          {
            label: '알 하나를 훔친다',
            hint: '체력 +20… 소리를 내면 무리가 덤빈다',
            go: (r, e) => {
              if (rng(r, 'event').chance(0.6)) finish(e, `숨을 참고 알 하나를 품에 안았다. 따뜻하고 놀랍도록 배가 든든하다. (체력 +${healRun(r, 20)})`);
              else finish(e, '얼음이 발밑에서 쩍 갈라졌다. 매끈한 얼굴들이 일제히 이쪽을 향한다!', { fight: 'a3-e-penguins' });
            },
          },
          {
            label: '무리를 따라 걷는다 (2시간)',
            hint: '주변 지도와 포탈 비석으로 가는 길이 드러난다. 시간이 흐른다',
            go: (r, e) => {
              advanceTime(r, 2);
              const f = r.floor;
              if (f) {
                const d = distances(f, f.pos);
                for (const room of f.rooms) if (d[room.id] <= 2) room.seen = room.scouted = true;
                revealPath(f, f.pos, f.portal);
                const portal = f.rooms[f.portal];
                if (portal) portal.seen = portal.scouted = true;
              }
              finish(e, '무리는 무언가를 피해 늘 같은 길로만 다녔다. 그 길을 따라가자 도시의 구조가 보이기 시작했다. (2시간 경과)');
            },
          },
          { label: '숨죽이고 지나간다', go: (_r, e) => finish(e, '발소리 하나 내지 않았다. 매끈한 얼굴들이 끝까지 허공을 더듬었다.') },
        ],
      }),
    },
  },
  {
    id: 'a3-lake-camp',
    title: '해부 천막',
    icon: 'gi:scalpel',
    acts: [3],
    weight: 1.4,
    stages: {
      start: () => ({
        text: '반쯤 눈에 묻힌 탐사대의 천막. 안에는 해부대 몇 개와 찢어진 표본 자루가 있다. 해부대 위의 것은 사람의 손으로 갈라진 것이 아니다. 구석의 석유 난로는 아직 쓸 만해 보인다.',
        choices: [
          {
            label: '난로에 불을 붙인다 (3시간)',
            hint: '등불 +40, 체력 +15. 시간이 흐른다',
            go: (r, e) => {
              advanceTime(r, 3);
              r.light = Math.min(100, r.light + 40);
              const h = healRun(r, 15);
              lordSignal(r, 'a3-lake-camp', 'stove');
              finish(e, `난로가 웅웅거리며 천막을 데웠다. 얼었던 손가락이 풀렸다. 등불에 기름도 채웠다. 발밑의 얼음이 조금 녹아 질척해졌다. (등불 +40, 체력 +${h}, 3시간 경과)`);
            },
          },
          {
            label: '해부 기록을 읽는다',
            hint: '이 층 적들의 약점과 급소를 알게 된다, 정신력 -10',
            go: (r, e) => {
              const names = learnWeak(r, floorFoes(r));
              finish(
                e,
                '기록은 꼼꼼했다. 이 얼음 도시의 것들을 어디부터 가르면 되는지까지. 마지막 몇 장은 다른 손이 썼다. 사람의 손이 아니었다. 그것들도 우리를 해부하며 기록을 남겼다.' +
                  weakNote(names) +
                  (names.length ? sanity(r, 10) : ''),
              );
            },
          },
          {
            label: '표본 자루를 뒤진다',
            hint: '정수, 정신력 -6',
            go: (r, e) => {
              const ev = rng(r, 'event');
              const id = ev.pick(['sled-dog', 'blind-penguin']);
              finish(e, '자루 속의 것은 아직 따뜻했다. 손을 넣자 무언가가 손바닥 안으로 스며들려 했다.' + sanity(r, 6), {
                loot: [{ kind: 'essence', id, color: ev.int(0, 1) }],
              });
            },
          },
          { label: '떠난다', go: (_r, e) => finish(e, '천막을 나서는데 안에서 누군가 메스를 내려놓는 소리가 났다.') },
        ],
      }),
    },
  },
  {
    id: 'a3-far-peaks',
    title: '산맥을 향한 창',
    icon: 'gi:mountaintop',
    acts: [3],
    weight: 1.4,
    stages: {
      start: (run) => ({
        text: '탑 꼭대기, 오각형 창 너머로 산맥이 보인다. 이 도시를 굽어보는 봉우리들보다 더 높은 봉우리들이 그 너머에 있다. 그 위로 보랏빛 증기가 천천히 모양을 바꾼다. 무언가가 눈을 돌리라고 속삭인다.',
        choices: [
          {
            label: '끝까지 바라본다',
            hint: '통찰 +1, 광기 하나',
            disabled: !canTakeMadness(run) && '더 보았다간 돌아오지 못한다',
            go: (r, e) => {
              r.player.insight += 1;
              const m = takeMadness(r);
              finish(e, `그것이 무엇이었는지는 말할 수 없다. 다만 앞으로 다시는 고개를 돌려 뒤를 돌아보지 않기로 했다. (통찰 +1${m ? `, 광기: ${m}` : ''})`);
            },
          },
          {
            label: '봉우리 사이로 난 길을 눈에 새긴다',
            hint: '포탈 비석으로 가는 길이 드러난다, 정신력 -5',
            go: (r, e) => {
              const f = r.floor;
              if (f) {
                revealPath(f, f.pos, f.portal);
                const portal = f.rooms[f.portal];
                if (portal) portal.seen = portal.scouted = true;
              }
              finish(e, '증기를 보지 않으려 애쓰며 봉우리 사이로 난 길만 눈에 새겼다. 아래로 이어지는 비석이 보였다.' + sanity(r, 5));
            },
          },
          { label: '눈을 돌린다', hint: '정신력 +6', go: (r, e) => finish(e, `창에서 등을 돌리자 숨이 쉬어졌다. (정신력 +${gainSanityRun(r, 6)})`) },
        ],
      }),
    },
  },
]);
