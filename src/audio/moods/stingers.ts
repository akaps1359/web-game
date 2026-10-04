import { Filter, MembraneSynth, NoiseSynth, Synth } from 'tone';
import { mtof, rand } from '../scales';
import { EXP, RISE, brass, fmBell, padSynth, tom } from './instruments';
import { createMood, type Layer, type MoodFactory, type Runtime } from './runtime';

function boom(rt: Runtime, volume = -2): MembraneSynth {
  const b = rt.bag.add(
    new MembraneSynth({
      pitchDecay: 0.2,
      octaves: 3,
      envelope: { attack: 0.003, decay: 0, sustain: 1, release: 3, releaseCurve: EXP },
      volume,
    }),
  );
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 150, rolloff: -24 }));
  b.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.35 });
  return b;
}

function crash(rt: Runtime, cutoff: number, ring: number, volume = -18): NoiseSynth {
  const c = rt.bag.add(
    new NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.002, decay: 0, sustain: 1, release: ring, releaseCurve: EXP },
      volume,
    }),
  );
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: cutoff, rolloff: -12 }));
  c.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.6 });
  return c;
}

/** 승리: 팀파니 롤 → 단조가 장조로 풀리는 금관 + 종 아르페지오 → 침묵 */
function victoryLayer(rt: Runtime): Layer {
  const r = rt.pal.root;
  const timp = tom(rt, -6);
  rt.route(timp, { dry: 1, verb: 0.3 });
  const horns = brass(rt, { volume: -12, attack: 0.06, release: 2.6 });
  const hlp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 400, Q: 0.8, rolloff: -24 }));
  horns.connect(hlp);
  rt.route(hlp, { dry: 1, verb: 0.55 });
  const pad = padSynth(rt, { type: 'fattriangle', count: 3, spread: 18, attack: 0.5, release: 3, volume: -16 });
  rt.route(pad, { dry: 0.8, verb: 0.8 });
  const bell = fmBell(rt, { harmonicity: 3.5, index: 5, ring: 3.5, shine: 0.9, volume: -14 });
  rt.route(bell, { dry: 0.7, verb: 0.8, echo: 0.3 });
  const b = boom(rt);
  const cr = crash(rt, 6000, 2.2);
  return {
    start(t) {
      // 단조 화음이 깔린 채 롤 크레센도
      pad.triggerAttackRelease([r + 24, r + 27, r + 31].map(mtof), 0.75, t, 0.35);
      const roll = 0.7;
      for (let x = 0, i = 0; x < roll; x += 0.05, i++) {
        timp.triggerAttackRelease(mtof(r + 12 + (i % 2 ? 0 : 0.1)), 0.01, t + x, 0.12 + (x / roll) * 0.6);
      }
      const hit = t + roll + 0.05;
      b.triggerAttackRelease(mtof(r - 12), 0.03, hit, 1);
      cr.triggerAttackRelease(0.02, hit, 0.7);
      timp.triggerAttackRelease(mtof(r + 12), 0.02, hit, 1);
      // 장조로 해결 (피카르디 3화음)
      horns.triggerAttackRelease([r, r + 7, r + 12, r + 16, r + 19].map((m) => mtof(m + 12)), 1.7, hit, 0.85);
      hlp.frequency.setValueAtTime(300, hit);
      hlp.frequency.exponentialRampToValueAtTime(2600, hit + 0.25);
      hlp.frequency.exponentialRampToValueAtTime(500, hit + 3.5);
      pad.triggerAttackRelease([r + 24, r + 28, r + 31, r + 36].map(mtof), 2.2, hit, 0.5);
      [36, 43, 48, 52, 55].forEach((iv, i) => bell.triggerAttackRelease(mtof(r + iv), 0.05, hit + 0.12 + i * 0.11, 0.55 - i * 0.05));
    },
  };
}

/** 패배: 낮은 군집이 미끄러져 가라앉고, 느려지는 심장박동, 들숨 같은 역스웰 후 침묵 */
function defeatLayer(rt: Runtime): Layer {
  const r = rt.pal.root;
  const lp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 1200, Q: 1, rolloff: -24 }));
  rt.route(lp, { dry: 1, verb: 0.6 });
  const voices = [0, 1, 6].map(() => {
    const s = rt.bag.add(
      new Synth({
        oscillator: { type: 'fatsawtooth', count: 3, spread: 26 },
        envelope: { attack: 0.12, decay: 0, sustain: 1, release: 2.8, releaseCurve: EXP },
        volume: -16,
      }),
    );
    s.connect(lp);
    return s;
  });
  const heart = rt.bag.add(
    new MembraneSynth({
      pitchDecay: 0.05,
      octaves: 1.8,
      envelope: { attack: 0.004, decay: 0, sustain: 1, release: 0.4, releaseCurve: EXP },
      volume: -6,
    }),
  );
  const hlp = rt.bag.add(new Filter({ type: 'lowpass', frequency: 140, rolloff: -24 }));
  heart.connect(hlp);
  rt.route(hlp, { dry: 1, verb: 0.1 });
  const b = boom(rt, -1);
  const cr = crash(rt, 1800, 3.5, -16);
  const breath = rt.bag.add(
    new NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 1.6, attackCurve: RISE, decay: 0, sustain: 1, release: 0.04 },
      volume: -16,
    }),
  );
  const bp = rt.bag.add(new Filter({ type: 'bandpass', frequency: 600, Q: 1.2, rolloff: -12 }));
  breath.connect(bp);
  rt.route(bp, { dry: 1, verb: 0.1 });
  return {
    start(t) {
      b.triggerAttackRelease(mtof(r - 12), 0.03, t, 1);
      cr.triggerAttackRelease(0.02, t, 0.6);
      [0, 1, 6].forEach((iv, i) => {
        const f = mtof(r + 12 + iv + rand(-0.1, 0.1));
        const v = voices[i];
        v.triggerAttackRelease(f, 2.6, t + i * 0.04, 0.7);
        v.frequency.setValueAtTime(f, t + 0.3);
        v.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -2.5 / 12), t + 3.4);
      });
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(160, t + 4.5);
      // 느려지며 약해지는 심장박동
      let at = t + 0.9;
      [1.05, 1.4, 1.9].forEach((gap, i) => {
        const v = 0.9 - i * 0.25;
        heart.triggerAttackRelease(mtof(28), 0.02, at, v);
        heart.triggerAttackRelease(mtof(27.5), 0.02, at + 0.28, v * 0.6);
        at += gap;
      });
      // 마지막 들숨 → 뚝
      const bt = at + 0.3;
      breath.triggerAttackRelease(1.6, bt, 0.6);
      bp.frequency.setValueAtTime(300, bt);
      bp.frequency.exponentialRampToValueAtTime(2400, bt + 1.6);
    },
  };
}

export const victory: MoodFactory = (env) =>
  createMood(env, { bpm: 60, lifetime: 7.5, build: (rt) => [victoryLayer(rt)] });

export const defeat: MoodFactory = (env) =>
  createMood(env, { bpm: 60, lifetime: 9, build: (rt) => [defeatLayer(rt)] });
