# Guitar Workbench: from a performance to a song

Date: 2026-10-08
Status: Written design for Brandon's review; implementation has not started.
Repository baseline: `763118feb6411d4746b3412bf4f9cb67a32db338`.
Working product name: Guitar Workbench. This is a direction, not a final branding decision.

## 1. The agreed intent

Brandon wants a professional-feeling tool for creating his own music. His playing supplies the material. The app captures it, makes it easy to hear alternatives, and helps him develop sections into songs. Learning support belongs beside the music he is working on.

Approved direction: Record, Develop, and Songs; a musical partner beside the recording. The interface must remain understandable on a phone and efficient on a desktop. Original performances, musical judgment, and creative ownership stay with the player.

Success means Brandon can pick up Burl or Llewelyn, record an idea, keep a passage, record another interpretation, hear the difference, and take the audio away. A suggested variation is useful only when he can audition it and understand what changed.

Assumptions adopted for this design: continue the existing browser application and GitHub Pages hosting; local storage by default; microphone recording and imported personal recordings; no paid API or account required for the first release. These are revisable choices, not requirements Brandon explicitly specified in this turn.

## 2. Product decisions

- Open on the recording workspace. Put the course and placement flow behind a secondary Learn entry.
- Make recorded audio authoritative. Notes, chords, tempo, and fingerings are optional interpretations that may be uncertain or unavailable.
- Save the full original performance. A trim is an editable selection into it, never destruction of the source.
- Make alternative takes and suggestions separate versions. Keeping a new favorite cannot overwrite an earlier take.
- Offer focused musical operations on a selected phrase. Keep the original and alternatives easy to compare.
- Keep playback, microphone status, and save status visible across navigation.
- Clearly label original recordings, synthesized previews, and estimates. A synthesized preview is never labeled as the player's guitar.
- Make dependable storage and audio export release requirements.

The recommended approach is a songwriting workbench. A live improvising partner has greater latency and detection risk; a full studio introduces multitrack and mixing complexity. Both can build on this foundation later.

## 3. The first complete release

The release includes one coherent path through all three places. It is complete only when the path works with actual audio, survives reopening the browser, and restores successfully from a backup.

1. Record or import a performance, even when no notes are recognized.
2. Select a region on its waveform, loop it, and save it as an idea.
3. Record an alternate take into that same idea and compare any two takes.
4. When usable notes are available, audition a focused ending or rhythm variation and keep it separately as a synthesized sketch.
5. Add chosen versions to a simple song sequence, play the sequence, and attach personal notes or lyrics.
6. Export selected audio and a complete restorable project containing its recordings.

The first release's musical value is preserving and comparing performances, exploring a specific phrase, and assembling a rough song. It does not depend on a chat box or a model generating polished recordings.

## 4. Record

### Empty and returning states

The initial screen has Record, Import audio, and recent ideas. It does not require a title, key, lesson, or setup questionnaire. A returning player can resume their most recent idea with one action.

### During recording

Show elapsed time, a responsive input meter, a growing waveform, Stop, and Mark moment. Mark moment places a bookmark without stopping the take. Capture begins only after an explicit recording action and successful microphone permission. Never show Recording until audio samples actually arrive.

Stop closes the take and immediately shows its waveform and playback controls. The take is automatically saved to an Inbox; naming and trimming are optional. Show Saving until the storage transaction completes, then Saved on this device. A ten-minute take limit keeps this initial implementation bounded; show the limit before recording and a countdown during its final minute, finalize at the limit, and offer another take.

No automatic microphone monitoring or accompaniment during recording in this release. Starting a take stops all app playback, including synthesized previews and voice output. This prevents the app from recording itself and keeps synchronization out of the initial scope.

### Selection and looping

Drag two waveform handles or enter start/end times. Offer accessible keyboard adjustments and thumb-sized handles on mobile. The selected region is visible, playable, and loopable. A zero-length region cannot be saved or played. Do not silently snap freely played music to a beat grid.

Keep as idea creates a version referencing the selected range of the original take. Adjusting a saved range is reversible through Undo; the full take stays available. A short playback-only edge fade prevents clicks without changing stored samples or trimming a note attack from the source.

### Import

Accept local audio files the browser can decode, with a visible 100 MB input limit and the same ten-minute duration limit. Validate type, decoded duration, and channel count before committing. Retain stereo imports as stereo; microphone input may remain mono. If decoding fails, explain the format problem and preserve the current work. Never imply universal codec support.

## 5. Develop

This is an editor for one idea, not a dashboard of unrelated features.

- Center: waveform, selection, transport, and Original / selected take controls.
- Nearby: compact take list, names, and optional comments.
- Context panel: the active musical tool, with no more than three alternatives at once.
- Optional detail: detected notes, estimated key, suggested tab, and technique help.

### Comparing performances

The player chooses any two versions. A/B switching restarts at each version's own selected start; it does not pretend recordings have been time-aligned. No automatic quality ranking. The player can set a favorite, keep both, or record another take. Range selection and editing history remain independent for each version.

Slow playback offers 100%, 75%, and 50% with pitch preserved. It is an audition feature; exported originals retain their original timing. Reuse the existing time-stretch code only after checking it against picked notes, ringing chords, and real recordings. Show processing state and allow cancellation for longer selections.

### First musical tools

| Tool | Input and behavior | What is saved |
|---|---|---|
| Try an ending | Player chooses the tail to replace. Offer a settled and an open-ended option from the existing phrase-suggestion engine. Preserve events before that boundary. | A note-based sketch with the source version and changed range recorded. |
| Change the rhythm | Preserve pitch order; alter one rhythmic pattern using the existing transformation code. | A separate note-based sketch and a plain-language description. |

Preview the original note interpretation before a transformed note sketch so the player can distinguish a compositional change from detector errors or synthesized tone. Original recording playback remains immediately accessible. A kept sketch is labeled Synthesized sketch. Record this version creates a real performance linked to that sketch without replacing it.

Analysis must not delay recording, storage, trimming, or audio playback. For this release, enable note transformations only after the player sees and confirms an editable single-note interpretation. Show uncertain notes, permit correcting/removing/adding notes, and keep unconfirmed guesses out of the creative operation. Strummed chords and fingerstyle with overlapping notes may remain audio-only. Audio-only ideas retain recording, looping, takes, songs, and export.

### Later tools, with explicit boundaries

Find chords underneath, Answer this phrase, Make room for a vocal, and a user-recorded instrument sample bank are subsequent releases. Existing harmony and response functions are candidates for reuse, not evidence that finished accompaniment is already available. These tools do not appear as dead controls in release one.

## 6. Songs

Songs contains the player's projects. Traditional lesson tunes remain under Learn.

A project contains an ordered list of sections. Each section has a name, a pinned idea version and range, repeat count, and optional performance note. Choose common labels or type a custom one. Duplicate, move, replace, or remove sections; removal leaves the underlying idea intact. Provide buttons alongside drag reordering for keyboard and phone use.

Playback follows the sequence in order. Repeats use the exact stored range. Tempo metadata is optional and does not automatically stretch recorded audio. Audio and synthesized sketches can coexist but their source is always visible. Moving a section can be undone. Editing an idea's favorite does not silently change a song's pinned version.

The project also has one plain text area for lyrics and performance notes. The app does not write lyrics automatically. A song may start with a single section and grow without a prescribed verse/chorus structure.

Example use: record two versions of a riff, keep the fuller take for an intro, use a sparser take for a verse, repeat a response once, and note where the guitar should stop. The whole sequence should be audible before export.

## 7. Visual and interaction direction

Use a restrained studio palette: charcoal canvas, warm light text, subtle separators, amber for selection, red only for active recording or errors. Waveforms and timelines carry information; decorative cards and large motivational headings do not consume editing space. Use tabular numerals for time and meters.

Desktop layout: compact project/idea rail; central recording or editing surface; collapsible contextual tool panel. A persistent transport displays play/stop, position, loop, output level, input status, and save status. One prominent action per empty state.

Phone layout: Record / Develop / Songs navigation with a fixed transport above the safe area; one working surface at a time; take and tool panels open as dismissible sheets. Preserve selection and playback state when opening sheets. Minimum 44 CSS-pixel touch targets, visible focus, readable contrast, reduced-motion support, and no hover-only actions.

Space toggles playback and R starts recording when focus is outside an editable field. Escape closes a panel or cancels a pending action; it never silently discards a recording. Shortcut hints are secondary.

Professional means predictable transport, recoverable editing, explicit save outcomes, useful audio, and consistent controls. It is an acceptance standard, not just a visual theme.

## 8. Existing code: reuse and necessary changes

| Existing area | Evidence in current code | Design response |
|---|---|---|
| `web/audio/capture.ts` | AudioWorklet emits raw samples separately from the pitch worker. | Reuse raw capture; decouple detector failure from recording lifetime. |
| `src/library/riffLibrary.ts` | Saving requires nonempty notes; versions already preserve parent links. | Keep version lineage; allow audio-backed versions with no detected notes. Validate an actual committed audio asset. |
| `web/audio/clipStore.ts` | Audio is optional and errors return empty values; write completion currently follows request success. | Add authoritative recording transactions and explicit failure states; mark durable only on transaction completion. |
| `src/library/localStorageStore.ts` | Structured ideas and songs are separate from IndexedDB audio. | Migrate musical records to the same IndexedDB repository as audio metadata. Keep old storage as a recovery copy. |
| `web/views/library.ts` | Existing export excludes recordings. | Keep legacy import support and add complete project backup/restore with audio. |
| `src/create/suggest.ts`, `songwriting.ts` | Existing ending, answer, chord, and rhythm transformations. | Reuse pure musical operations behind a focused editor; validate each against its stated promise. |
| `web/views/songs.ts` | Own-song sections and creative workshop already exist. | Reuse section concepts and operation logic with pinned takes and audio playback. |
| `web/app.ts` | A long app shell owns capture, routing, and course-first navigation. | Extract the recording controller and transport; add the three workspaces without a framework rewrite. |

Keep the current TypeScript build, Web Audio stack, and static hosting. Add small dependencies only where justified by a concrete need such as ZIP packaging. Dependency selection and current browser API verification belong in implementation planning.

## 9. State and persistence contracts

Use the existing `guitar-ai-coach` IndexedDB database with a versioned upgrade that retains the `clips` store. Add recording assets, recording chunks, ideas, projects, and migration metadata. The new repository implements the existing RiffStore interface where compatible so the domain operations remain reusable.

Core records:

- AudioAsset: stable id, source (microphone/import/legacy), original filename if applicable, sample rate, channel count, sample count, capture timestamps, format version, and state (recording/complete/interrupted).
- AudioChunk: asset id, sequence index, start sample, and channel sample arrays. Sample indexes define timing; wall-clock time is descriptive.
- RiffVersion extension: optional asset/range reference, notes and analysis status, source kind (recorded/imported/synthesized/legacy), optional instrument label, tuning and capo snapshot, and existing parent link. Ranges use sample offsets into immutable source audio.
- Song project extension: stable section ids, pinned version and range, repeats, notes, and project text. Existing SongSeed content migrates without losing its order or labels.
- Suggestion provenance: source version id, operation, parameters, and generated note events. It records what the operation did without making claims about model training.

Keep the detector clock mapped to captured sample offsets. Note analysis cannot redefine the recording duration or range. Edits to notes never alter source audio.

Recording state machine: idle -> requesting microphone -> recording -> finalizing -> saved. Permission denial returns to idle with a useful error. Audio interruption or storage failure enters a recoverable state, never Saved. Single ownership of microphone and playback resources prevents duplicate recording, overlapping playback, and lost controls after navigation.

Write approximately one second of audio per transaction rather than holding an entire take until Stop. Bound the pending write queue to five seconds. If storage stalls or fails, stop capture, retain pending audio in memory for an immediate rescue download, and identify the durable portion. Finalize the asset and create the initial idea/version in a single metadata transaction after all chunks are committed. A recovered interrupted take contains only contiguous committed chunks and is labeled Interrupted take.

Autosave metadata edits; disable closing or replacing a recovery surface until the player chooses Download or Discard. Browser or device termination may still lose uncommitted audio; never promise background recording or zero-loss recovery. Explain the foreground requirement at recording setup and mark observed interruptions accurately.

Do not purge source audio as a side effect of deleting a section. Use a reversible archive for ideas in the initial release. A later explicit permanent-deletion action must check all version/project references first.

## 10. Migration and compatibility

Read the existing localStorage library and `clips` store without modifying either. Validate records, migrate them in an IndexedDB transaction, and write the migration marker only when that transaction commits. Retry after interruption without duplicates. Preserve original ids, dates, labels, parent relationships, and source audio where available.

Pin legacy song sections without an explicit version to the version that was current at migration. Missing audio appears as Recording unavailable; existing note previews still work and are labeled accordingly. Invalid entries are reported and left in the original backup; never silently replace the entire library with an empty collection.

After migration, all app views write through the new repository. Legacy lesson views must tolerate audio-only ideas and skip note-specific operations when notes are absent. Keep existing course progress and placement keys intact. Legacy URLs resolve to their corresponding secondary tools; the root opens Record. New views do not force another placement questionnaire.

Handle IndexedDB upgrades blocked by another tab with a specific Close the other app tab message. Bump the service-worker version, provide a deliberate update prompt when safe, and never activate a new build in the middle of recording. A storage upgrade must not strand an older tab writing to the former library.

## 11. Export and restore

Export audio downloads the selected recording range as WAV at its original sample rate and channel count. It does not silently substitute detected-note playback. Synthesized sketches offer a separately labeled preview export.

Export project creates one ZIP containing a versioned JSON manifest, all referenced source assets encoded as float32 WAV to preserve captured sample values, notes/lyrics as readable text, and the pinned sequence. Include all versions of ideas referenced by that project so alternate takes remain recoverable. Offer a separate Download song demo action for the sequential rendered arrangement.

The manifest includes asset integrity hashes, channel/sample counts, range definitions, version relationships, provenance, and project structure. A backup is complete only if every referenced available asset is included. List legacy missing-audio entries explicitly before export; never describe such a backup as containing missing recordings.

Restore validates archive size, declared and actual expanded size, paths, schema, hashes, asset headers, and reference integrity before making records visible. Apply a 500 MB expanded-size limit for this initial release and show it in the import dialog. Export checks that same limit before starting. Import uses staging and a completion transaction; clean up interrupted staging on restart. Existing ids with identical content are skipped; conflicts receive new ids with every internal reference remapped. Never overwrite an existing project on import.

Browser storage is device/browser-specific. The UI states Saved on this device and offers backup without suggesting cloud sync. If persistent-storage support is available, explain and offer it; export remains necessary because browser data can still be cleared.

## 12. Musical-source policy

The first release uses the player's supplied recordings, explicit edits, music-theory transformations, and labeled procedural sound synthesis. It does not train a model on those recordings or upload them for inference. No claim that a general-purpose model has learned only from Brandon is made.

A future sample bank would use recordings the player deliberately supplies for that purpose. A future remote AI feature would disclose the input sent, provider, cost, and save behavior before use. It must remain separable from recording and project access. No artist imitation or third-party catalog is necessary to fulfill the approved concept.

## 13. Verification and release gates

Test outcomes, not copies of implementation details:

1. A recording with zero detected notes saves, reopens, plays, and exports correctly.
2. A selected region is sample-accurate; changing it and undoing preserves the full source.
3. Two recorded takes keep independent ranges, names, and parent links; switching favorites changes no pinned song section.
4. Permission denial, recorder interruption, worker failure, quota failure, and a failed transaction leave truthful status and recoverable data where possible.
5. A recorded performance and a synthesized sketch are never mislabeled or played interchangeably.
6. Ending changes preserve notes before the selected boundary; rhythm changes preserve pitch order; all generated events have valid timing and playable range.
7. Project export and restore reproduce assets, versions, ranges, repeats, notes, and section order. Corrupt or incomplete archives cannot produce a partially published project.
8. Migration works with existing riffs, missing clips, older songs, and interrupted upgrades without deleting the source data.
9. Navigation, playback cancellation, app update, and double-clicking Record do not create duplicate capture or overlapping transport.
10. Verify actual microphone capture and audible playback on desktop Chrome and iPhone Safari, plus touch selection, reopen, export, and restore. Report any device not available for verification as unverified rather than inferring success from desktop.

Run the existing regression suite, typecheck, and production build; add targeted coverage for the new persistence and audio contracts. Use browser tests for the complete workflow and viewport checks at 390px and 1440px. Test an original fixture recording in addition to synthetic audio. Release evidence must distinguish automated signal checks from a human listening check.

Completion requires a deployed build and a verified record/import-to-export path. No decorative controls, fabricated populated libraries, or unimplemented creative tools count as shipped functionality.

## 14. Delivery order and review boundary

Build as vertical slices in this order: reliable recording/storage and migration; waveform/ranges/playback and export; alternate takes and the focused musical editor; song sections and full backup/restore; visual refinement and device validation. Each slice keeps a usable path and is committed independently.

The broader live-partner and personal-sample-bank directions remain future projects. This written spec covers the first coherent workbench release only.

Brandon approved the conversational direction on October 8. Under the Superpowers brainstorming workflow, his review of this written spec precedes the implementation plan. No production code or live app changes are part of this design commit.
