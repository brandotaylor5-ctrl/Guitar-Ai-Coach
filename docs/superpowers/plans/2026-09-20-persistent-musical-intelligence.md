# Persistent Musical Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify guided teaching, rolling riff recall, development, practice, saving, and cross-session memory into one continuous Coach experience.

**Architecture:** Introduce a pure `CoachSession` state machine and one shared `ActiveIdeaContext` above the existing musical core. Add a session idea index for ranked recall and a lineage resolver for explicit take/variation/revision saves; the browser becomes a renderer of this domain state rather than independently coordinating each subsystem.

**Tech Stack:** TypeScript 5.8, Node.js 22.6+ native type stripping, Node test runner, browser Web Audio/AudioWorklet/Web Worker, localStorage, IndexedDB, optional Anthropic Messages API.

**Spec:** `docs/superpowers/specs/2026-09-20-persistent-musical-intelligence-design.md`

## Global Constraints

- Preserve the no-runtime-dependency architecture except the already-present optional `@anthropic-ai/sdk` server dependency.
- Raw audio stays local and expires unless the player explicitly saves an idea.
- Model-backed conversation may receive structured notes only after the player asks; it owns no musical truth.
- Existing riff, song, recording, placement, and learning-progress data must survive migration.
- Physical string/fret position remains inferred unless measured by a known practice target.
- Full polyphonic note-by-note chord transcription remains out of scope.
- Every musical edit is non-destructive; saved history is never overwritten.
- Coach shows one primary action and at most one quiet secondary escape at a time.
- Run `npm test`, `npm run typecheck`, and `npm run build` before every task-level review.

## Review Focus

- A phrase expires from rolling memory while its active idea is open: the structured notes and edits remain usable, while unavailable audio is labelled honestly. Covered in Task 1.
- Two recall candidates have nearly equal scores: Coach asks the player to choose and does not silently select one. Covered in Task 2.
- A strong library match points at a riff or parent version deleted before save: the performance can still be saved as a new riff. Covered in Task 3.
- Browser storage fills during a lineage save: the active idea stays in memory and displays an unsaved warning. Covered in Task 6.
- Model conversation fails after deterministic local edits: edits remain in the active workspace and the local command fallback still works. Covered in Task 7.

---

### Task 1: Shared Active Idea Context

**Files:**
- Create: `src/coach/activeIdea.ts`
- Modify: `src/converse/workspace.ts`
- Modify: `src/converse/tools.ts`
- Modify: `src/types.ts`
- Test: `test/activeIdea.test.ts`
- Test: `test/converse.test.ts`

**Interfaces:**
- Consumes: `Phrase`, `PhraseAnalysis`, `RecognitionMatch`, `NoteEvent`, `Tuning`, and `analyzeNotes()`.
- Produces: `ActiveIdeaContext`, `ActiveIdeaSnapshot`, `IdeaEdit`, `ActiveIdeaSource`, `openActiveIdea()`, and a compatibility `ConversationWorkspace` wrapper used by the existing conversation tools.

- [ ] **Step 1: Write failing context-lifecycle tests**

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { openActiveIdea } from '../src/coach/activeIdea.ts';
import { seq } from './helpers.ts';

describe('active idea context', () => {
  test('keeps the performance, working phrase, siblings and matches together', () => {
    const phrase = { id:'p1', notes:seq(['E2','G2','A2']), startMs:1000, endMs:2200 };
    const idea = openActiveIdea({
      phrase,
      source:{ sessionId:'session-1', startMs:1000, endMs:2200, audioRef:'clip:p1' },
      siblings:[phrase],
      matches:[],
    });
    idea.apply(seq(['E2','G2','B2']), 'lift the ending');
    assert.deepEqual(idea.originalNotes.map(n => n.midi), phrase.notes.map(n => n.midi));
    assert.equal(idea.history[0]?.description, 'lift the ending');
    assert.equal(idea.snapshot().source.audioAvailable, true);
  });

  test('survives expired audio without losing structured music or edits', () => {
    const phrase = { id:'p2', notes:seq(['A2','C3','D3']), startMs:0, endMs:1200 };
    const idea = openActiveIdea({
      phrase,
      source:{ sessionId:'session-1', startMs:0, endMs:1200 },
      siblings:[], matches:[],
    });
    idea.apply(seq(['A2','C3','E3']), 'change the final note');
    assert.equal(idea.snapshot().source.audioAvailable, false);
    assert.equal(idea.notes.length, 3);
    assert.equal(idea.edited, true);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm the missing module failure**

Run: `node --test --experimental-strip-types test/activeIdea.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/coach/activeIdea.ts`.

- [ ] **Step 3: Implement the active-idea types and context**

```ts
export interface ActiveIdeaSource {
  sessionId: string;
  startMs: number;
  endMs: number;
  audioRef?: string;
  audioAvailable: boolean;
}

export interface IdeaEdit {
  id: string;
  description: string;
  notes: NoteEvent[];
  at: number;
}

export interface ActiveIdeaSnapshot {
  id: string;
  sourcePhraseId: string;
  source: ActiveIdeaSource;
  originalNotes: NoteEvent[];
  notes: NoteEvent[];
  transcriptionConfidence: number;
  siblings: Phrase[];
  matches: RecognitionMatch[];
  history: IdeaEdit[];
  parent?: { riffId: string; versionId: string };
}

export class ActiveIdeaContext {
  apply(notes: NoteEvent[], description: string, at = Date.now()): void;
  undo(): boolean;
  revert(): void;
  analyze(): PhraseAnalysis;
  markAudioUnavailable(): void;
  setParent(parent: { riffId: string; versionId: string } | undefined): void;
  snapshot(): ActiveIdeaSnapshot;
}

export function openActiveIdea(input: {
  phrase: Phrase;
  source: Omit<ActiveIdeaSource, 'audioAvailable'>;
  siblings: Phrase[];
  matches: RecognitionMatch[];
  parent?: { riffId: string; versionId: string };
  tuning?: Tuning;
}): ActiveIdeaContext;
```

Clone all note arrays on input and output. Derive `audioAvailable` from a non-empty `audioRef`. Use `makeId('idea')` and `makeId('edit')`; never generate IDs in accessors.
Set `transcriptionConfidence` to the mean confidence of the original detected
notes, clamped to `0..1`; edits do not retroactively make the microphone more
certain about the original performance.

- [ ] **Step 4: Route conversation tools through the shared context**

Keep `ConversationWorkspace` as a small adapter so older callers compile:

```ts
export class ConversationWorkspace {
  private active: ActiveIdeaContext | null = null;
  openPhrase(phrase: Phrase): void {
    this.active = openActiveIdea({
      phrase,
      source:{ sessionId:'conversation', startMs:phrase.startMs, endMs:phrase.endMs },
      siblings:[], matches:[], tuning:this.tuning,
    });
  }
  attach(active: ActiveIdeaContext): void { this.active = active; }
  get context(): ActiveIdeaContext | null { return this.active; }
}
```

Change `ToolContext.workspace` to accept this adapter without altering tool names or response shapes. Add a converse regression asserting `apply`, `undo`, `revert`, and `save_phrase` all read the same shared notes.

- [ ] **Step 5: Run focused and full verification**

Run: `node --test --experimental-strip-types test/activeIdea.test.ts test/converse.test.ts`

Expected: PASS.

Run: `npm test && npm run typecheck && npm run build`

Expected: 493 or more tests pass; typecheck and build exit 0.

- [ ] **Step 6: Commit the shared context**

```bash
git add src/coach/activeIdea.ts src/converse/workspace.ts src/converse/tools.ts src/types.ts test/activeIdea.test.ts test/converse.test.ts
git commit -m "Unify work around one active musical idea"
```

### Task 2: Ranked Session Idea Index and Ambiguous Recall

**Files:**
- Create: `src/session/ideaIndex.ts`
- Modify: `src/session/session.ts`
- Modify: `src/index.ts`
- Test: `test/ideaIndex.test.ts`
- Test: `test/session.test.ts`

**Interfaces:**
- Consumes: settled `Phrase[]`, `groupMotifs()`, `qualityOf()`, current session time, and optional selected phrase ID.
- Produces: `IdeaCandidate`, `RecallChoice`, `SessionIdeaIndex.update()`, `SessionIdeaIndex.rank()`, `SketchbookSession.recallChoices()`.

- [ ] **Step 1: Write failing ranking and ambiguity tests**

```ts
describe('session idea index', () => {
  test('ranks a repeated motif above a newer stray phrase', () => {
    const index = new SessionIdeaIndex();
    index.update([
      phrase('a1',['E2','G2','A2'],0),
      phrase('a2',['E2','G2','B2'],2500),
      phrase('stray',['C3','D3','F3'],6000),
    ], 8000);
    assert.equal(index.rank()[0]?.representative.id, 'a2');
    assert.equal(index.rank()[0]?.takeCount, 2);
  });

  test('marks near-equal candidates as a choice instead of guessing', () => {
    const choice = recallChoice([
      candidate('low', .82, [40,43,45]),
      candidate('long', .79, [52,55,57,59,57]),
    ]);
    assert.equal(choice.kind, 'ambiguous');
    assert.deepEqual(choice.candidates.map(c => c.id), ['low','long']);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --experimental-strip-types test/ideaIndex.test.ts`

Expected: FAIL because `SessionIdeaIndex` and `recallChoice` do not exist.

- [ ] **Step 3: Implement candidate indexing and recall choice**

```ts
export interface IdeaCandidate {
  id: string;
  representative: Phrase;
  takes: Phrase[];
  takeCount: number;
  confidence: number;
  score: number;
  contour: number[];
  secondsAgo: number;
}

export type RecallChoice =
  | { kind:'none' }
  | { kind:'selected'; candidate:IdeaCandidate }
  | { kind:'ambiguous'; candidates:[IdeaCandidate, IdeaCandidate] };

export function recallChoice(candidates: IdeaCandidate[], ambiguityDelta = .06): RecallChoice;

export class SessionIdeaIndex {
  update(phrases: Phrase[], nowMs: number): void;
  rank(): IdeaCandidate[];
  get(id: string): IdeaCandidate | null;
}
```

Score with explicit weights: recurrence `.35`, phrase quality `.25`, recency `.20`, length suitability `.10`, and cohesion `.10`. Reject phrases shorter than three notes. Stable IDs derive from the representative phrase ID so repeated updates do not create new cards.

- [ ] **Step 4: Expose choices through `SketchbookSession`**

Add one `SessionIdeaIndex` instance to `SketchbookSession`; refresh it from `phrases()` inside:

```ts
recallChoices(): RecallChoice;
async recallCandidate(candidateId: string): Promise<Recall | null>;
```

Keep `whatDidIJustPlay()` backward compatible by selecting the first candidate only when `recallChoices().kind === 'selected'`. If ambiguous, its existing API may return the highest candidate, but the new Coach orchestration must use `recallChoices()` and ask the player.

- [ ] **Step 5: Add session regressions**

Add tests showing an explicit older phrase selection still recalls that phrase, continuous playing does not emit a candidate until settled, and candidates disappear when every source phrase expires from rolling memory.

- [ ] **Step 6: Run verification and commit**

Run: `node --test --experimental-strip-types test/ideaIndex.test.ts test/session.test.ts`

Expected: PASS.

Run: `npm test && npm run typecheck && npm run build`

```bash
git add src/session/ideaIndex.ts src/session/session.ts src/index.ts test/ideaIndex.test.ts test/session.test.ts
git commit -m "Rank the musical ideas in a live session"
```

### Task 3: Explicit Riff Lineage and Backward-Compatible Storage

**Files:**
- Create: `src/library/lineage.ts`
- Modify: `src/types.ts`
- Modify: `src/library/riffLibrary.ts`
- Modify: `src/library/localStorageStore.ts`
- Modify: `src/library/fileStore.ts`
- Test: `test/lineage.test.ts`
- Test: `test/library.test.ts`

**Interfaces:**
- Consumes: `ActiveIdeaSnapshot`, `RiffLibrary.findSimilar()`, and `compareNotes()` component scores.
- Produces: `IdeaRelationship`, `VersionProvenance`, `LineageSuggestion`, `resolveLineage()`, and provenance-aware `saveRiff()` / `addVersion()` options.

- [ ] **Step 1: Write failing relationship and migration tests**

```ts
describe('riff lineage', () => {
  test('separates another take from a deliberate variation', async () => {
    const library = new RiffLibrary();
    const riff = await library.saveRiff(seq(RIFF), { name:'Nylon Idea' });
    const take = await resolveLineage(seq(RIFF, 360), library);
    const variation = await resolveLineage(seq(VARIATION), library);
    assert.equal(take[0]?.relationship, 'take');
    assert.equal(variation[0]?.relationship, 'variation');
    assert.equal(take[0]?.riffId, riff.id);
  });

  test('reads version-one browser data and writes version two without loss', async () => {
    const storage = seededV1Storage();
    const store = new LocalStorageRiffStore(storage);
    const riff = (await store.listRiffs())[0]!;
    assert.equal(riff.versions.length, 2);
    await store.putRiff({ ...riff, notes:'still here' });
    assert.equal(JSON.parse(storage.getItem(DEFAULT_STORAGE_KEY)!).version, 2);
    assert.equal((await store.listRiffs())[0]?.notes, 'still here');
  });
});
```

- [ ] **Step 2: Run tests and confirm the absent lineage behavior**

Run: `node --test --experimental-strip-types test/lineage.test.ts test/library.test.ts`

Expected: FAIL for missing `resolveLineage` and storage version 2.

- [ ] **Step 3: Add provenance types and resolver**

```ts
export type IdeaRelationship = 'take' | 'variation' | 'transcription-revision';

export interface VersionProvenance {
  relationship: IdeaRelationship;
  sourcePhraseId?: string;
  transcriptionConfidence?: number;
  audioAvailable?: boolean;
}

export interface LineageSuggestion {
  riffId: string;
  versionId: string;
  riffName: string | null;
  relationship: Exclude<IdeaRelationship, 'transcription-revision'>;
  similarity: number;
  reason: string;
}

export async function resolveLineage(
  notes: NoteEvent[], library: RiffLibrary,
): Promise<LineageSuggestion[]>;
```

Classify `take` only when overall similarity is at least `.92`, pitch-level similarity is at least `.88`, and the aligned diff contains no inserted or replaced pitch. Classify other matches over `.78` as `variation`. Transcription revision is always an explicit player action and is never inferred from musical similarity.

- [ ] **Step 4: Add provenance-aware saves and version-2 migration**

Add `provenance?: VersionProvenance` to `RiffVersion`, `SaveRiffOptions`, and `AddVersionOptions`. Store it only when supplied, copying `transcriptionConfidence` from the active idea snapshot. Change `LibraryData.version` to `2`; `read()` must normalize missing arrays and return v1 riffs unchanged in memory until the next write.

Export version 2 while continuing to import version 1 and 2. Strip `audioRef` during portable export exactly as today; preserve provenance, comments, songs, and every branch.

- [ ] **Step 5: Pin deletion and storage failure behavior**

Add tests that delete the suggested riff before saving, then successfully call `saveRiff()` as a new root. Add a quota failure assertion proving the original in-memory `ActiveIdeaContext` is unchanged after the rejected library write.

- [ ] **Step 6: Run verification and commit**

Run: `node --test --experimental-strip-types test/lineage.test.ts test/library.test.ts`

Run: `npm test && npm run typecheck && npm run build`

```bash
git add src/types.ts src/library/lineage.ts src/library/riffLibrary.ts src/library/localStorageStore.ts src/library/fileStore.ts test/lineage.test.ts test/library.test.ts
git commit -m "Preserve how every riff version came to exist"
```

### Task 4: Pure Coach Session State Machine

**Files:**
- Create: `src/coach/sessionOrchestrator.ts`
- Modify: `src/coach/journey.ts`
- Modify: `src/coach/teacher.ts`
- Test: `test/sessionOrchestrator.test.ts`

**Interfaces:**
- Consumes: `RecallChoice`, `ActiveIdeaContext`, `guidedSessionPlan()`, and the current teacher lesson.
- Produces: `CoachSession`, `CoachState`, `CoachAction`, `CoachEffect`, and deterministic transition rules used by the browser.

- [ ] **Step 1: Write failing transition tests**

```ts
describe('Coach session orchestration', () => {
  test('moves from guidance into an idea and resumes the deferred lesson', () => {
    const coach = CoachSession.start({ lessonId:'open-g', journeyStage:'foundations' });
    coach.dispatch({ type:'choose-entry', stance:'guided' });
    coach.dispatch({ type:'idea-noticed', candidateId:'candidate-1' });
    coach.dispatch({ type:'stay-with-idea' });
    assert.equal(coach.state.kind, 'idea');
    assert.equal(coach.state.deferredLessonId, 'open-g');
    coach.dispatch({ type:'finish-idea' });
    assert.equal(coach.state.kind, 'guided');
    assert.equal(coach.state.lessonId, 'open-g');
  });

  test('does not interrupt final play or measured practice', () => {
    const coach = coachInGuidedPhase('play');
    assert.deepEqual(coach.dispatch({ type:'idea-noticed', candidateId:'c1' }), []);
    const practice = coachInPractice();
    assert.deepEqual(practice.dispatch({ type:'idea-noticed', candidateId:'c2' }), []);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `node --test --experimental-strip-types test/sessionOrchestrator.test.ts`

Expected: FAIL because the state machine is absent.

- [ ] **Step 3: Implement explicit state and action unions**

```ts
export type CoachState =
  | { kind:'entry'; suggestedLessonId:string | null; continuity:string | null }
  | { kind:'guided'; lessonId:string; phase:'warmup'|'learn'|'music'|'play'; pendingCandidateId?:string }
  | { kind:'listening'; pendingCandidateId?:string }
  | { kind:'recall-choice'; candidateIds:[string,string]; returnTo:'guided'|'listening' }
  | { kind:'idea'; activeIdeaId:string; recommendation:'understand'|'develop'|'practice'|'save'; deferredLessonId?:string }
  | { kind:'practice'; activeIdeaId:string; returnTo:'idea' }
  | { kind:'session-summary'; completedLessonId?:string; activeIdeaId?:string };

export type CoachEffect =
  | { type:'start-listening' }
  | { type:'open-candidate'; candidateId:string }
  | { type:'speak'; text:string }
  | { type:'persist-summary' };

export class CoachSession {
  static start(input:{ lessonId:string | null; journeyStage:string | null; continuity?:string | null }):CoachSession;
  get state():CoachState;
  dispatch(action:CoachAction):CoachEffect[];
}
```

Reject impossible actions without changing state. Queue a noticed candidate during guided warmup/learn/music, but suppress it during final play and measured practice. Returning from an idea restores the exact guided phase.

- [ ] **Step 4: Test ambiguous recall, explicit recall, and session summary**

Add cases for `recall-requested` with none/selected/ambiguous choices, selecting either candidate, `finish-idea`, and session completion with or without a saved idea.

- [ ] **Step 5: Run verification and commit**

Run: `node --test --experimental-strip-types test/sessionOrchestrator.test.ts test/journey.test.ts test/teacher.test.ts`

Run: `npm test && npm run typecheck && npm run build`

```bash
git add src/coach/sessionOrchestrator.ts src/coach/journey.ts src/coach/teacher.ts test/sessionOrchestrator.test.ts
git commit -m "Drive Coach with an explicit session state machine"
```

### Task 5: Remember Idea Work and Respect Dismissals

**Files:**
- Modify: `src/coach/playerModel.ts`
- Modify: `src/coach/oneRoom.ts`
- Test: `test/playerModel.test.ts`
- Test: `test/oneRoom.test.ts`

**Interfaces:**
- Consumes: saved riff/version identity, practice result, selected/rejected development dimension, and current player profile.
- Produces: `IdeaPracticeObservation`, `RecommendationDisposition`, `ideaPracticeObservation()`, `recordDisposition()`, and a dismissal-aware `recommendAdaptiveTask()`.

- [ ] **Step 1: Write failing evidence and dismissal tests**

```ts
test('idea practice can become the strongest next-session memory', () => {
  const observations = Array.from({length:3}, (_, i) => ideaPracticeObservation({
    riffId:'riff-1', versionId:'ver-2', accuracy:.62, tempoRatio:1.14,
    firstMistakeIndex:2, at:1000+i,
  }));
  const profile = buildPlayerProfile(emptyModel({ ideaPractices:observations }));
  const task = recommendAdaptiveTask(profile);
  assert.equal(task.kind, 'idea-practice');
  assert.equal(task.riffId, 'riff-1');
});

test('a dismissed recommendation stays gone until new evidence exists', () => {
  const store = new PlayerModelStore(fakeStorage());
  const task = seededIdeaTask(store);
  store.recordDisposition({ recommendationId:task.id, action:'dismissed', evidenceVersion:3, at:2000 });
  assert.notEqual(store.recommendation()?.id, task.id);
  store.recordIdeaPractice(newIdeaEvidence({ at:3000 }));
  assert.ok(store.recommendation());
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `node --test --experimental-strip-types test/playerModel.test.ts test/oneRoom.test.ts`

- [ ] **Step 3: Version and extend the player-model data**

```ts
export interface IdeaPracticeObservation {
  id: string;
  riffId: string;
  versionId: string;
  accuracy: number;
  tempoRatio: number;
  firstMistakeIndex: number | null;
  at: number;
}

export interface RecommendationDisposition {
  recommendationId: string;
  action: 'accepted' | 'dismissed';
  evidenceVersion: number;
  at: number;
}
```

Migrate model version 1 to version 2 with empty `ideaPractices` and `dispositions`. Give each adaptive recommendation a stable ID derived from its evidence type and target. A dismissal suppresses the same ID while the profile evidence version is unchanged.

- [ ] **Step 4: Add one continuity sentence selector**

Add:

```ts
export function continuityMemory(profile: PlayerProfile): string | null;
```

Return only the highest-confidence recent memory, such as `Last time the ending of Nylon Idea kept changing.` Return `null` when evidence is insufficient or the recommendation was dismissed.

- [ ] **Step 5: Run verification and commit**

Run: `node --test --experimental-strip-types test/playerModel.test.ts test/oneRoom.test.ts`

Run: `npm test && npm run typecheck && npm run build`

```bash
git add src/coach/playerModel.ts src/coach/oneRoom.ts test/playerModel.test.ts test/oneRoom.test.ts
git commit -m "Let Coach remember work on the player's own riffs"
```

### Task 6: Wire the One-Room Coach Shell to the Domain State

**Files:**
- Create: `web/views/coach/entry.ts`
- Create: `web/views/coach/trail.ts`
- Create: `web/views/coach/shell.ts`
- Modify: `web/views/coach.ts`
- Modify: `web/views/context.ts`
- Modify: `web/app.ts`
- Modify: `web/mvp.css`
- Modify: `web/learning.css`
- Test: `test/copy.test.ts`
- Test: `test/sessionOrchestrator.test.ts`

**Interfaces:**
- Consumes: `CoachSession`, `SessionIdeaIndex`, `RecallChoice`, `ActiveIdeaContext`, existing `AppContext.startListening()`, and current lesson selection.
- Produces: one mounted Coach shell with stable entry, session trail, primary action, and effect runner.

- [ ] **Step 1: Add copy and state-contract tests**

Extend `test/copy.test.ts` to assert the shipped Coach source contains both `Guide me` and `Listen while I play`, contains a permanently reachable `What did I just play?`, and does not contain retired dashboard headings. Extend orchestrator tests to assert entry requires one decision and both decisions emit `start-listening` at most once.

- [ ] **Step 2: Run tests and confirm the new contract fails**

Run: `node --test --experimental-strip-types test/copy.test.ts test/sessionOrchestrator.test.ts`

Expected: FAIL because the entry actions and recall control are not present.

- [ ] **Step 3: Add a persistent Coach runtime to `AppContext`**

```ts
export interface CoachRuntime {
  session: CoachSession;
  activeIdea: ActiveIdeaContext | null;
  dispatch(action: CoachAction): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export interface AppContext {
  // existing fields remain
  coach: CoachRuntime;
}
```

Construct the runtime once in `web/app.ts`; do not recreate it when the mic starts or the Coach re-renders. Run `CoachEffect`s at this browser boundary.

- [ ] **Step 4: Extract the shell without changing lesson internals**

`coach/shell.ts` owns the stable stage, action row, live-hearing strip, and workbench host. `coach/entry.ts` renders the two starting actions plus one continuity sentence. `coach/trail.ts` renders at most five settled candidates with timestamp, contour, repeat count, and an accessible button label.

Move only shell/entry/trail responsibilities out of `web/views/coach.ts`; keep the existing lesson renderers intact for this task. The primary action must precede the quiet secondary action in DOM order.

- [ ] **Step 5: Wire mic phrases into candidate notices without interruption**

On settled phrase updates, refresh the index and dispatch `idea-noticed`. Render the quiet notice only when the state machine retains a pending candidate. Do not call `render()` on every note; update the live strip and trail incrementally.

- [ ] **Step 6: Keep unsaved work visible on storage failure**

When a save promise rejects, retain `context.coach.activeIdea`, render `Not saved yet — your idea is still open here`, and provide `Try saving again` as the primary action. Do not navigate to Library after a failed save.

- [ ] **Step 7: Run verification and commit**

Run: `node --test --experimental-strip-types test/copy.test.ts test/sessionOrchestrator.test.ts`

Run: `npm test && npm run typecheck && npm run build`

```bash
git add web/views/coach/entry.ts web/views/coach/trail.ts web/views/coach/shell.ts web/views/coach.ts web/views/context.ts web/app.ts web/mvp.css web/learning.css test/copy.test.ts test/sessionOrchestrator.test.ts
git commit -m "Give Coach one continuous session room"
```

### Task 7: Active-Idea Workbench, Practice, Conversation, and Save

**Files:**
- Create: `web/views/coach/idea.ts`
- Create: `web/views/coach/saveIdea.ts`
- Modify: `web/views/coach.ts`
- Modify: `web/views/recall.ts`
- Modify: `web/views/converse.ts`
- Modify: `web/views/conversation.ts`
- Modify: `src/converse/conversation.ts`
- Modify: `scripts/serve.mjs`
- Modify: `web/mvp.css`
- Test: `test/converse.test.ts`
- Test: `test/lineage.test.ts`
- Test: `test/copy.test.ts`

**Interfaces:**
- Consumes: one `ActiveIdeaContext`, `planPhrase()`, `practiceAttempt()`, `hardPartTarget()`, `resolveLineage()`, and player-model recording methods.
- Produces: `ideaWorkbench()`, `saveIdeaFlow()`, shared local/model conversation, and provenance-aware saves.

- [ ] **Step 1: Add failing shared-workspace and failure-retention tests**

```ts
test('model failure cannot erase deterministic edits', async () => {
  const active = testActiveIdea();
  active.apply(seq(['E2','G2','B2']), 'lift the ending');
  const conversation = new Conversation({
    transport:{ complete:async () => { throw new Error('offline'); } },
    tools:toolContext(active),
  });
  await assert.rejects(() => conversation.ask('why does that work?'));
  assert.deepEqual(active.notes.map(n => n.midi), seq(['E2','G2','B2']).map(n => n.midi));
  assert.equal(active.edited, true);
});
```

Also assert `saveIdeaFlow()` never auto-selects a lineage suggestion and that a transcription revision requires an explicit action.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `node --test --experimental-strip-types test/converse.test.ts test/lineage.test.ts test/copy.test.ts`

- [ ] **Step 3: Implement the one-recommendation idea workbench**

Render, in order:

1. Original audio playback when present, otherwise `The recording has expired; the detected notes are still here.`
2. Detected contour and compact probable tab with `probable` language.
3. One recommendation from `planPhrase()` mapped to understand, develop, practice, or save.
4. One primary action and `Choose another direction` disclosure.

Conversation and local commands attach to the existing `ActiveIdeaContext`; they must not instantiate a second workspace. Practice selects the current working notes and records `IdeaPracticeObservation` against the parent riff/version when available.

- [ ] **Step 4: Implement explicit lineage save choices**

`saveIdeaFlow()` shows:

- `Save as a new idea`;
- `Add as another take of <name>` when resolver says `take`;
- `Add as a variation of <name>` when resolver says `variation`;
- `Correct the detected notes` only after the player opens transcription correction.

The resolver recommendation is pre-explained but never pre-committed. If its target vanished, catch the missing-riff error and return the player to `Save as a new idea` with their active context untouched.

- [ ] **Step 5: Make model selection configurable and preserve local fallback**

Replace the hard-coded exported model constant with:

```ts
export const DEFAULT_CONVERSATION_MODEL = 'claude-opus-5';
```

Pass `process.env.ANTHROPIC_MODEL ?? DEFAULT_CONVERSATION_MODEL` from `scripts/serve.mjs` in `/api/status`, and construct the browser `Conversation` with the reported model. A failed status or chat request keeps the local router mounted against the same active context.

- [ ] **Step 6: Retire the separate recall dashboard from the primary flow**

Keep `recallPanel()` working for backward-compatible routes, but have Coach open the new inline workbench. Remove duplicated save/conversation state from `recall.ts`; call the shared idea and save components instead.

- [ ] **Step 7: Run verification and commit**

Run: `node --test --experimental-strip-types test/converse.test.ts test/lineage.test.ts test/copy.test.ts test/playerModel.test.ts`

Run: `npm test && npm run typecheck && npm run build`

```bash
git add web/views/coach/idea.ts web/views/coach/saveIdea.ts web/views/coach.ts web/views/recall.ts web/views/converse.ts web/views/conversation.ts src/converse/conversation.ts scripts/serve.mjs web/mvp.css test/converse.test.ts test/lineage.test.ts test/copy.test.ts
git commit -m "Turn a live phrase into the next lesson"
```

### Task 8: Documentation, Fixture Harness, and Release Verification

**Files:**
- Create: `scripts/validate-fixtures.mjs`
- Create: `validation/fixtures.schema.json`
- Create: `validation/README.md`
- Create: `validation/REPORT.md`
- Modify: `docs/PRODUCT_VISION.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/VALIDATION.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `web/service-worker.js`
- Modify: `.github/workflows/ci.yml`
- Test: `test/fixtureValidation.test.ts`

**Interfaces:**
- Consumes: mono WAV fixture files plus human-reviewed annotations.
- Produces: `npm run validate:fixtures`, a machine-generated validation summary, corrected product documentation, and a new PWA cache generation.

- [ ] **Step 1: Write the failing fixture-validator contract**

```ts
test('fixture validation reports pitch, onset and recall accuracy', async () => {
  const result = await validateFixture({
    wavPath:'test/fixtures/steel-open-e.wav',
    expected:[{ midi:40, startMs:100, toleranceMs:80 }],
    expectedRecallPhrase:'open-e',
  });
  assert.equal(typeof result.missedNotes, 'number');
  assert.equal(typeof result.extraNotes, 'number');
  assert.equal(typeof result.octaveErrors, 'number');
  assert.equal(typeof result.meanOnsetErrorMs, 'number');
  assert.equal(typeof result.correctRecallRank, 'number');
});
```

Use a tiny generated WAV fixture checked into `test/fixtures/` for CI. Real instrument WAVs stay outside Git unless Brandon explicitly approves publishing them.

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test --experimental-strip-types test/fixtureValidation.test.ts`

- [ ] **Step 3: Implement the dependency-free fixture harness**

`scripts/validate-fixtures.mjs` parses PCM16/PCM32-float mono WAV, feeds existing `FrameStreamer` and `NoteTracker`, builds session candidates, compares detections with annotated pitch/onset tolerances, and exits nonzero when a fixture exceeds its declared limits.

Add:

```json
"validate:fixtures": "node scripts/validate-fixtures.mjs validation/manifest.json"
```

CI runs the generated fixture set. `validation/README.md` gives exact recording settings: mono WAV, 44.1 or 48 kHz, no normalization, five seconds of room tone, then the annotated performance.

- [ ] **Step 4: Create the real-instrument validation manifest and report format**

The manifest enumerates steel-string, nylon-string, amplified/direct electric when available, open strings, frets 3/5/7, repeated notes, ringing bass with upper notes, hammer-ons, pull-offs, slides, muted notes, fret buzz, chord strums, standard/DADGAD, capo, and recurring low-E riff shapes.

`validation/REPORT.md` must distinguish `not recorded`, `recorded`, `passed`, and `failed`. Do not mark the release complete while any required physical fixture remains `not recorded`.

- [ ] **Step 5: Reconcile the product documentation**

Update the governing sentence to:

> The player's own music is the preferred curriculum; the structured journey gives the player a useful next step whenever their own music does not.

Mark model-backed riff conversation as built and optional, document the active-idea and lineage architecture, and keep full polyphony/cloud sync under honest limitations.

- [ ] **Step 6: Bump the installed-app cache and verify CI**

Change `CACHE` to `guitar-ai-coach-v22-persistent-intelligence`. Add `npm run validate:fixtures` after `npm test` in CI.

Run: `npm test && npm run validate:fixtures && npm run typecheck && npm run build`

Expected: all commands exit 0.

- [ ] **Step 7: Perform browser verification**

Start with `npm start`, then verify at desktop and phone widths:

- first-run placement followed by both entry choices;
- mic denial and retry;
- guided lesson -> noticed idea -> inline workbench -> resume lesson;
- ambiguous recall selection;
- edit -> practise -> failed save -> retry -> lineage confirmation;
- local conversation fallback with no API credentials;
- model failure after a local edit;
- keyboard-only navigation and visible focus;
- reduced-motion rendering;
- installed PWA refresh from cache v21 to v22.

Record each result in `validation/REPORT.md`. Physical iPhone/iPad microphone validation remains a named release gate if unavailable in the execution environment.

- [ ] **Step 8: Commit the release evidence**

```bash
git add scripts/validate-fixtures.mjs validation test/fixtureValidation.test.ts docs README.md package.json web/service-worker.js .github/workflows/ci.yml
git commit -m "Validate and document persistent musical intelligence"
```

### Task 9: Whole-Branch Verification and Pull Request

**Files:**
- Modify only files required by findings from the final review.

**Interfaces:**
- Consumes: all tasks and acceptance criteria from the specification.
- Produces: one reviewed branch and pull request whose description lists verified behavior and remaining physical-device gates.

- [ ] **Step 1: Run the complete automated story**

Run:

```bash
npm ci
npm test
npm run validate:fixtures
npm run typecheck
npm run build
git diff --check origin/main...HEAD
```

Expected: every command exits 0 with no whitespace errors.

- [ ] **Step 2: Audit every acceptance criterion**

Create a ten-row checklist in the pull-request body matching the design spec acceptance criteria. Link each completed criterion to its test file or browser-validation row. Label unavailable physical-device validation as a release gate, not as passed.

- [ ] **Step 3: Run final code review and fix findings**

Review specifically for duplicated active-idea state, accidental audio persistence, silent lineage merges, state-machine bypasses in `web/views/coach.ts`, migration data loss, and any model-written musical claims not backed by tools. Apply each accepted fix with its regression test.

- [ ] **Step 4: Repeat verification after fixes**

Run the Step 1 command block again and confirm the Git tree being reviewed is the Git tree being pushed.

- [ ] **Step 5: Push and open the pull request**

```bash
git push -u origin codex/persistent-musical-intelligence-rework
```

Open the pull request against `main` with the architecture summary, test totals, browser results, migration guarantee, privacy boundary, and remaining physical-device validation gates.
