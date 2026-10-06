import { useEffect, useState } from 'preact/hooks';
import type { Combat, Snap } from '../engine/combat';
import type { RunState } from '../engine/run';
import { loadMeta, type Meta } from './meta';

export type Sheet =
  | null
  | { kind: 'character'; tab?: 'skills' | 'essences' | 'equip' | 'relics' | 'status' }
  | { kind: 'settings' }
  | { kind: 'codex' }
  | { kind: 'map' }
  | { kind: 'pick'; title: string; purpose: 'upgrade-reward' | 'train-camp' | 'train-paid' | 'rune'; idx?: number };

export interface Tip {
  title: string;
  /** 제목 글자에 붙일 클래스 (창세 등급의 무지갯빛 이름 등 — text.ts rarityClass) */
  nameClass?: string;
  sub?: string;
  body: string;
  icon?: string;
  color?: string;
  lines?: { label: string; value: string; color?: string }[];
}

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'info' | 'eldritch';
}

class Store {
  run: RunState | null = null;
  meta: Meta = loadMeta();
  combat: Combat | null = null;
  /** 연출 중 표시할 스냅샷 (null이면 실제 상태) */
  snap: Snap | null = null;
  busy = false;
  /** 선택한 스킬 ('weapon' | 'armor' | 스킬 uid | 'c0'~'c2' 소모품) */
  sel: string | null = null;
  /** 주목 중인 적 */
  focus: string | null = null;
  sheet: Sheet = null;
  tip: Tip | null = null;
  toasts: Toast[] = [];
  /** 화면 전환 키 (애니메이션용) */
  version = 0;
  private listeners = new Set<() => void>();
  private toastN = 0;

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  toast(text: string, tone: Toast['tone'] = 'info', ms = 2200) {
    const t = { id: ++this.toastN, text, tone };
    this.toasts = [...this.toasts.slice(-3), t];
    this.emit();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.emit();
    }, ms);
  }
}

export const store = new Store();

export function useStore(): Store {
  const [, set] = useState(0);
  useEffect(() => store.subscribe(() => set((x) => x + 1)), []);
  return store;
}
