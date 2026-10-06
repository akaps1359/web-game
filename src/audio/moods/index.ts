import type { Mood } from '../types';
import { camp, event, explore, haven, merchant, title } from './ambient';
import { combat, rift } from './battle';
import type { MoodFactory } from './runtime';
import { boss, bossSong, elite, eliteSong, lord, lordSong, type SongFactory } from './suite';
import { defeat, victory } from './stingers';

export type { MoodEnv, MoodFactory, MoodInstance } from './runtime';
export type { SongFactory, SongOpts } from './suite';

/** 무드 → 생성 음악 팩토리 ('silence' 제외) */
export const MOODS: Record<Exclude<Mood, 'silence'>, MoodFactory> = {
  title,
  explore,
  combat,
  elite,
  boss,
  event,
  merchant,
  camp,
  haven,
  rift,
  lord,
  victory,
  defeat,
};

/** 구간 구조를 가진 긴 곡 — 실제 음원을 '테마'로 사이사이 끼울 수 있다 (메들리) */
export const SONGS: Partial<Record<Mood, SongFactory>> = {
  boss: bossSong,
  elite: eliteSong,
  lord: lordSong,
};

/** 스팅어(짧게 울리고 침묵으로) */
export const STINGERS: ReadonlySet<Mood> = new Set<Mood>(['victory', 'defeat']);
/** 막과 무관한 무드 (같은 무드면 act가 달라도 다시 시작하지 않음) */
export const ACT_INDEPENDENT: ReadonlySet<Mood> = new Set<Mood>(['title', 'silence']);
