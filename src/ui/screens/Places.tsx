import { useState } from 'preact/hooks';
import { ESSENCES, MADNESS, EQUIPS } from '../../engine/registry';
import { CAMP_INFO, camp, campRefuel, cureMadness, CURE_COST, forbiddenOffer, acceptForbidden, leavePlace, PRAY_SANITY, purgeEssence, removalCost, shrinePray, type CampAction } from '../../engine/places';
import { applyAsk } from '../ask';
import { store } from '../../state/store';
import { EssenceCard, SkillCard } from '../cards';
import { FlaskList } from '../flasks';
import { Icon, showTip } from '../components';
import { RunHud } from '../Hud';

const CAMP_ICON: Record<CampAction, string> = {
  sleep: 'gi:night-sleep',
  meditate: 'gi:meditation',
  train: 'gi:sword-brandish',
  tinker: 'gi:anvil-impact',
};

export function CampScreen() {
  const run = store.run!;
  const f = run.floor!;
  const room = f.rooms[f.pos];
  const used = room.cleared;
  const [tinker, setTinker] = useState(false);
  const refueled = !!f.vars[`refuel${room.id}`];
  return (
    <div class="screen">
      <RunHud />
      <div class="scroll" style={{ flex: 1, padding: '16px 14px' }}>
        <div class="hero-icon" style={{ boxShadow: '0 0 60px rgba(255,140,50,0.35)' }}>
          <Icon name="gi:campfire" size={56} color="#ff9a4a" />
        </div>
        <h2 class="title" style={{ textAlign: 'center', margin: '12px 0 4px' }}>
          야영지
        </h2>
        <div class="muted" style={{ textAlign: 'center', fontSize: 13, marginBottom: 14 }}>
          {used ? '불씨만 남았다.' : '한 가지만 할 수 있다. 시간이 흐른다.'}
        </div>
        {!tinker && (
          <div class="list">
            {(Object.keys(CAMP_INFO) as CampAction[]).map((k) => (
              <button
                class={`card ${used ? 'off' : ''}`}
                onClick={() => {
                  if (used) return;
                  if (k === 'train') {
                    store.sheet = { kind: 'pick', title: '수련할 스킬', purpose: 'train-camp' };
                    store.emit();
                  } else if (k === 'tinker') setTinker(true);
                  else void applyAsk({ title: CAMP_INFO[k].name, icon: CAMP_ICON[k], body: `${CAMP_INFO[k].desc} · ${CAMP_INFO[k].hours}시간이 흐른다. 야영지에선 한 가지만 할 수 있다.`, ok: '한다' }, (r) => camp(r, k));
                }}
              >
                <div class="badge">
                  <Icon name={CAMP_ICON[k]} size={26} color="#ffb070" />
                </div>
                <div class="body">
                  <div class="name">{CAMP_INFO[k].name}</div>
                  <div class="desc">
                    {CAMP_INFO[k].desc} · {CAMP_INFO[k].hours}시간
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {tinker && (
          <div class="list">
            <div class="section-label">강화할 장비 (최대 +2)</div>
            {(['weapon', 'armor', 'trinket1', 'trinket2'] as const).map((slot) => {
              const it = run.equip[slot];
              if (!it) return null;
              const def = EQUIPS.get(it.id)!;
              return (
                <button class={`card ${it.lvl >= 2 ? 'off' : ''}`} onClick={() => applyAsk({ title: `${def.name} 손질`, icon: def.icon, body: `+${it.lvl} → +${it.lvl + 1}. ${CAMP_INFO.tinker.hours}시간이 흐른다.`, ok: '손질한다' }, (r) => camp(r, 'tinker', slot)).then(() => setTinker(false))}>
                  <div class="badge">
                    <Icon name={def.icon} size={26} />
                  </div>
                  <div class="body">
                    <div class="name">
                      {def.name} {it.lvl > 0 ? `+${it.lvl}` : ''}
                    </div>
                    <div class="desc">{def.desc}</div>
                  </div>
                </button>
              );
            })}
            <button class="btn ghost" onClick={() => setTinker(false)}>
              취소
            </button>
          </div>
        )}
      </div>
      <div class="footer">
        <button class="btn ghost" disabled={refueled || run.light >= 100} onClick={() => applyAsk({ title: '불씨를 옮길까요?', icon: 'gi:old-lantern', body: '등불 +30. 이 야영지에서 한 번.', ok: '옮긴다' }, (r) => campRefuel(r), '등불을 채웠다 (+30)')}>
          <Icon name="gi:old-lantern" size={18} />
          불씨 옮기기
        </button>
        <button class="btn" onClick={() => applyAsk({ title: '이곳을 떠날까요?', icon: 'gi:exit-door', ok: '떠난다' }, (r) => leavePlace(r))}>
          떠난다
        </button>
      </div>
    </div>
  );
}

export function ShrineScreen() {
  const run = store.run!;
  const f = run.floor!;
  const prayed = !!f.vars[`pray${f.pos}`];
  const offered = !!f.vars[`offer${f.pos}`];
  const [mode, setMode] = useState<'main' | 'purge' | 'cure' | 'offer' | 'inscribe'>('main');
  const flasks = run.flasks?.length ?? 0;
  const [offers, setOffers] = useState<string[]>([]);
  const mad = run.madness.filter((m) => !MADNESS.get(m)?.virtue);
  return (
    <div class="screen">
      <RunHud />
      <div class="scroll" style={{ flex: 1, padding: '16px 14px' }}>
        <div class="hero-icon" style={{ boxShadow: '0 0 60px rgba(120,180,255,0.25)' }}>
          <Icon name="gi:church" size={56} color="#8fc4ea" />
        </div>
        <h2 class="title" style={{ textAlign: 'center', margin: '12px 0 14px' }}>
          잊힌 신전
        </h2>
        {mode === 'main' && (
          <div class="list">
            <button class={`card ${prayed ? 'off' : ''}`} onClick={() => !prayed && applyAsk({ title: '기도할까요?', icon: 'gi:prayer-beads', body: `정신력 +${PRAY_SANITY} (한 번)`, ok: '기도한다' }, (r) => shrinePray(r))}>
              <div class="badge">
                <Icon name="gi:prayer-beads" size={26} color="#8fc4ea" />
              </div>
              <div class="body">
                <div class="name">기도</div>
                <div class="desc">정신력 +{PRAY_SANITY} (한 번)</div>
              </div>
            </button>
            <button class={`card ${flasks ? '' : 'off'}`} onClick={() => flasks && setMode('inscribe')}>
              <div class="badge">
                <Icon name="gi:round-bottom-flask" size={26} color="#4fffc4" />
              </div>
              <div class="body">
                <div class="name">정수 새기기</div>
                <div class="desc">{flasks ? `병에 담아 둔 정수를 골드를 내고 몸에 새긴다 (병 ${flasks}개)` : '병에 담아 둔 정수가 없다. 전투 뒤 떨어진 정수를 병에 담아 둘 수 있다.'}</div>
              </div>
            </button>
            <button class={`card ${run.essences.length ? '' : 'off'}`} onClick={() => run.essences.length && setMode('purge')}>
              <div class="badge">
                <Icon name="gi:heart-beats" size={26} color="#ff9ab0" />
              </div>
              <div class="body">
                <div class="name">정수 제거</div>
                <div class="desc">흡수한 정수 하나를 지운다. 아무것도 남지 않는다. 비용 {removalCost(run)} 골드 (매번 2배)</div>
              </div>
            </button>
            <button class={`card ${mad.length ? '' : 'off'}`} onClick={() => mad.length && setMode('cure')}>
              <div class="badge">
                <Icon name="gi:brain" size={26} color="#b99bff" />
              </div>
              <div class="body">
                <div class="name">광기 치료</div>
                <div class="desc">광기 하나를 치료한다. {CURE_COST} 골드</div>
              </div>
            </button>
            <button
              class={`card ${offered ? 'off' : ''}`}
              onClick={() => {
                if (offered) return;
                const res = forbiddenOffer(run);
                if (typeof res === 'string') store.toast(res, 'bad');
                else {
                  setOffers(res);
                  setMode('offer');
                }
              }}
            >
              <div class="badge">
                <Icon name="gi:tentacle-heart" size={26} color="#4fffc4" />
              </div>
              <div class="body">
                <div class="name" style={{ color: 'var(--eldritch)' }}>
                  금기의 봉헌
                </div>
                <div class="desc">최대 정신력 -8을 바치고 금기 스킬 하나를 얻는다 (통찰 +1)</div>
              </div>
            </button>
          </div>
        )}
        {mode === 'inscribe' && (
          <div class="list">
            <FlaskList where="shrine" />
            <button class="btn ghost" onClick={() => setMode('main')}>
              돌아가기
            </button>
          </div>
        )}
        {mode === 'purge' && (
          <div class="list">
            <div class="section-label">지울 정수 ({removalCost(run)} 골드)</div>
            {run.essences.map((es) => (
              <EssenceCard
                id={es.id}
                color={es.color}
                guardian={es.guardian}
                core={es.core}
                footer={
                  <button
                    class="btn danger wide"
                    disabled={ESSENCES.get(es.id)?.lord || run.player.gold < removalCost(run)}
                    onClick={() => applyAsk({ title: `${ESSENCES.get(es.id)?.name ?? '정수'}를 지울까요?`, icon: 'gi:heart-beats', body: `${removalCost(run)} 골드. 이 정수가 준 스탯·패시브·스킬이 모두 사라지고 되돌릴 수 없다.`, ok: '지운다', danger: true }, (r) => purgeEssence(r, es.uid), '정수를 지웠다').then(() => setMode('main'))}
                  >
                    지운다
                  </button>
                }
              />
            ))}
            <button class="btn ghost" onClick={() => setMode('main')}>
              뒤로
            </button>
          </div>
        )}
        {mode === 'cure' && (
          <div class="list">
            {mad.map((m) => {
              const d = MADNESS.get(m)!;
              return (
                <button class="card" onClick={() => applyAsk({ title: `${d.name} 치료`, icon: d.icon, body: `${CURE_COST} 골드`, ok: '치료한다' }, (r) => cureMadness(r, m)).then(() => setMode('main'))}>
                  <div class="badge">
                    <Icon name={d.icon} size={26} color="#b99bff" />
                  </div>
                  <div class="body">
                    <div class="name">{d.name}</div>
                    <div class="desc">{d.desc}</div>
                  </div>
                  <span class="chip">{CURE_COST}G</span>
                </button>
              );
            })}
            <button class="btn ghost" onClick={() => setMode('main')}>
              뒤로
            </button>
          </div>
        )}
        {mode === 'offer' && (
          <div class="list">
            <div class="section-label">금기의 지식 하나를 받아들인다</div>
            {offers.map((id) => (
              <SkillCard id={id} onClick={() => applyAsk({ title: '금기를 받아들일까요?', icon: 'gi:tentacle-heart', color: 'var(--eldritch)', body: '최대 정신력 -8을 바치고 이 스킬을 얻는다.', ok: '받아들인다', danger: true }, (r) => acceptForbidden(r, id)).then(() => setMode('main'))} />
            ))}
            <button class="btn ghost" onClick={() => setMode('main')}>
              거절한다
            </button>
          </div>
        )}
      </div>
      <div class="footer">
        <button class="btn" onClick={() => applyAsk({ title: '이곳을 떠날까요?', icon: 'gi:exit-door', ok: '떠난다' }, (r) => leavePlace(r))}>
          떠난다
        </button>
        <button
          class="btn ghost"
          onClick={() => showTip({ title: '정수', icon: 'gi:heart-beats', body: '정수는 레벨만큼 흡수할 수 있다. 지우면 그 정수가 준 스탯, 패시브, 스킬이 모두 사라진다.' })}
        >
          ?
        </button>
      </div>
    </div>
  );
}
