import { FLOORS, ORIGINS } from '../../engine/registry';
import { MAX_ASC } from '../../engine/abyss';
import { toTitle } from '../../state/actions';
import { store } from '../../state/store';
import { Icon } from '../components';

export function EndScreen() {
  const run = store.run!;
  const won = !!run.over?.won;
  const st = run.stats;
  // 실제로 플레이한 시간 (예전 저장에는 없어서 시작 시각부터 잰다)
  const mins = Math.max(1, Math.round((st.playMs ? st.playMs : Date.now() - st.startedAt) / 60000));
  const rows: [string, string][] = [
    ['출신', ORIGINS.get(run.origin)?.name ?? ''],
    ['심연', `${run.asc ?? 0}단계`],
    ['도달', `${run.act}층${FLOORS.get(run.act) ? ` · ${FLOORS.get(run.act)!.name}` : ''}`],
    ['레벨', String(run.player.level)],
    ['처치', `${st.kills}`],
    ['붕괴시킨 적', `${st.breaks}`],
    ['흡수한 정수', `${st.essences}`],
    ['준 피해 / 받은 피해', `${st.dmgDealt} / ${st.dmgTaken}`],
    ['잃은 정신력', `${st.sanityLost}`],
    ['탐험한 방', `${st.rooms}`],
    ['소요 시간', `약 ${mins}분`],
  ];
  return (
    <div class="screen">
      <div class="screen-center">
        <div class="hero-icon" style={{ boxShadow: won ? '0 0 60px rgba(79,255,196,0.35)' : '0 0 60px rgba(200,40,40,0.35)' }}>
          <Icon name={won ? 'gi:star-swirl' : 'gi:tombstone'} size={56} color={won ? '#4fffc4' : '#c8423a'} />
        </div>
        <h2 class="title" style={{ textAlign: 'center', fontSize: 28 }}>
          {won ? '귀환' : '심연에 잠들다'}
        </h2>
        <div class="flavor" style={{ textAlign: 'center' }}>
          {run.over?.reason}
        </div>
        <div class="panel" style={{ padding: 14, display: 'grid', gap: 6 }}>
          {rows.map(([k, v]) => (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span class="muted">{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
        {won && (run.asc ?? 0) < MAX_ASC && (
          <div style={{ fontSize: 13, textAlign: 'center', color: 'var(--eldritch)' }}>
            심연 {(run.asc ?? 0) + 1}단계가 열렸다
          </div>
        )}
        <div class="muted" style={{ fontSize: 12, textAlign: 'center' }}>
          알아낸 약점과 만난 존재는 도감에 기록되었다.
        </div>
        <button class="btn wide" onClick={() => toTitle()}>
          처음으로
        </button>
      </div>
    </div>
  );
}
