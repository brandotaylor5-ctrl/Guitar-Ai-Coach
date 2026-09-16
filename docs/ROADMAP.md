# Roadmap

Honest status. The **musical intelligence core**, the **audio foundation**
beneath it, and a **browser app** on top of it all work. `npm start` gives you
something you can plug a guitar into.

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
| Live microphone input | ✅ AudioWorklet capture, detection in a Web Worker | `web/audio/capture.ts` |
| The session screen | ✅ Live readout, phrase timeline, motif colouring | `web/views/session.ts` |
| "PLAY THIS WITH ME" | ✅ Additive pluck synthesis of any riff or suggestion | `web/audio/playback.ts` |
| Original audio on a saved riff | ✅ Kept in IndexedDB, survives a reload | `web/audio/clipStore.ts` |
| Fretboard diagrams | ✅ Numbered by playing order, repeats folded together | `web/ui/render.ts` |
| Practice Mode in the app | ✅ Hear it, play it, get coached, slow it down | `web/views/practice.ts` |
| Library persistence | ✅ Local storage, with export/import | `library/localStorageStore.ts` |

Run `npm run demo` for the whole vision in the terminal, or `npm start` to use
it with an actual guitar.

## Not built yet

**Time-stretching the player's own recording.** `buildPracticePlan` slows the
*note data* without changing pitch, so the synthesised playback slows down
correctly. Slowing the actual recording of your guitar without the pitch
dropping needs a phase vocoder, which is not written.

**Riff conversation.** The suggestion primitives exist (`create/suggest.ts`) but
nothing routes natural language to them. This is where an LLM belongs: parsing
"make the ending darker" into a call against the player's actual phrase. The
musical operations it would call are already in place and tested.

**Polyphony.** Pitch detection is monophonic. Chords are currently only
*suggested*, not *detected*. Polyphonic transcription is a substantially harder
problem and should be treated as its own project, not a patch to
`pitchDetect.ts`.

**Live recognition during play.** `findSimilar` works and the recall screen
reports a match when you ask, but nothing runs it continuously to interrupt
with "that's close to Riff 14" unprompted. The debounce and
interruption-etiquette questions there are product design, not engineering.

**Song Seed has no screen.** The grouping and the "these riffs seem related"
detection both work and are reachable from the library, but there is no
workspace for arranging riffs into sections.

**Nothing syncs.** Riffs live in one browser on one machine. The export/import
on `LocalStorageRiffStore` is the manual version of an answer; recordings in
IndexedDB are not included in it.

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
- **`tsc --noEmit` has not been run in this environment.** The project has no
  dependencies by design, and Node's type stripping checks syntax but not
  types. Run `npm run typecheck` with TypeScript installed to check them.
  Runtime behaviour is covered by the test suite and by browser testing against
  a fake microphone device.
- **The browser app has no automated test in the repository.** It was verified
  end to end by driving Chromium with a WAV file as a fake microphone — real
  audio in, riffs saved, clips surviving a reload — but that harness needs
  Playwright, which would mean a dependency. The musical logic it exercises is
  all covered by `npm test`.
- **Saved recordings are uncompressed.** A clip is a few seconds of 32-bit
  float, so a large library will eventually press against browser storage
  quotas. Encoding to Opus via `MediaRecorder` is the obvious fix.
