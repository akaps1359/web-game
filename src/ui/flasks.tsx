import { useState } from 'preact/hooks';
import { inscribeFlask } from '../engine/places';
import { ESSENCES, SKILLS } from '../engine/registry';
import { absorbBlock, essenceCap, essenceUsed, FLASK_CAP, inscribeCost, slotFull } from '../engine/run';
import { store } from '../state/store';
import { applyAsk } from './ask';
import { EssenceCard, josa } from './cards';
import { Icon } from './components';

/**
 * 신전·거점 신전에서 병에 담아 둔 정수를 골드를 내고 새긴다.
 * 보통 정수는 본질로만, 수호자 정수는 기술 하나를 함께 고를 수 있다.
 * (소지품 창의 정수 탭은 병을 보기·버리기만 한다 — sheets/Character.tsx)
 */
export function FlaskList(_: { where?: 'shrine' }) {
  const run = store.run!;
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const flasks = run.flasks ?? [];
  if (!flasks.length) return null;
  return (
    <div class="list">
      <div class="section-label">
        정수 병 {flasks.length}/{FLASK_CAP} · 골드를 내고 새긴다
      </div>
      {flasks.map((drop, i) => {
        const name = ESSENCES.get(drop.id)?.name ?? '정수';
        const cost = inscribeCost(drop);
        const poor = run.player.gold < cost;
        // 수호자 정수는 새길 때 기술 하나를 함께 고른다
        const key = `${i}:${drop.id}`;
        const pick = drop.guardian ? (picks[key] ?? null) : null;
        const block = absorbBlock(run, drop, pick);
        // 정수 자리가 꽉 찼으면 가진 정수 하나를 깨뜨리고 바꿔 새길 수 있다 (SwapEssenceSheet)
        const full = slotFull(block);
        const short = poor ? '골드 부족' : null;
        const why = full ? short : (block ?? short);
        const skill = pick ? (SKILLS.get(pick)?.name ?? '') : '';
        return (
          <EssenceCard
            id={drop.id}
            color={drop.color}
            guardian={drop.guardian}
            core
            choose={drop.guardian ? { pick, onPick: (id) => setPicks({ ...picks, [key]: id }) } : undefined}
            footer={
              <div style={{ display: 'grid', gap: 6 }}>
                {full && !why && (
                  <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>
                    정수 자리가 꽉 찼다({essenceUsed(run)}/{essenceCap(run)}). 가진 정수 하나를 깨뜨리고 바꿔 새길 수 있다.
                  </div>
                )}
                {why && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{why}</div>}
                {full ? (
                  <button
                    class="btn eldritch wide"
                    disabled={!!why}
                    onClick={() => {
                      store.sheet = { kind: 'swap-essence', source: 'flask', idx: i, pick };
                      store.emit();
                    }}
                  >
                    <Icon name="gi:shattered-heart" size={16} />
                    깨뜨리고 새기기{skill ? ` + ${skill}` : ''} · {cost}골드
                  </button>
                ) : (
                  <button
                    class="btn eldritch wide"
                    disabled={!!why}
                    onClick={() =>
                      applyAsk(
                        {
                          title: `${name}${josa(name, '을', '를')} 새길까요?`,
                          icon: 'gi:heart-beats',
                          color: 'var(--eldritch)',
                          body: '병에 담아 둔 정수를 몸에 새겨요. 정수 자리 하나를 차지해요.',
                          lines: [{ label: '값', value: `${cost}골드` }, ...(drop.guardian ? [{ label: '함께 배울 기술', value: skill || '없음' }] : [])],
                          ok: '새기기',
                        },
                        (r) => inscribeFlask(r, i, pick),
                        '정수를 새겼다',
                      )
                    }
                  >
                    <Icon name="gi:heart-beats" size={16} />
                    새기기{skill ? ` + ${skill}` : drop.guardian ? ' (기술 없이)' : ''} · {cost}골드
                  </button>
                )}
              </div>
            }
          />
        );
      })}
    </div>
  );
}
