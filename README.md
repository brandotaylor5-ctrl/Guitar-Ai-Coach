# Guitar AI Coach

**An intelligent musical sketchbook, riff memory and guitar collaborator.**

Guitarists improvise, noodle, and accidentally play something they love — then
forget exactly what they played. This listens during a session, recognises
musical phrases, remembers them, compares them, and helps develop them.

It is not a tuner, and it is not a guitar course. Live note recognition is only
the foundation. **Your own playing is the curriculum.**

> 📖 **[docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) is the governing
> document.** Every design decision should trace back to it.
> [Architecture](docs/ARCHITECTURE.md) · [Roadmap & status](docs/ROADMAP.md)

## The headline interaction

You play for a while. Nobody pressed record. Then you ask:

> "Wait — what was that thing I just played?"

```
I think you mean this phrase from about 12 seconds ago:

  E2 → G2 → A2 → B2 → G2 → E2

You played a variation of it three times.

The second version was:
  E2 → G2 → A2 → C3 → B2 → G2
  (You added C3, you dropped E2.)

The third version was the cleanest.

Do you want to save one of them as a riff?
```

That output is real — it comes from `npm run demo`, driven by synthesised audio
through the actual pipeline.

## Try it

Requires **Node 22.6+** (it strips TypeScript natively, so there is no build
step to configure and nothing to install).

```bash
npm start       # build and serve the app → http://localhost:4173
npm run demo    # the whole vision in the terminal, from synthesised audio
npm test        # 183 tests, no network and no audio hardware needed
```

`npm start` opens the browser app: plug in, press **Start listening**, play for
a while, then press **What did I just play?**

### In the browser

- **Session** — a live note readout, the ideas it has picked out drawn on a
  minute-long timeline, and the one button that matters. Click any idea on the
  timeline to ask about that one instead of the last thing you played.
- **Riff Library** — your riffs, each with its version tree, tab, fretboard
  diagram, original recording, and a plain-language read of what it is.
- **Practice** — pick a version, hear it, play it back, get coached. Slow it to
  75% or 50% without the pitch moving.
- **Fingerprint** — what your habits look like once there are enough ideas to
  say anything honest.

Pitch detection runs in a Web Worker and capture in an AudioWorklet, so the
interface stays responsive while the audio thread never misses a deadline.
Riffs persist in local storage and saved recordings in IndexedDB — on your
machine, in your browser. Nothing is uploaded, because there is no server to
upload it to.

Needs a recent Chrome, Edge, Firefox or Safari (AudioWorklet and module
workers). Microphone access requires `localhost` or HTTPS.

## What it does

```ts
import { SketchbookSession } from './src/index.ts';

const session = new SketchbookSession({ audio: { sampleRate: 44100 } });

// Feed it microphone audio as it arrives.
session.feedAudio(chunk);

// Later — "what did I just play?"
const recall = await session.whatDidIJustPlay();
console.log(recall.say);

// Keep it. It becomes Version A, and is never overwritten.
const riff = await session.saveRiff(recall.cleanest, { name: 'Late Night Thing' });
```

Beyond that: tablature and probable fingerings, key and tempo estimates,
beginner-first explanations of *why* a phrase sounds the way it does, endings
generated from your own scale, practice coaching against your own riff, and a
musical fingerprint of your habits across sessions. See the
[roadmap](docs/ROADMAP.md) for what is built and what is not.

## Design commitments

These are structural, not aspirational — they are enforced by the type system
and the tests:

- **It forgets by default.** Pitch memory rolls and prunes; the audio ring
  overwrites itself. Nothing is retained unless you explicitly save it.
- **Riffs branch, never overwrite.** There is no API for destroying a version's
  history. Version control for music only works if losing work is inexpressible.
- **Suggestions are derived, not retrieved.** There is no lick library. Every
  suggested note comes from the scale, register and rhythm of what *you* just
  played — and is clamped to the range of the instrument you are holding.
- **Theory comes last, never first.** The plain-language output is scanned by a
  test for theory jargon. "The G you keep using is the note that makes this
  sound dark — on your low E string, that's the 3rd fret" comes before anyone
  says the words *minor third*.
- **Confidence is reported, not hidden.** Two notes cannot pin down a scale, and
  the app says so rather than guessing with a straight face.

## Layout

```
web/              the browser app: capture, playback, and the interface.
scripts/          a 60-line build (Node strips the types) and a static server.

src/audio/        samples → discrete notes. The only DSP in the project.
src/music/        notes, scales, rhythm, fretboard reasoning.
src/phrase/       carving notes into ideas; comparing, diffing, grouping them.
src/memory/       what a session remembers, and for how long.
src/library/      your riffs, versioned.
src/explain/      saying what was found, beginner-first.
src/create/       suggestions, generated from your own material.
src/practice/     playing your riff back to you and coaching the attempt.
src/fingerprint/  what your habits look like over time.
src/session/      the thing that behaves like another musician in the room.
```

`src/` has no browser dependencies and `web/` holds no musical logic — which is
why the same core runs under `node --test` with no audio hardware at all.
