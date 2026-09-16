# Reliability and instrument setup

Run `npm ci`, `npm test`, `npm run typecheck`, and `npm run build`.

Regression tests cover expiration with silent audio and external detection,
settled-only unsolicited recognition, practice version selection, tempo scoring,
slow practice, portable recording references, empty versions, tuning/capo
mapping, and room-noise calibration.

The instrument controls support Standard, Drop D, Eb standard, DADGAD, and
six custom open-string notes with octave numbers. Enter notes low string first.
Capo 0 means none; otherwise tablature is relative to the capo and note names
are sounding pitches. Instrument settings describe the guitar currently being
used, not a historical tuning saved with each riff.

Start listening to unlock microphone names, then stop before selecting another
input. Room-noise calibration samples two seconds with the strings muted and
sets a noise gate. It does not train or validate pitch recognition. The gate can
also be adjusted manually. Settings currently reset on page reload.

Each microphone start begins a new unsaved session, so the worker's new audio
clock and the raw-audio buffer have the same origin. Save wanted riffs before
restarting. Changing tuning does not reset the audio clock or buffer.

## Real guitar validation still required

No real guitar recordings were provided for this change. Synthetic tests do not
establish reliability on an iPhone microphone, acoustic guitar, nylon guitar,
or an amplifier. Do not label generated tones as real recordings.

For a future consented fixture set, record mono WAV audio and annotate expected
notes and approximate onset times. Include:

- Every open string, then frets 3, 5 and 7, on steel and nylon strings.
- Repeated notes, soft picking, ringing bass with upper-string notes, and rests.
- Hammer-ons, pull-offs, slides, fret buzz and ordinary room noise.
- Standard and DADGAD, with and without a capo.
- The E2 E2 G2 E2 A2 A2 A2 riff at several speeds.

Keep both raw audio and the human-reviewed annotations. Report missed notes,
extra detections, octave errors, and timing error per recording. Chord strums
are an expected limitation: detection remains monophonic.

## Browser checks

Check microphone permission denial, start/stop/restart, quiet-room calibration,
device selection, and capture expiry during silence and after stopping.
Use a saved riff with three different versions to verify target selection
updates the notes, audio, scoring and heading together. Check that leaving
practice stops its note subscription. Test physical iPhone Safari before
claiming mobile microphone reliability.
