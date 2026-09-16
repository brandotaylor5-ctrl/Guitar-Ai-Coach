# Architecture

## The shape of it

The product's value is in the layers *above* pitch detection. So the code is
arranged to keep the musical intelligence pure, portable and testable, with all
signal processing pushed to a single edge.

```
   audio in  ──▶  audio/      samples → discrete notes   (the only DSP)
                    │
                    ▼
                 memory/      a rolling window of recent notes. Forgets by default.
                    │
                    ▼
                 phrase/      carve notes into ideas; compare, diff, group, edit
                    │
                    ├──▶ music/        notes, scales, rhythm, fretboard
                    ├──▶ explain/      say what was found, beginner-first
                    ├──▶ create/       suggestions built from the player's material
                    ├──▶ practice/     coach an attempt at your own riff
                    └──▶ fingerprint/  what your habits look like over time
                    │
                    ▼
                 library/     riffs, versioned and never overwritten
                    │
                    ▼
                 session/     the thing that behaves like another musician
```

`session/` is the only module that knows about all the others. Everything below
it is independently usable and independently tested.

The browser app sits on top and holds no musical logic of its own:

```
web/audio/     microphone capture, playback, WAV encoding, the clip store
web/ui/        DOM helpers and shared renderers (tab, fretboard, explanations)
web/views/     one module per screen
web/app.ts     owns the session, routes between views
```

Views declare `onNotes` only if they show live playing. The library and song
screens deliberately do not: rebuilding a screen someone is working in every
time a note arrives pulls the ground out from under them mid-click.

## Three threads

Detection costs about a fifth of a core at a 512-sample hop, measured on a fast
machine — enough to make an interface stutter if it shared a thread with
rendering. So the work is split:

```
audio thread   capture-worklet.js   copies samples, posts 2048-frame chunks
main thread    app.ts               retains audio, renders, handles results
worker         detector.worker.ts   FrameStreamer + NoteTracker → NoteEvents
```

The worklet does nothing but copy, because the audio thread must never miss a
deadline. The main thread writes each chunk into the retention ring — cheap —
and transfers it to the worker, which posts back finished notes. The session is
constructed with `audio.detect: false` so it retains audio without duplicating
the detection already happening off-thread.

## No bundler

Node can strip TypeScript types itself (`node:module`'s `stripTypeScriptTypes`),
so `scripts/build.mjs` is about sixty lines: blank the types, rewrite `./x.ts`
specifiers to `./x.js`, mirror the tree into `dist/`. Stripping preserves source
positions, so line numbers in the emitted JavaScript still match the TypeScript.
The project ships no runtime dependencies, and there is no toolchain to keep up
to date. TypeScript is a dev dependency, used only by `npm run typecheck`;
nothing else needs it.

`dist/` mirrors the repository root, so every relative import resolves to the
same place it did in source. The dev server redirects `/` to `/web/index.html`
rather than rewriting the path internally — a rewrite would leave the browser
resolving the page's relative URLs against the wrong directory.

## Where state lives in the browser

| What | Where | Survives reload |
|---|---|---|
| Recent notes | `RollingMemory`, one minute | No, by design |
| Recent audio | `AudioRingBuffer`, one minute | No, by design |
| Riffs and versions | `localStorage` | Yes |
| Saved recordings | IndexedDB (`ClipStore`) | Yes |

The top two forget continuously and the bottom two are only ever written when
the player saves something. That split is the whole privacy story, and it is
enforced by which object holds what rather than by a policy.

## Why these boundaries

**Audio is quarantined.** `audio/` is the only place that touches `Float32Array`
samples. Everything above it speaks in `NoteEvent`s — `{ midi, startMs,
durationMs, confidence }`. That means the entire musical brain can be tested
without an audio device, runs identically in a browser or on a server, and could
be driven by MIDI or a file just as easily as by a microphone.

**Memory forgets by default.** `RollingMemory` holds structured pitch data for a
fixed window and prunes continuously. `AudioRingBuffer` is separate, optional,
and overwrites itself; the only door out of it is `extract()`, called when the
player saves something. Continuous listening is only acceptable if the system is
structurally incapable of hoarding — so that property lives in the types, not in
a policy document.

**The library branches, never overwrites.** `RiffLibrary.addVersion()` attaches
a new version to the one it grew from. There is no update-in-place operation for
a version's notes. Version control for music only works if destroying history is
not expressible in the API.

**Suggestions are derived, not retrieved.** `create/` has no lick library. Every
suggested note is drawn from the scale, register and rhythm of the phrase the
player just played, and clamped to the range of the instrument they are holding.

## Key algorithms

| Problem | Approach | Where |
|---|---|---|
| Pitch detection | McLeod Pitch Method (normalised square difference), first key peak above threshold | `audio/pitchDetect.ts` |
| Pitch stream → notes | State machine with median smoothing, stability confirmation, level-based re-onset | `audio/noteTracker.ts` |
| Where the fingers went | Dynamic programming over every candidate position, minimising hand travel | `music/fretboard.ts` |
| What scale is this | Score every (tonic, scale) pair on coverage, tonic weight and parsimony | `music/key.ts` |
| What tempo is this | Search 40–220 bpm for the pulse best explaining the onset gaps | `music/rhythm.ts` |
| Where do ideas end | Rest-based segmentation with a threshold adapted to the player's own pace | `phrase/segment.ts` |
| Is this the same idea | Interval + rhythm + contour similarity over a Needleman-Wunsch alignment | `phrase/similarity.ts` |
| What changed | The same aligner, run on absolute pitch so the answer names real notes | `phrase/diff.ts` |
| Which take was cleanest | Detector confidence, timing steadiness, articulation | `phrase/quality.ts` |
| Slowing audio down | WSOLA: overlapping windows relaid at a new spacing, each nudged to the best-matching nearby position | `audio/timeStretch.ts` |

One aligner (`phrase/align.ts`) serves similarity, diffing and practice
feedback. Nearly every question this product answers reduces to lining two
musical sequences up against each other.

### Why similarity is transposition- and tempo-invariant

A riff played three frets higher, or a little faster, or with one note changed,
is still the same idea. So similarity compares *interval shape*, *rhythmic
shape* and *melodic contour* — all invariant to the things a player changes
without meaning to. Absolute pitch level is reported separately
(`pitchLevelSimilarity`) so a caller can tell "same idea, different key" from
"same idea, same key" when that distinction matters.

## Conventions

- **No runtime dependencies.** Node 22+ strips TypeScript natively, so `npm
  test` runs the `.ts` files directly and the browser build needs no bundler.
  TypeScript itself is a dev dependency for `npm run typecheck`.
- **Erasable syntax only.** No `enum`, no `namespace`, no parameter properties —
  they cannot be stripped without a compiler. `tsconfig.json` enforces this with
  `erasableSyntaxOnly`.
- **Explicit `.ts` extensions** on every relative import, as native stripping
  requires.
- **Edits are non-destructive.** Everything in `phrase/edit.ts` returns new
  notes and leaves the input untouched.
- **Confidence is reported, never hidden.** Estimators return a confidence and
  the explanation layer is expected to hedge when it is low. Two notes cannot
  pin down a scale and the app should say so.

## Testing

`npm test` runs 166 tests across 7 files, with no network and no audio hardware.

Notable: `test/audio.test.ts` synthesises plucked-string tones with a
deliberately *weak fundamental* — the classic octave-error trap — and asserts
the whole pipeline recovers the exact riff from ragged, arbitrarily-sized audio
blocks. `test/assistant.test.ts` asserts the beginner-first rule mechanically,
by scanning the plain-language output for a list of theory terms that must never
appear there.
