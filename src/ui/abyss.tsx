import { LV, MAX_ASC, abyssActive, abyssLevel, ascAt, type AbyssLevel } from '../engine/abyss';
import { MADNESS } from '../engine/registry';
import type { RunState } from '../engine/run';
import { Icon, showTip } from './components';
import '../styles/abyss.css';

/*
 * 심연 단계 화면 조각.
 *  - AbyssStepper: 처음 화면(출신 고르기) 아래에서 ◀ N단계 ▶로 고른다. 그 단계에서 새로 켜지는 규칙 한 줄, 누르면 켜지는 규칙 전부. 5·10·15단계는 별과 색으로.
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
    body: locked ? `${lv.desc}\n\n${lv.n > 1 ? `${lv.n - 1}단계에서 판을 깨면 열린다` : '판을 한 번 깨면 열린다'}` : lv.desc,
  });
}

/**
 * 처음 화면: 심연 단계 고르기 — 출신 아래 한 줄. ◀ N단계 ▶ (열린 단계까지)와 그 단계에서 새로 켜지는 규칙, 가운데를 누르면 켜지는 규칙 전부.
 * (2026-10: 0~15 칸과 규칙 칩을 늘어놓던 패널이 화면의 절반을 차지해 줄였다)
 */
export function AbyssStepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const cur = abyssLevel(value);
  const color = cur?.star ? STAR_COLOR[cur.star] : 'var(--eldritch)';
  // 다음 단계가 아직 잠겼으면 오른쪽 화살표가 자물쇠가 된다 — 누르면 그 단계와 여는 법
  const next = value < MAX_ASC ? abyssLevel(value + 1) : undefined;
  const locked = !!next && value >= max;
  return (
    <div class={`abyss-step ${starCls(cur)}`}>
      <button class="arrow" disabled={value <= 0} aria-label="한 단계 얕게" onClick={() => onChange(value - 1)}>
        <Icon name="gi:play-button" size={18} class="flip" />
      </button>
      <button class="mid" onClick={() => showAbyssUpTo(value)}>
        <span class="top">
          <Icon name={cur?.icon ?? 'gi:vortex'} size={15} color={color} />
          <b>심연 {value}단계</b>
          {cur?.star && (
            <span class="abyss-stars" style={{ color }}>
              {STARS[cur.star]}
            </span>
          )}
          <span class={`name ${cur?.star === 3 ? 'genesis-name' : ''}`} style={{ color: cur?.star && cur.star < 3 ? color : undefined }}>
            {cur ? cur.name : '기본 난이도'}
          </span>
        </span>
        <span class="desc">{cur ? cur.desc : '심연의 규칙 없음'}</span>
        {value > 0 && <span class="foot">켜지는 규칙 {value}개 · 누르면 모두</span>}
      </button>
      <button
        class={`arrow ${locked ? 'locked' : ''}`}
        disabled={!next}
        aria-label={locked ? `${value + 1}단계 (잠김)` : '한 단계 깊게'}
        onClick={() => (locked ? next && showAbyssLevel(next, true) : onChange(value + 1))}
      >
        <Icon name={locked ? 'gi:padlock' : 'gi:play-button'} size={locked ? 16 : 18} />
      </button>
    </div>
  );
}

/** 단계 n에서 켜지는 규칙 전부 (처음 화면에서 고를 때의 설명 창) */
export function showAbyssUpTo(n: number) {
  showTip({
    title: `심연 ${n}단계`,
    icon: 'gi:vortex',
    color: 'var(--eldritch)',
    sub: n ? `규칙 ${n}개` : undefined,
    body: n ? abyssActive(n).map(ruleLine).join('\n') : '기본 난이도. 심연의 규칙 없음',
  });
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
