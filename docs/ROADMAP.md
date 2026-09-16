# Roadmap

Honest status. This repository currently contains the **musical intelligence
core** and the **audio foundation** beneath it. There is no user interface yet.

## Built and tested

| Vision feature | Status | Where |
|---|---|---|
| Live note recognition | ✅ MPM pitch detection → discrete notes, verified end-to-end on synthesised audio | `audio/` |
| Ghost Capture / Instant Recall | ✅ Rolling pitch memory, audio ring that forgets by default | `memory/` |
| Riff capture (phrase detection) | ✅ Adaptive rest-based segmentation | `phrase/segment.ts` |
| "You played this four times" | ✅ Motif grouping across a session | `phrase/motif.ts` |
| "The third was the cleanest" | ✅ Take quality scoring | `phrase/quality.ts` |
| A/B comparison — "what changed?" | ✅ Aligned diff with plain-language summary | `phrase/diff.ts` |
| Riff Library | ✅ In-memory and JSON-file stores | `library/` |
| Riff evolution / version control | ✅ Branching versions, combine, keep-both | `library/riffLibrary.ts` |
| Recognition across sessions | ✅ Transposition-invariant matching against every version | `library/riffLibrary.ts` |
| Tablature + fretboard positions | ✅ Hand-travel-minimising fingering, ASCII tab | `music/fretboard.ts` |
| Key / scale estimate | ✅ With honest confidence | `music/key.ts` |
| Tempo / rhythm estimate | ✅ | `music/rhythm.ts` |
| Beginner-first explanations | ✅ Enforced by test | `explain/` |
| "Why does this sound sad?" | ✅ | `explain/explain.ts` |
| Riff completion (three endings) | ✅ Generated from the player's own scale and register | `create/suggest.ts` |
| "A riff that answers this one" | ✅ Contour inversion, clamped to the instrument | `create/suggest.ts` |
| "What chord sits underneath?" | ✅ | `create/suggest.ts` |
| Practice Mode coaching | ✅ Including slow-down without pitch change | `practice/` |
| Musical Fingerprint | ✅ Refuses to invent habits from thin material | `fingerprint/` |
| Song Seed grouping | ✅ Basic grouping + "these riffs seem related" | `library/riffLibrary.ts` |
| The headline recall interaction | ✅ `session.whatDidIJustPlay()` | `session/` |

Run `npm run demo` to see the whole vision executed end to end, from
synthesised audio through to the fingerprint.

## Not built yet

**User interface.** Nothing visual exists. The core is deliberately
framework-free so a UI can sit on top of it; the natural next step is a browser
app wiring `getUserMedia` → `AudioWorklet` → `SketchbookSession`, with a live
note display, a phrase timeline, and the Riff Library.

**Audio playback.** "PLAY THIS WITH ME" needs a playback engine. Saved clips are
currently held in memory as `Float32Array` and are not encoded or persisted;
`RiffVersion.audioRef` is the hook where a real audio store belongs.

**Time-stretching audio.** `buildPracticePlan` slows the *note data* without
changing pitch, which is correct for a click-along or a synthesised playback. To
slow down the player's own *recording* without changing its pitch needs a phase
vocoder, which is not written.

**Riff conversation.** The suggestion primitives exist (`create/suggest.ts`) but
nothing routes natural language to them. This is where an LLM belongs: parsing
"make the ending darker" into a call against the player's actual phrase. The
musical operations it would call are already in place and tested.

**Polyphony.** Pitch detection is monophonic. Chords are currently only
*suggested*, not *detected*. Polyphonic transcription is a substantially harder
problem and should be treated as its own project, not a patch to
`pitchDetect.ts`.

**Live recognition during play.** `findSimilar` works, but nothing yet runs it
continuously to interrupt with "that's close to Riff 14". The debounce and
interruption-etiquette questions there are product design, not engineering.

## Known limitations

- **Pitch detection is O(window × τ-range) per frame.** Roughly 5 ms per frame
  on this machine, inside the ~11 ms budget at 44.1 kHz with a 512-sample hop —
  but with little headroom. An FFT-based autocorrelation is the optimisation
  path if it proves tight on real hardware.
- **Motif grouping is order-dependent** by design (single greedy pass, cheap
  enough to run live between phrases). Batch re-clustering of a whole session
  would give tidier groups and could run when the session ends.
- **Scale estimation has no harmonic context.** It reads melody only, so a
  phrase that implies a chord change will be reported as one scale.
- **Tempo estimation assumes a roughly steady pulse.** Rubato playing will
  report low confidence, which is correct, but the app has nothing better to say
  in that case yet.
- **`tsc --noEmit` has not been run**; there is no network access to install
  TypeScript, and the project has no dependencies by design. Types are checked
  by an editor or by installing TypeScript locally. Runtime behaviour is covered
  by the test suite.
