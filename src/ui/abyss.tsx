import { LV, MAX_ASC, abyssActive, abyssLevel, ascAt, type AbyssLevel } from '../engine/abyss';
import { MADNESS } from '../engine/registry';
import type { RunState } from '../engine/run';
import { Icon, showTip } from './components';
import '../styles/abyss.css';

/*
 * 심연 단계 화면 조각.
 *  - AbyssPicker: 처음 화면(출신 고르기)에서 단계를 고른다. 고른 단계에서 켜지는 규칙 전부, 새로 켜지는 한 줄은 강조, 5·10·15단계는 별과 색으로.
 *  - AbyssStatus: 진행 중인 판의 한 줄 (캐릭터 화면 상태 탭). 누르면 규칙 전부와 지금 들리는 목소리.
 */

const STARS = ['', '★', '★★', '★★★'];
const STAR_COLOR: Record<number, string> = { 1: 'var(--brass-2)', 2: 'var(--eldritch)', 3: '#ffd6f6' };

function starCls(lv: AbyssLevel | undefined): string {
  return lv?.star ? `star${lv.star}` : '';
}

/** 단계 하나의 설명 창 (locked: 아직 열리지 않은 단계) */
export function showAbyssLevel(lv: AbyssLevel, locked = false) {
  showTip({
    title: `${lv.n}단계 · ${lv.name}`,
    nameClass: lv.star === 3 && !locked ? 'genesis-name' : undefined,
    sub: locked ? '이전 단계를 깨면 열림' : lv.star ? `${STARS[lv.star]} 특별한 규칙` : undefined,
    icon: locked ? 'gi:padlock' : lv.icon,
    color: locked ? 'var(--ink-3)' : lv.star ? STAR_COLOR[lv.star] : undefined,
    body: locked ? `${lv.desc}\n\n${lv.n - 1}단계에서 판을 깨면 열린다` : lv.desc,
  });
}

/** 처음 화면: 심연 단계 고르기 (value: 고른 단계, max: 열린 최고 단계) */
export function AbyssPicker({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const cur = abyssLevel(value);
  const active = abyssActive(value);
  return (
    <div class="panel abyss-panel">
      <div class="abyss-head">
        <Icon name="gi:vortex" size={18} color="var(--eldritch)" />
        <span class="t">심연 단계</span>
        <span class="grow" />
        <span class="open">
          열린 단계 {max}/{MAX_ASC}
        </span>
      </div>

      <div class="abyss-pips">
        {Array.from({ length: MAX_ASC + 1 }, (_, n) => {
          const lv = abyssLevel(n);
          const locked = n > max;
          return (
            <button
              class={`abyss-pip ${n === value ? 'sel' : ''} ${locked ? 'locked' : ''} ${starCls(lv)}`}
              aria-label={locked ? `${n}단계 (잠김)` : `${n}단계`}
              onClick={() => (locked && lv ? showAbyssLevel(lv, true) : onChange(n))}
            >
              {locked ? <Icon name="gi:padlock" size={13} /> : n}
              {lv?.star && <span class="mark">{STARS[lv.star]}</span>}
            </button>
          );
        })}
      </div>

      {!cur ? (
        <div class="abyss-none">기본 난이도. 심연의 규칙 없음</div>
      ) : (
        <>
          <div class={`abyss-new ${starCls(cur)}`}>
            <div class="badge">
              <Icon name={cur.icon} size={24} color={cur.star ? STAR_COLOR[cur.star] : '#9fffe2'} />
            </div>
            <div class="body">
              <div class="top">
                <span class="name">{cur.star === 3 ? <span class="genesis-name">{cur.name}</span> : <span style={{ color: cur.star ? STAR_COLOR[cur.star] : undefined }}>{cur.name}</span>}</span>
                {cur.star && (
                  <span class="abyss-stars" style={{ color: STAR_COLOR[cur.star] }}>
                    {STARS[cur.star]}
                  </span>
                )}
                <span class="lv">{cur.n}단계</span>
                <span class="fresh">새로</span>
              </div>
              <div class="desc">{cur.desc}</div>
            </div>
          </div>

          {/* 켜진 규칙 전부: 한 줄씩 한눈에 (누르면 이름과 설명) */}
          <div class="abyss-list-head">
            <span class="lbl">켜지는 규칙 {active.length}개</span>
          </div>
          <div class="abyss-chips">
            {active.map((lv) => (
              <button class={`abyss-chip ${starCls(lv)} ${lv.n === value ? 'fresh' : ''}`} onClick={() => showAbyssLevel(lv)}>
                <span class="n">{lv.n}</span>
                <Icon name={lv.icon} size={14} />
                <span class="nm">
                  {lv.short}
                  {lv.star ? ` ${STARS[lv.star]}` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div class="abyss-foot">
        {max >= MAX_ASC ? '모든 단계가 열렸다' : `잠긴 단계는 이전 단계를 깨면 열린다. ${max}단계에서 판을 깨면 ${max + 1}단계`}
      </div>
    </div>
  );
}

/** 규칙 한 줄 (번호 · 한 줄 효과, 특별한 단계는 별과 설명) */
function ruleLine(lv: AbyssLevel): string {
  return lv.star ? `${lv.n}. ${STARS[lv.star]} ${lv.name}: ${lv.desc}` : `${lv.n}. ${lv.short}`;
}

/** 지금 판의 심연 규칙 전부 (설명 창) */
export function showAbyssRules(run: RunState) {
  const n = run.asc ?? 0;
  const active = abyssActive(n);
  const w = ascAt(run, LV.voice) && run.abyss?.whisper ? MADNESS.get(run.abyss.whisper) : undefined;
  const lines = active.map(ruleLine);
  showTip({
    title: `심연 ${n}단계`,
    icon: 'gi:vortex',
    color: 'var(--eldritch)',
    sub: n ? `규칙 ${n}개` : undefined,
    body: n ? lines.join('\n') + (w ? `\n\n지금 들리는 목소리: 「${w.name}」 ${w.desc}` : '') : '기본 난이도. 심연의 규칙 없음',
  });
}

/**
 * 캐릭터 화면 상태 탭의 능력치 줄과 같은 모양 (Character.tsx statLines에 그대로 넣는다).
 * meta: 줄 아래 짧은 설명, body: 누르면 펼쳐지는 규칙 전부
 */
export function abyssStatLine(run: RunState): { id: string; icon: string; color: string; name: string; value: string; meta: string; body: string } {
  const n = run.asc ?? 0;
  const w = ascAt(run, LV.voice) && run.abyss?.whisper ? MADNESS.get(run.abyss.whisper) : undefined;
  const rules = abyssActive(n).map(ruleLine);
  return {
    id: 'abyss',
    icon: 'gi:vortex',
    color: 'var(--eldritch)',
    name: '심연',
    value: `${n}단계`,
    meta: n ? `규칙 ${n}개${w ? ` · 목소리 「${w.name}」` : ''}` : '기본 난이도',
    body: n ? rules.join('\n') + (w ? `\n\n지금 들리는 목소리: 「${w.name}」 ${w.desc}` : '') : '기본 난이도. 심연의 규칙 없음',
  };
}

/** 진행 중인 판의 심연 한 줄 (캐릭터 화면 상태 탭). 누르면 규칙 전부 */
export function AbyssStatus({ run }: { run: RunState }) {
  const n = run.asc ?? 0;
  const top = abyssLevel(n);
  const w = ascAt(run, LV.voice) && run.abyss?.whisper ? MADNESS.get(run.abyss.whisper) : undefined;
  return (
    <button class="panel abyss-status" onClick={() => showAbyssRules(run)}>
      <Icon name={top?.icon ?? 'gi:vortex'} size={20} color={top?.star ? STAR_COLOR[top.star] : 'var(--eldritch)'} />
      <span class="grow">
        심연 {n}단계 · {n ? `규칙 ${n}개` : '기본 난이도'}
        {w && (
          <span class="sub">
            이 층의 목소리 「{w.name}」 {w.desc}
          </span>
        )}
      </span>
      <Icon name="gi:help" size={14} color="var(--ink-3)" />
    </button>
  );
}
