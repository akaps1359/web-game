import { dbToGain } from 'tone';
import { mtof, rand } from '../scales';
import { DrumSynth, NoiseSynth, OscSynth } from '../synth';
import { biquad, boomDrum, brass, fmBell, padSynth, tom } from './instruments';
import { createMood, type Layer, type MoodFactory, type Runtime } from './runtime';

function boom(rt: Runtime, volume = -2): DrumSynth {
  const b = boomDrum(rt, volume, 3);
  const lp = biquad(rt, 'lowpass', 150, 0.7);
  b.output.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.35 });
  return b;
}

function crash(rt: Runtime, cutoff: number, ring: number, volume = -12.3): NoiseSynth {
  const c = rt.bag.add(new NoiseSynth(rt.ctx, { color: 'white', env: { a: 0.002, r: ring }, level: dbToGain(volume), max: 2 }));
  const lp = biquad(rt, 'lowpass', cutoff, 0.7);
  c.output.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.6 });
  return c;
}

/** 승리: 팀파니 롤 → 단조가 장조로 풀리는 금관 + 종 아르페지오 → 침묵 */
function victoryLayer(rt: Runtime): Layer {
  const r = rt.pal.root;
  const timp = tom(rt, -6);
  rt.route(timp, { dry: 1, verb: 0.3 });
  const horns = brass(rt, { volume: -9, attack: 0.06, release: 2.6 });
  const hlp = biquad(rt, 'lowpass', 400, 0.8);
  horns.output.connect(hlp);
  rt.route(hlp, { dry: 1, verb: 0.55 });
  const pad = padSynth(rt, { type: 'triangle', count: 3, spread: 18, attack: 0.5, release: 3, volume: -13 });
  rt.route(pad, { dry: 0.8, verb: 0.8 });
  const bell = fmBell(rt, { harmonicity: 3.5, index: 5, ring: 3.5, shine: 0.9, volume: -11 });
  rt.route(bell, { dry: 0.7, verb: 0.8, echo: 0.3 });
  const b = boom(rt, -6);
  const cr = crash(rt, 6000, 2.2);
  return {
    start(t) {
      // 단조 화음이 깔린 채 롤 크레센도
      pad.triggerAttackRelease([r + 24, r + 27, r + 31].map(mtof), 0.75, t, 0.35);
      const roll = 0.7;
      for (let x = 0, i = 0; x < roll; x += 0.05, i++) {
        timp.hit(mtof(r + 12 + (i % 2 ? 0 : 0.1)), t + x, 0.12 + (x / roll) * 0.6);
      }
      const hit = t + roll + 0.05;
      b.hit(mtof(r - 12), hit, 1);
      cr.hit(hit, 0.02, 0.7);
      timp.hit(mtof(r + 12), hit, 1);
      // 장조로 해결 (피카르디 3화음)
      horns.triggerAttackRelease([r, r + 7, r + 12, r + 16, r + 19].map((m) => mtof(m + 12)), 1.7, hit, 0.85);
      const p = hlp.frequency;
      p.setValueAtTime(300, hit);
      p.exponentialRampToValueAtTime(2600, hit + 0.25);
      p.exponentialRampToValueAtTime(500, hit + 3.5);
      pad.triggerAttackRelease([r + 24, r + 28, r + 31, r + 36].map(mtof), 2.2, hit, 0.5);
      [36, 43, 48, 52, 55].forEach((iv, i) => bell.play(mtof(r + iv), 0.02, hit + 0.12 + i * 0.11, 0.55 - i * 0.05));
    },
  };
}

/** 패배: 낮은 군집이 미끄러져 가라앉고, 느려지는 심장박동, 들숨 같은 역스웰 후 침묵 */
function defeatLayer(rt: Runtime): Layer {
  const r = rt.pal.root;
  const voices = rt.bag.add(
    new OscSynth(rt.ctx, { wave: 'sawtooth', detunes: [-13, 0, 13], env: { a: 0.12, r: 2.8 }, level: dbToGain(-14), max: 4 }),
  );
  const lp = biquad(rt, 'lowpass', 1200, 1);
  voices.output.connect(lp);
  rt.route(lp, { dry: 1, verb: 0.6 });
  const heart = rt.bag.add(
    new DrumSynth(rt.ctx, { wave: 'sine', octaves: 1.8, pitchDecay: 0.05, env: { a: 0.004, r: 0.4 }, level: dbToGain(-6) }),
  );
  const hlp = biquad(rt, 'lowpass', 140, 0.7);
  heart.output.connect(hlp);
  rt.route(hlp, { dry: 1, verb: 0.1 });
  const b = boom(rt, -1);
  const cr = crash(rt, 1800, 3.5, -8);
  const breath = rt.bag.add(new NoiseSynth(rt.ctx, { color: 'pink', env: { a: 1.6, rise: true, r: 0.04 }, level: dbToGain(-13), max: 1 }));
  const bp = biquad(rt, 'bandpass', 600, 1.2);
  breath.output.connect(bp);
  rt.route(bp, { dry: 1, verb: 0.1 });
  return {
    start(t) {
      b.hit(mtof(r - 12), t, 1);
      cr.hit(t, 0.02, 0.6);
      [0, 1, 6].forEach((iv, i) => {
        const f = mtof(r + 12 + iv + rand(-0.1, 0.1));
        for (const osc of voices.play(f, 2.6, t + i * 0.04, 0.7)) {
          osc.frequency.setValueAtTime(f, t + 0.3);
          osc.frequency.exponentialRampToValueAtTime(f * Math.pow(2, -2.5 / 12), t + 3.4);
        }
      });
      const p = lp.frequency;
      p.setValueAtTime(1400, t);
      p.exponentialRampToValueAtTime(160, t + 4.5);
      // 느려지며 약해지는 심장박동
      let at = t + 0.9;
      [1.05, 1.4, 1.9].forEach((gap, i) => {
        const v = 0.9 - i * 0.25;
        heart.hit(mtof(28), at, v);
        heart.hit(mtof(27.5), at + 0.28, v * 0.6);
        at += gap;
      });
      // 마지막 들숨 → 뚝
      const bt = at + 0.3;
      breath.hit(bt, 1.6, 0.6);
      const q = bp.frequency;
      q.setValueAtTime(300, bt);
      q.exponentialRampToValueAtTime(2400, bt + 1.6);
    },
  };
}

export const victory: MoodFactory = (env) => createMood(env, { bpm: 60, lifetime: 7.5, build: (rt) => [victoryLayer(rt)] });

export const defeat: MoodFactory = (env) => createMood(env, { bpm: 60, lifetime: 9, gain: 2, build: (rt) => [defeatLayer(rt)] });
