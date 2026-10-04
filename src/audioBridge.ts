import { sound, type AudioImpl } from './sound';

export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

type Full = AudioImpl & { settings?: AudioSettings; applySettings?(s: Partial<AudioSettings>): void };

let real: Full | null = null;
let local: AudioSettings = { music: 0.7, sfx: 0.8, muted: false };
try {
  const raw = localStorage.getItem('abyss.audio');
  if (raw) local = { ...local, ...JSON.parse(raw) };
} catch {
  /* 무시 */
}

export function attachAudio(a: Full) {
  real = a;
  sound.attach(a);
}

export function audioSettings(): AudioSettings {
  return real?.settings ?? local;
}

export function setAudioSettings(p: Partial<AudioSettings>) {
  if (real?.applySettings) {
    real.applySettings(p);
    return;
  }
  local = { ...local, ...p };
  try {
    localStorage.setItem('abyss.audio', JSON.stringify(local));
  } catch {
    /* 무시 */
  }
}
