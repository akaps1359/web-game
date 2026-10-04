import { MADNESS, reg } from '../../engine/registry';
import { finish } from '../../engine/events';
import { DMG_TYPES } from '../../engine/types';
import {
  canUpgradeSkill,
  gainSanityRun,
  healRun,
  loseSanityRun,
  rng,
  rollEquip,
  upgradeSkill,
  type RunState,
} from '../../engine/run';

function sanity(run: RunState, n: number): string {
  const r = loseSanityRun(run, n);
  if (r.fatal) return ' 정신이 완전히 무너졌다.';
  if (r.madness) return ` 정신이 무너졌다 — ${MADNESS.get(r.madness)?.name ?? '광기'}.`;
  return '';
}

function upgradable(run: RunState) {
  return run.skills.filter((s) => canUpgradeSkill(run, s));
}

/** 최종층 (기존 `sleeper-dream`과 함께 무작위로 하나) */
reg.events([
  {
    id: 'a5-forerunners',
    title: '먼저 온 자들',
    icon: 'gi:tombstone',
    acts: [5],
    stages: {
      start: (run) => ({
        text: '무덤으로 이어지는 계단에 조사자들의 유해가 늘어서 있다. 모두 같은 방향을 향해 쓰러져 있고, 몇몇의 손에는 꺼진 등불이 들려 있다. 그중 한 사람의 얼굴이 낯익다.',
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
            hint: '스킬 1개 강화, 통찰 +1, 정신력 -12',
            disabled: !upgradable(run).length && '더 갈고닦을 기술이 없다',
            go: (r, e) => {
              const s = rng(r, 'event').pick(upgradable(r));
              upgradeSkill(r, s.uid);
              r.player.insight += 1;
              finish(e, '수기의 마지막 장에는 당신이 지금 하려는 일이 적혀 있었다. 그들이 실패한 지점에 밑줄이 그어져 있다. (스킬 강화, 통찰 +1)' + sanity(r, 12));
            },
          },
          {
            label: '등잔의 기름을 모은다',
            hint: '등불 가득, 체력 +15',
            go: (r, e) => {
              r.light = 100;
              finish(e, `꺼진 등잔들에서 남은 기름을 모았다. 그들의 빛이 당신의 길을 비춘다. (등불 가득, 체력 +${healRun(r, 15)})`);
            },
          },
          {
            label: '그들을 위해 기도한다',
            hint: '정신력 +20',
            go: (r, e) => finish(e, `이름 모를 이들을 위해 잠시 눈을 감았다. 당신은 그들처럼 되지 않을 것이다. (정신력 +${gainSanityRun(r, 20)})`),
          },
        ],
      }),
    },
  },
  {
    id: 'a5-starry-rite',
    title: '마지막 의식',
    icon: 'gi:star-altar',
    acts: [5],
    stages: {
      start: () => ({
        text: '부서진 제단 앞에서 살아남은 교단원들이 마지막 의식을 올리고 있다. 그들은 잠든 자를 깨우려는 것이 아니다. 그 꿈속에서 영원히 살기를 빌고 있다.',
        choices: [
          {
            label: '숨어서 기도문을 엿듣는다',
            hint: '잠든 자의 약점을 모두 알게 된다, 정신력 -12',
            go: (r, e) => {
              r.knownWeak = { ...r.knownWeak, sleeper: [...DMG_TYPES] };
              finish(e, '기도문은 잠든 자의 모든 모습을 노래하고 있었다 — 꿈꾸는 몸, 깨어나는 몸, 깨어난 몸. 그 틈새가 머릿속에 새겨졌다. (잠든 자의 약점 공개)' + sanity(r, 12));
            },
          },
          {
            label: '의식에 참여한다',
            hint: '최대 체력 +15, 정신력 -25',
            go: (r, e) => {
              r.player.maxHp += 15;
              r.player.hp += 15;
              finish(e, '검은 물이 담긴 잔을 함께 비웠다. 몸이 깊은 곳의 압력에 맞게 다시 빚어졌다. (최대 체력 +15)' + sanity(r, 25));
            },
          },
          {
            label: '의식을 끊는다',
            hint: '정예 전투',
            go: (_r, e) => finish(e, '제단을 걷어차자 대사제가 천천히 고개를 돌렸다. 그 뒤에서 거대한 그림자가 일어선다!', { fight: 'a5-elite-hierophant' }),
          },
        ],
      }),
    },
  },
]);
