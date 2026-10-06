import { inscribeFlask } from '../engine/places';
import { ESSENCES } from '../engine/registry';
import { absorbBlock, FLASK_CAP, inscribeCost, pourFlask } from '../engine/run';
import { store } from '../state/store';
import { applyAsk } from './ask';
import { EssenceCard } from './cards';
import { Icon } from './components';

/**
 * 정수 병 목록. where='bag': 소지품에서 보기·비우기 / 'shrine': 신전·거점 신전에서 골드를 내고 새기기.
 * 보통 정수는 본질로만, 수호자 정수는 기술로/본질로 고른다.
 */
export function FlaskList({ where }: { where: 'bag' | 'shrine' }) {
  const run = store.run!;
  const flasks = run.flasks ?? [];
  if (!flasks.length && where === 'shrine') return null;
  return (
    <div class="list">
      <div class="section-label">
        정수 병 {flasks.length}/{FLASK_CAP}
        {where === 'shrine' ? ' — 골드를 내고 새긴다' : ''}
      </div>
      {!flasks.length && <div class="muted" style={{ fontSize: 13 }}>비어 있다. 전투 뒤 떨어진 정수를 바로 흡수하지 않고 병에 담아 둘 수 있다.</div>}
      {flasks.map((drop, i) => {
        const name = ESSENCES.get(drop.id)?.name ?? '정수';
        const cost = inscribeCost(drop);
        const poor = run.player.gold < cost;
        const modes = drop.guardian ? [false, true] : [true];
        // 어느 방식으로도 못 새기면 그 까닭을 보여 준다 (흡수 한도 등)
        const reasons = modes.map((core) => absorbBlock(run, drop, core));
        const why = reasons.every(Boolean) ? reasons[0] : poor ? '골드가 부족하다' : null;
        return (
          <EssenceCard
            id={drop.id}
            color={drop.color}
            guardian={drop.guardian}
            core={drop.guardian ? undefined : true}
            footer={
              where === 'shrine' ? (
                <div style={{ display: 'grid', gap: 6 }}>
                  {why && <div style={{ color: 'var(--bad)', fontSize: 12, textAlign: 'center' }}>{why}</div>}
                  <div class={drop.guardian ? 'absorb-btns' : ''}>
                    {modes.map((core) => (
                      <button
                        class="btn eldritch wide"
                        disabled={poor || !!reasons[modes.indexOf(core)]}
                        onClick={() =>
                          applyAsk(
                            {
                              title: `${name} 새기기`,
                              icon: 'gi:heart-beats',
                              color: 'var(--eldritch)',
                              body: `${cost} 골드. ${drop.guardian ? (core ? '기술 없이 본질로 새긴다.' : '이 존재의 기술을 모두 배운다.') : '병에 담아 둔 정수를 몸에 새긴다.'} 정수 한도를 차지한다.`,
                              ok: '새긴다',
                            },
                            (r) => inscribeFlask(r, i, core),
                            '정수를 새겼다',
                          )
                        }
                      >
                        <Icon name="gi:heart-beats" size={16} />
                        {drop.guardian ? (core ? '본질로' : '기술로') : '새긴다'} · {cost}골드
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span class="muted" style={{ fontSize: 12, flex: 1 }}>
                    신전에서 새길 수 있다 · {cost}골드
                  </span>
                  <button
                    class="btn ghost sm"
                    onClick={() => applyAsk({ title: '병을 비울까요?', icon: 'gi:round-bottom-flask', body: `담아 둔 ${name}이(가) 사라진다.`, ok: '비운다', danger: true }, (r) => pourFlask(r, i), '병을 비웠다')}
                  >
                    비우기
                  </button>
                </div>
              )
            }
          />
        );
      })}
    </div>
  );
}
