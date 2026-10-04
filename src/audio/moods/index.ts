import type { Mood } from '../types';
import { camp, event, explore, haven, merchant, title } from './ambient';
import { boss, combat, elite, lord, rift } from './battle';
import type { MoodFactory } from './runtime';
import { defeat, victory } from './stingers';

export type { MoodEnv, MoodFactory, MoodInstance } from './runtime';

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

/** 스팅어(짧게 울리고 침묵으로) */
export const STINGERS: ReadonlySet<Mood> = new Set<Mood>(['victory', 'defeat']);
/** 막과 무관한 무드 (같은 무드면 act가 달라도 다시 시작하지 않음) */
export const ACT_INDEPENDENT: ReadonlySet<Mood> = new Set<Mood>(['title', 'silence']);
