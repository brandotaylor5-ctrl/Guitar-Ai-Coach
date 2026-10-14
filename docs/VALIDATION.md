# Songwriter workbench release — 2026-10-14

Implementation through local commit `fb05406`; matching uploaded tree `82167e229896d6c760a875e6ec5b4088cc977884`, GitHub review PR #44. At that checkpoint: 540/540 tests, TypeScript, production build, and whitespace checks pass. Later release fixes and live evidence are recorded below when verified.

Covered: exact float32 stereo WAV round trips, final worklet tail acknowledgements, ten-minute capture, five-second queue stalls and rescue, late permission cancellation, native-rate WAV and browser-decoded imports, playback cancellation, immutable source ranges and version history, pinned song sections, mixed-rate demo duration, MIDI event timing, transactional migration/revision conflicts, complete ZIP restoration and collision handling, archive path/size validation, and blocked database upgrades.

The browser and executor do not share localhost. Browser verification therefore uses the existing GitHub Pages deployment after CI. No real microphone device, audible monitoring channel, or iPhone Safari session is available here; those hardware behaviors must not be claimed verified. The private user-provided M4A fixture is outside the repository and is never published as a test asset.

All generated runtime modules and the local ZIP vendor module enter a build-specific offline cache. Updates require an explicit action and safe acknowledgements from current app tabs. Recording and recovery use an exclusive browser lock; recovery does not finalize another tab's live recording. Old caches are retained for old clients.

Design decisions: MIDI is an optional export of confirmed note sketches. Recordings remain unquantized and unnormalized. Restore publishes validated records together in one transaction after private staging; conflicting IDs become separate copies. Existing musical data, legacy source copies and course/placement storage keys remain intact.

Independent whole-branch review found two important issues, both fixed with failing-then-passing regressions: interrupted recovery now awaits the final capture flush before download/reset; legacy playback now observes the recording lock and cancels Workbench playback, with the persistent Stop control covering either player. No critical findings or deferred minor findings. After the fix pass: 544/544 tests, TypeScript, build and diff checks pass. Added archive regressions also reject duplicate paths and forged lengths and preserve existing music after cancellation during staging.

## Earlier live-coach validation notes

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
