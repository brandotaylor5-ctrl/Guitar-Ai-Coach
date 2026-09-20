import type { Observation } from '../curriculum/mastery.ts';
import { PATH, type PathProgress } from '../curriculum/path.ts';
import { declareKnownChords } from '../curriculum/watch.ts';

export const PLACEMENT_KEY = 'guitar-ai-coach.placement.v1';

export interface PlayerPlacement {
  experience: 'new' | 'played';
  knownChords: string[];
  knownSteps: string[];
  completedAt: number;
}

export interface PlacementStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class PlacementStore {
  private readonly storage: PlacementStorage;

  constructor(storage: PlacementStorage) {
    this.storage = storage;
  }

  load(): PlayerPlacement | null {
    try {
      const raw = this.storage.getItem(PLACEMENT_KEY);
      if (!raw) return null;
      const value = JSON.parse(raw) as Partial<PlayerPlacement>;
      if (
        (value.experience !== 'new' && value.experience !== 'played')
        || !Array.isArray(value.knownChords)
        || !value.knownChords.every((item) => typeof item === 'string')
        || !Array.isArray(value.knownSteps)
        || !value.knownSteps.every((item) => typeof item === 'string')
        || typeof value.completedAt !== 'number'
        || !Number.isFinite(value.completedAt)
      ) return null;
      return value as PlayerPlacement;
    } catch {
      return null;
    }
  }

  save(placement: PlayerPlacement): void {
    try {
      this.storage.setItem(PLACEMENT_KEY, JSON.stringify(placement));
    } catch {
      // Placement helps choose a first lesson, but storage must never block it.
    }
  }

  clear(): void {
    try {
      this.storage.removeItem(PLACEMENT_KEY);
    } catch {
      // A locked-down browser may not allow reset persistence.
    }
  }
}

export function placementEvidence(placement: PlayerPlacement, now = Date.now()): Observation[] {
  const out: Observation[] = [];
  for (const chord of placement.knownChords) {
    const declared = declareKnownChords([chord], placement.completedAt)[0];
    if (!declared) continue;
    out.push(
      { ...declared, quality:.9, at:now - 86_400_000 },
      { ...declared, quality:.9, at:now },
    );
  }
  return out;
}

export function effectiveProgress(progress: PathProgress, placement: PlayerPlacement | null): PathProgress {
  if (!placement || placement.experience === 'new') return progress;

  const validIds = new Set(PATH.map((step) => step.id));
  const done = new Set(progress.done);
  for (const id of ['hold', 'strings', 'fret', ...placement.knownSteps]) {
    if (validIds.has(id)) done.add(id);
  }

  return {
    done,
    current: PATH.find((step) => !done.has(step.id)) ?? PATH[PATH.length - 1]!,
    completed: PATH.filter((step) => done.has(step.id)).length,
  };
}

export function shouldOfferPlacement(
  placement: PlayerPlacement | null,
  progress: PathProgress,
  observationCount: number,
): boolean {
  return placement === null && progress.completed === 0 && observationCount === 0;
}

export function evidenceForPlacement(
  observations: Observation[],
  placement: PlayerPlacement | null,
): Observation[] {
  if (!placement) return observations;
  if (placement.experience === 'new') {
    return observations.filter((item) => item.at >= placement.completedAt);
  }
  const observedSkills = new Set(observations.map((item) => item.skillId));
  const claimsWithoutEvidence = placementEvidence(placement)
    .filter((item) => !observedSkills.has(item.skillId));
  return [...claimsWithoutEvidence, ...observations];
}

export function placementStepIds(
  placement: PlayerPlacement | null,
  observedSkills = new Set<string>(),
): Set<string> {
  if (!placement || placement.experience === 'new') return new Set();
  const validIds = new Set(PATH.map((step) => step.id));
  const ids = new Set(['hold', 'strings', 'fret']);
  for (const id of placement.knownSteps) {
    if (validIds.has(id)) ids.add(id);
  }
  const chords = new Set(placement.knownChords);
  for (const step of PATH) {
    if (
      step.kind === 'chord'
      && step.chord
      && chords.has(step.chord)
      && !observedSkills.has(`chord.${step.chord}`)
    ) ids.add(step.id);
  }
  return ids;
}
