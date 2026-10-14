# Songwriter Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a recording-first guitar workbench that preserves real performances, develops alternate takes and musical sketches, assembles songs, and restores complete audio-inclusive backups.

**Architecture:** Retain the TypeScript/static-site application. Separate immutable recording assets from editable ranges and note interpretations, use one transactional IndexedDB repository, and put a persistent recording controller and audio transport above the three workspace views. Keep existing musical algorithms behind explicit, reversible operations.

**Tech Stack:** Existing Node/TypeScript, AudioWorklet, Web Audio, IndexedDB, and GitHub Pages; add pinned `fflate@0.8.3` for ZIP streaming and dev-only `fake-indexeddb@6.2.5` for transaction tests. No framework, backend, account system, remote inference, or new paid service.

**Spec:** `docs/superpowers/specs/2026-10-08-songwriter-workbench-design.md` (approved 2026-10-08).

## Global Constraints

- "Make recorded audio authoritative. Notes, chords, tempo, and fingerings are optional interpretations that may be uncertain or unavailable."
- "Save the full original performance. A trim is an editable selection into it, never destruction of the source."
- "A ten-minute take limit keeps this initial implementation bounded; show the limit before recording and a countdown during its final minute, finalize at the limit, and offer another take."
- "Accept local audio files the browser can decode, with a visible 100 MB input limit and the same ten-minute duration limit."
- "Retain stereo imports as stereo; microphone input may remain mono."
- "Slow playback offers 100%, 75%, and 50% with pitch preserved."
- "Bound the pending write queue to five seconds."
- "Apply a 500 MB expanded-size limit for this initial release and show it in the import dialog."
- "Minimum 44 CSS-pixel touch targets, visible focus, readable contrast, reduced-motion support, and no hover-only actions."
- "Use browser tests for the complete workflow and viewport checks at 390px and 1440px."
- "No decorative controls, fabricated populated libraries, or unimplemented creative tools count as shipped functionality."
- Preserve existing ids and data; keep course and placement keys intact; use `node --test --experimental-strip-types` and existing typecheck/build commands. Current package engine floor is Node `>=22.6`; run the build using the established environment's version that supports its existing strip-types build script.

Values translated into code: `MAX_TAKE_SECONDS=600`, `MAX_IMPORT_BYTES=100_000_000`, `MAX_ARCHIVE_BYTES=500_000_000`, `MAX_PENDING_SECONDS=5`, `CHUNK_SECONDS=1`. These decimal byte limits match the UI's MB labels.

## Review Focus

1. Stop while the worklet holds fewer than 2,048 samples: retain the final pluck and close the microphone only after a flush acknowledgement (Task 4).
2. A 44.1 kHz stereo file on a 48 kHz device: preserve channels and source bytes, distinguish native WAV samples from browser-decoded working audio, and use the asset's actual rate (Tasks 1, 5, 9).
3. An older tab or concurrent edit: migration must not lose legacy data, and stale writes must be rejected rather than replace another edit (Tasks 2, 3, 10).
4. A ZIP with duplicate paths, false lengths, path traversal, or colliding ids: enforce actual expanded size and leave existing music untouched (Task 9).
5. Cancel a permission prompt, processing job, or playback, then start again: late callbacks must not resurrect old recording or playback state (Tasks 4, 5, 10).

## Execution boundaries

Recommend Native execution: one implementer, sequential tasks with targeted tests, then one independent whole-branch review. These tasks share storage and transport contracts; per-task agent handoffs would add cost and coordination. This recommendation awaits the user's execution choice and plan review.

The approved spec is one integrated project. The tasks below are dependent vertical slices, not separate products. Do not silently narrow it to a recorder or expand it to multitrack accompaniment. Capture a working checkpoint after each task; publish only after Task 11's release evidence is complete or explicitly report remaining device-verification limits.

## File and interface map

| Area | Files | Responsibility |
|---|---|---|
| Domain | `src/workbench/types.ts`, `regions.ts`, `edits.ts`, `variations.ts`, `arrangement.ts` | Audio ranges, immutable operations, provenance, and sequence planning. |
| Existing domain | `src/types.ts`, `src/library/store.ts`, `riffLibrary.ts`, `src/practice/practice.ts` | Compatible version/song extensions and guards for absent note analysis. |
| Storage | `web/workbench/database.ts`, `repository.ts`, `migration.ts` | One versioned database, committed writes, recovery, and migration. |
| Capture | `web/audio/capture.ts`, `web/capture-worklet.js`, `web/workbench/recorder.ts` | Acknowledged sample delivery and bounded recording lifecycle. |
| Audio | `web/workbench/audioImport.ts`, `transport.ts`, `processing.worker.ts`, `web/audio/pcmWav.ts` | Decode, range playback, time stretching, and portable audio. |
| UI | `web/workbench/model.ts`, `recordView.ts`, `developView.ts`, `songsView.ts`, `waveform.ts`, `transportBar.ts`, `noteEditor.ts` | Three focused workspaces sharing persistent controllers. |
| Archive | `src/workbench/archive.ts`, `web/workbench/archive.worker.ts`, `backup.ts` | Validated project manifest, ZIP stream, staged restore. |
| Integration | `web/app.ts`, `web/views/context.ts`, `web/index.html`, `web/workbench.css`, `web/manifest.json`, `web/service-worker.js`, `web/workbench/lifecycle.ts`, `scripts/build.mjs` | Routing, scoped styling, dependency emission, safe updates. |
| Tests | `test/workbench*.test.ts`, `test/pcmWav.test.ts`, `test/fixtures/workbench.ts` | Signal, state, persistence, mutation, and archive contracts. |

### Shared contracts (owned by Task 1)

`PcmAudio = { sampleRate: number; channels: Float32Array[] }` (1 or 2 equal-length channels, finite samples, positive integer rate).

`AudioRegion = { assetId: string; startSample: number; endSample: number }` uses half-open sample indexes. `0 <= start < end <= sampleCount`; a zero-length selection is a draft UI state only.

`AudioAsset` has `id`, `source: 'microphone'|'import'|'legacy'`, `state: 'recording'|'complete'|'interrupted'`, `sampleRate`, `channelCount`, `sampleCount`, `createdAt`, `markers: number[]`, optional `originalFilename`, `originalMime`, `originalBlob`, and `importDecode: 'native-pcm'|'browser-decoded'` for imports. `originalBlob` preserves the exact supplied file and is included in backups.

`AudioChunk = { assetId: string; index: number; startSample: number; channels: Float32Array[] }`.

Extend `RiffVersion` with optional `recording: AudioRegion`, `sourceKind: 'recorded'|'imported'|'synthesized'|'legacy'`, `instrument`, `tuningSnapshot: { name: string; strings: number[]; capo: number }`, `analysis: { state: 'unavailable'|'estimated'|'confirmed'; reason?: string }`, and `provenance: { sourceVersionId: string; operation: 'ending'|'rhythm'|'performance'; parameters: Record<string, string|number> }`. Keep `notes: NoteEvent[]` and legacy `audioRef` readable. Note times are relative to the version's selected region, in milliseconds.

Extend `Riff` and `SongSeed` with optional `revision: number` and `archivedAt: number`. Add optional `SongSeed.notes`. Extend each song section with optional `id`, `versionId`, `recording: AudioRegion`, `repeats`, and `note`; migration normalizes these. A synthesized section pins note content by version; an audio section pins both version and range.

`TakeTarget = { riffId: string; parentId: string } | undefined`; `KeptTake = { riffId: string; versionId: string }`. `MigrationReport = { migrated: number; missingAudio: string[]; rejected: string[]; recoveredLegacyChanges: number }`.

`PlaybackSource = { kind:'audio'; region:AudioRegion } | { kind:'synthesized'; notes:NoteEvent[] }`. Keep these discriminated throughout UI, exports, and transport.

## Task 1: Audio ranges, version vocabulary, and portable PCM

**Files:** Create `src/workbench/types.ts`, `src/workbench/regions.ts`, `web/audio/pcmWav.ts`, `test/fixtures/workbench.ts`, `test/workbench.regions.test.ts`, `test/pcmWav.test.ts`; modify `src/types.ts`. Keep existing `web/audio/wav.ts` as a backward-compatible mono wrapper.

**Interfaces:** Produce the shared contracts above; `validatePcm(audio:PcmAudio):void`, `validateRegion(region:AudioRegion,sampleCount:number):void`, `slicePcm(audio:PcmAudio,region:AudioRegion):PcmAudio`, `waveformPeaks(audio:PcmAudio,buckets:number):Array<{min:number;max:number}>`, `encodePcmWav(audio:PcmAudio,format:'pcm16'|'float32'):Uint8Array`, `decodePcmWav(bytes:Uint8Array):PcmAudio`. Native decoder accepts PCM16/24/32 and float32 WAV with 1–2 channels and validates chunk bounds; other codecs go through Task 5. Fixtures export `pcmFixture(options?:{rate?:number;channels?:1|2;seconds?:number}):PcmAudio`, `riffFixture():Riff`, and `songFixture(riff:Riff):SongSeed`; outputs are deterministic and freshly cloned.

- [ ] Write tests named `region boundaries preserve the source` and `stereo float WAV survives exactly`, including:
  ```ts
  assert.equal(slicePcm(pcm, {assetId:'a', startSample:7, endSample:14}).channels[0]!.length, 7);
  assert.deepEqual(decodePcmWav(encodePcmWav(stereo44100, 'float32')), stereo44100);
  assert.throws(() => validateRegion({assetId:'a', startSample:3, endSample:3}, 10));
  assert.throws(() => validatePcm({sampleRate:48000, channels:[new Float32Array([NaN])]}));
  ```
  Also assert out-of-bounds/unequal channels fail, truncated WAV fails, and slicing leaves the source's samples unchanged.
- [ ] Run `node --test --experimental-strip-types test/workbench.regions.test.ts test/pcmWav.test.ts`; expect missing-module/API failures.
- [ ] Implement the contracts and codec, including unknown RIFF chunks and odd-byte padding. Preserve float32 values in backup WAV; clamp only in PCM16 listening export. Keep peak generation proportional to sample count.
- [ ] Rerun those tests and `npm run typecheck`; expect all passing.
- [ ] Commit: `feat: define lossless recording assets and non-destructive ranges`.

## Task 2: Transactional recording and idea repository

**Files:** Create `web/workbench/database.ts`, `web/workbench/repository.ts`, `test/workbench.repository.test.ts`; modify `src/library/store.ts`, `src/library/riffLibrary.ts`, `package.json`, `package-lock.json`.

**Interfaces:** `openWorkbenchDatabase(factory:IDBFactory,name?:string):Promise<IDBDatabase>` opens version 2 of `guitar-ai-coach`, retaining `clips`, adding `assets`, `chunks`, `riffs`, `songs`, `meta`, and `staging`. `transactionDone(tx:IDBTransaction):Promise<void>` resolves only on complete. `WorkbenchRepository(db:IDBDatabase)` implements `RiffStore` and provides `beginAsset(asset:AudioAsset):Promise<void>`, `appendChunk(chunk:AudioChunk):Promise<void>`, `finalizeTake(assetId:string,target?:TakeTarget):Promise<KeptTake>`, `recoverInterrupted():Promise<KeptTake[]>`, `getAsset(id:string):Promise<AudioAsset|null>`, `readRegion(region:AudioRegion):Promise<PcmAudio>`, `listAssets():Promise<AudioAsset[]>`, `assertRecording(region:AudioRegion):Promise<void>`, and `archiveRiff(id:string,archived:boolean):Promise<void>`.

- [ ] Add pinned dev dependency `fake-indexeddb@6.2.5`; write tests using a fresh `IDBFactory` per test. Assert saving a no-note version with a committed recording succeeds; dangling/unfinished asset references fail; aborted transactions leave no visible take. Use `assert.equal((await repo.getRiff(kept.riffId))!.versions[0]!.notes.length, 0)` and `assert.rejects(repo.assertRecording(missingRegion))`.
- [ ] Run `node --test --experimental-strip-types test/workbench.repository.test.ts`; expect missing repository failures.
- [ ] Implement append transactions that check the next chunk index and startSample atomically; update durable sampleCount in the same transaction. Finalization atomically completes the asset and creates/branches its riff. Recover only contiguous committed chunks, idempotently, with the label Interrupted take. Empty assets create no playable riff.
- [ ] Add optional `RiffStore.assertRecording(region):Promise<void>`; allow `RiffLibrary.saveRiff`/`addVersion` to accept `recording`, source, tuning, analysis, and provenance options. Empty notes require verified recording; a store without that capability rejects the save. `putRiff` also validates references transactionally. Existing empty-without-audio tests remain valid. Repository writes compare `revision` and increment it; stale revisions throw `ConflictError` with no overwrite. Archive changes preserve all assets and references.
- [ ] Assert a simulated abort after request success never returns Saved; duplicate/out-of-order chunks fail; recovering twice creates one take; two stale writes do not lose the first edit. Run repository, library, and reliability tests plus typecheck.
- [ ] Commit: `feat: persist recordings and ideas with explicit commit and recovery semantics`.

## Task 3: Migration and compatibility with existing music

**Files:** Create `web/workbench/migration.ts`, `test/workbench.migration.test.ts`; modify `web/audio/clipStore.ts`, `src/library/riffLibrary.ts`, `src/practice/practice.ts`, `web/views/library.ts`, `web/views/songs.ts`, `web/views/lab.ts`, `web/views/practice.ts`, `web/views/coach.ts` only at affected analysis entry points.

**Interfaces:** `migrateLegacy(db:IDBDatabase,storage:StorageLike):Promise<MigrationReport>`; `hasUsableNotes(version:RiffVersion):boolean` in `src/workbench/types.ts`. Legacy `ClipStore` uses the shared database opener/transaction completion and continues to read old `clip:` refs; new legacy saves mirror completed clips into recording assets before acknowledging audio persistence.

- [ ] Add fixtures containing a complete legacy riff, a missing clip, custom song roles, an implicit song version, invalid JSON, and an interrupted migration. Assertions: original ids/bytes retained; implicit version pinned; localStorage unchanged; missing clips reported; rerun adds no duplicates; invalid entries cannot silently erase valid records.
- [ ] Run `node --test --experimental-strip-types test/workbench.migration.test.ts`; expect missing migration failures.
- [ ] Parse/validate before the write transaction; resolve legacy clip refs; commit assets/chunks, riffs, songs, and a source fingerprint marker together. Keep original localStorage and `clips`. Missing audio stays explicitly unavailable. Normalize section ids/ranges/repeats. Import legacy JSON as note-only when its audio is absent; never trust a foreign recording reference.
- [ ] On later boots compare the saved legacy fingerprint. If an old app wrote changed legacy records, preserve current workbench versions and recover differing legacy records as a remapped copy with internal references remapped and an explanatory report. Add a test that a stale legacy write cannot overwrite the workbench edit.
- [ ] Guard analysis, automatic quality selection, recognition, and practice for absent notes. For an all-audio idea, `bestTake` returns the chosen current version without assigning a quality score. Preserve existing semantics for note-backed riffs. Run migration, library, reliability, and practice tests; typecheck.
- [ ] Commit: `feat: migrate existing music without losing recordings or versions`.

## Task 4: Recording lifecycle, tail flush, and rescue

**Files:** Create `web/workbench/recorder.ts`, `test/workbench.recorder.test.ts`; modify `web/audio/capture.ts`, `web/capture-worklet.js`.

**Interfaces:** `CapturePort` exposes `start(onAudio:(chunk:Float32Array)=>void,onInterrupted:(reason:string)=>void):Promise<{sampleRate:number}>` and `stop():Promise<void>`. `RecordingController({capture,repository,stopPlayback,onChange})` exposes `start(target?:TakeTarget):Promise<void>`, `stop():Promise<KeptTake|null>`, `mark():void`, `interrupt(reason:string):Promise<void>`, `rescue():Promise<PcmAudio>`, and read-only `snapshot:{status:'idle'|'requesting'|'recording'|'finalizing'|'saved'|'recoverable'; capturedSamples:number; committedSamples:number; sampleRate:number; error?:string}`. `onChange(snapshot)` drives all views; microphone ownership remains in one controller, shared with legacy listening through the app shell.

- [ ] Write fake-port tests: final 127-sample tail is included; double Record opens one mic; Stop while permission is pending invalidates late success; detector failure leaves raw capture running; a five-second uncommitted queue halts capture; recording stops exactly at `600 * sampleRate` samples. Assert `snapshot.status !== 'saved'` until final transaction completes.
- [ ] Run `node --test --experimental-strip-types test/workbench.recorder.test.ts`; expect failures for absent controller/flush support.
- [ ] Add `flush`/`flushed` messages with request ids to the worklet; deliver its partial buffer exactly once before acknowledgement, and stop accepting input during the flush. Replace the existing blind 60 ms wait with the acknowledgement. If acknowledgement times out, label the take interrupted and preserve acknowledged samples. Test the processor with a small stub AudioWorklet host as well as the fake capture port.
- [ ] Implement one-second chunk aggregation, serialized writes, generation tokens for late callbacks, the bounded queue, recovery download, and sample-count-based markers/limit. Start shows requesting until samples arrive. Stop sends the tail before closing tracks. Capture shutdown on track end or audio suspension finalizes committed data; page hiding stops recording deliberately. Zero-sample attempts never claim a saved take.
- [ ] Verify rescue combines committed and queued samples once, in order, and pending errors never discard the in-memory tail. Run recorder/repository/audio tests and typecheck.
- [ ] Commit: `feat: record complete takes with bounded persistence and recovery`.

## Task 5: Original audio import, transport, and processing

**Files:** Create `web/workbench/audioImport.ts`, `web/workbench/transport.ts`, `web/workbench/processing.worker.ts`, `test/workbench.transport.test.ts`, `test/workbench.import.test.ts`; modify `web/audio/playback.ts` only for shared synthesis rendering and reliable cancellation settlement.

**Interfaces:** `importAudio(file:File,repo:WorkbenchRepository,signal:AbortSignal,target?:TakeTarget):Promise<KeptTake>`; `AudioTransport({repository,context,renderNotes,onChange})` exposes `play(source:PlaybackSource,{loop?:boolean,speed?:1|0.75|0.5}):Promise<void>`, `stop():void`, `setGain(value:number):void`, and read-only `snapshot:{playing:boolean;positionSeconds:number;durationSeconds:number}`. `renderNotePcm(notes:NoteEvent[],sampleRate:number):Promise<PcmAudio>` shares the existing plucked synthesis implementation with preview and export. Worker protocol: `{id,op:'stretch',audio,factor}` -> `{id,audio}` or `{id,error}`; termination is cancellation.

- [ ] Tests assert 44.1 kHz stereo WAV keeps its sample rate and channels; unsupported/oversize/>600-second imports fail before publishing an idea; starting B cancels A; stop resolves an awaited playback exactly once; late stretch output cannot restart playback. Use a fake audio scheduler to inspect source scheduling and cancellation, not real wall-clock sleeps.
- [ ] Run `node --test --experimental-strip-types test/workbench.transport.test.ts test/workbench.import.test.ts`; expect new-API failures.
- [ ] Native PCM WAV imports use Task 1's decoder. For other browser-decodable files, retain the exact original Blob, decode into working PCM, and record `importDecode:'browser-decoded'` and the actual decoded rate. **Plan clarification for review:** browser decoding can resample; the UI must call that rate the working sample rate, not claim it is the compressed file's native rate. Offer Download original for the untouched imported file; range WAV exports use the declared working asset rate. This preserves source fidelity without inventing codec-specific demuxers.
- [ ] Reject >100 MB files before reading; check duration/channel metadata where available, then validate decoded data. Persist imports using the same staged chunks and finalization boundary as recording. Cancelled imports leave no visible idea and their staging is recoverable/cleanable.
- [ ] Implement Web Audio scheduling with one active source, a tiny playback-only boundary fade, exact loop points, and shared output control. A/B begins at each selection start. Stretch in a worker only for a selected region; use the existing WSOLA alignment decisions across channels consistently to preserve stereo relationships, cache results by asset/range/speed, and keep source samples unchanged. Play originals at speed 1 in exports.
- [ ] Run transport/import/PCM tests, cancellation tests for existing `RiffPlayer`, and typecheck. Verify audible looping and no pitch drop on an available browser using test recordings; record limits of any unavailable device/audio inspection.
- [ ] Commit: `feat: audition and import real performances with reliable transport`.

## Task 6: Record workspace and persistent app shell

**Files:** Create `web/workbench/model.ts`, `web/workbench/recordView.ts`, `web/workbench/waveform.ts`, `web/workbench/transportBar.ts`, `web/workbench.css`, `test/workbench.model.test.ts`; modify `web/app.ts`, `web/views/context.ts`, `web/index.html`, `web/manifest.json`, `scripts/build.mjs`.

**Interfaces:** `WorkbenchModel({repository,recorder,transport})` provides `snapshot`, `subscribe(listener):()=>void`, `openIdea(riffId:string,versionId?:string):Promise<void>`, `setSelection(startSample:number,endSample:number):void`, `keepSelection():Promise<KeptTake>`, `exportSelection():Promise<Blob>`. Snapshot includes selected idea/version, draft range, `saveStatus`, and recorder/transport snapshots. `recordView(model):View`, `waveform({audio,selection,onSelection}):HTMLElement`, `transportBar(model):HTMLElement`.

- [ ] Add model tests proving no-note recording appears in Inbox, invalid selection disables keeping/export, selection survives view changes, and keepSelection references the full source rather than copying or truncating it.
- [ ] Run `node --test --experimental-strip-types test/workbench.model.test.ts`; expect failures for absent model.
- [ ] Wire the repository/migration before mounting views, exposing loading/blocked/failed states. Root and unknown hashes go to Record. Add `record`, `develop`, `projects` to ViewName; retain explicit old `session`, `songs`, `seeds`, and lesson URLs. Persistent transport/controller are mounted once; views subscribe/unsubscribe without destroying audio state. Prevent legacy listening and new recording from owning the mic simultaneously.
- [ ] Build the styled Record screen: input meter, growing waveform, start/stop, mark moment, import, recent ideas, instrument label, save/recovery status, and microphone choice. Implement handles, numeric times, keyboard nudges, marker selection, and PCM16 range WAV download. Include the 600-second limit/countdown, import constraints, and foreground recording explanation. Escape never discards a take.
- [ ] Browser-check recording/import -> loop -> keep -> reopen -> range export at 390px and 1440px. Only Record is promoted while the other workspaces are incomplete; do not ship placeholder navigation. Run model tests, typecheck, build.
- [ ] Commit: `feat: open a recording-first workspace with persistent transport`.

## Task 7: Alternate takes, reversible edits, and musical sketches

**Files:** Create `src/workbench/edits.ts`, `src/workbench/variations.ts`, `web/workbench/developView.ts`, `web/workbench/noteEditor.ts`, `test/workbench.edits.test.ts`, `test/workbench.variations.test.ts`; extend `web/workbench/model.ts` and `web/workbench/processing.worker.ts`.

**Interfaces:** `EditHistory<T>(initial:T)` has `apply(next:T):T`, `undo():T`, `redo():T` for per-editor-session history; successful resulting states persist, original assets never mutate. `makeVariations(version:RiffVersion,operation:'ending'|'rhythm',boundaryMs?:number):RiffVersion[]` requires confirmed analysis and returns uncommitted sketches with provenance. Model gains `recordAlternate():Promise<void>`, `chooseComparison(a:string,b:string):void`, `saveVersionEdit(version:RiffVersion):Promise<void>`, `keepSketch(version:RiffVersion):Promise<void>` and `undo()/redo():Promise<void>`. `analyzeRecordedRegion(audio:PcmAudio):Promise<NoteEvent[]>` reuses the existing monophonic detector in a worker for recording and import alike.

- [ ] Tests assert parent links and independent A/B ranges survive reopening; history does not mutate its earlier states; undoing a favorite does not change a pinned song. For variations:
  ```ts
  assert.deepEqual(changed.notes.filter(n => n.startMs < boundary), original.notes.filter(n => n.startMs < boundary));
  assert.deepEqual(rhythm.notes.map(n => n.midi), original.notes.map(n => n.midi));
  assert.equal(changed.sourceKind, 'synthesized');
  assert.equal(changed.recording, undefined);
  assert.throws(() => makeVariations(unconfirmed, 'rhythm'));
  ```
- [ ] Run `node --test --experimental-strip-types test/workbench.edits.test.ts test/workbench.variations.test.ts`; expect failures for absent operations.
- [ ] Implement note estimation detached from saving; show per-note uncertainty. An editable table supports pitch, start, duration, add/remove, and a Preview interpretation action. Confirmation is an explicit user action and resets after further edits. Validate finite positive durations, chronological order, instrument range, and no impossible fret suggestions. Keep audio-only use fully functional when estimation is unavailable.
- [ ] Adapt existing `suggestEndings` to replace only notes starting at/after the chosen note-onset boundary (not append to the original ending). Do not trim an earlier sustained note. Offer resolved/unresolved candidates that fit captured tuning/capo and range; show no candidate if a valid result cannot be built. Reuse the rhythm branch without changing pitch order. At most three options are visible. Synthesized comparison uses the confirmed interpretation as the baseline and labels both sound sources.
- [ ] Build Develop: chosen waveform, take list, A/B switch, slow speed, comments, favorite, Undo/Redo, focused tool panel, optional notes/tab, and Record this version. New recorded performances branch from the selected sketch; recording audio never inherits synthesized status. Persist metadata after editing settles; a revision conflict reloads and preserves the user's pending edit for explicit retry.
- [ ] Run edits/variations/library tests, typecheck, and browser-check original -> alternate -> compare -> undo -> reopen; audio source and provenance labels remain truthful.
- [ ] Commit: `feat: develop ideas through alternate takes and reversible phrase sketches`.

## Task 8: Own-song arrangement and demo playback

**Files:** Create `src/workbench/arrangement.ts`, `web/workbench/songsView.ts`, `test/workbench.arrangement.test.ts`; extend repository and model; modify `src/library/riffLibrary.ts` song mutations to pin versions and respect normalized section records.

**Interfaces:** `ArrangementItem = {sectionId:string;source:PlaybackSource;repeats:number}`. `resolveArrangement(song:SongSeed,riffs:Riff[]):ArrangementItem[]` rejects missing pinned content instead of skipping it. `renderArrangement(items:ArrangementItem[],loadAudio:(region:AudioRegion)=>Promise<PcmAudio>,renderNotes:(notes:NoteEvent[],sampleRate:number)=>Promise<PcmAudio>,sampleRate:number,signal:AbortSignal):Promise<PcmAudio>` produces a stereo mix at a declared output rate (48 kHz for song demos), preserving natural section duration. Model methods: `createProject(name:string):Promise<string>`, `addSection(projectId:string,kept:KeptTake,role:string):Promise<void>`, `editProject(project:SongSeed):Promise<void>`; repository uses existing song read/write methods plus revisions.

- [ ] Tests pin section A to version A, change the favorite to B, and assert A remains; assert repeat counts produce expected sample length; reorder/undo preserves source ids; missing pinned audio causes a visible error. Render a 44.1 kHz source and a 48 kHz source into a 48 kHz demo and assert duration within one output sample of rounded boundaries, without pitch shifting.
- [ ] Run `node --test --experimental-strip-types test/workbench.arrangement.test.ts`; expect missing-interface failures.
- [ ] Implement section add/duplicate/move/rename/repeat/remove and one lyrics/performance-notes field. Pin ranges when sections are added; editing the idea range later does not change the song. Validate repeats as positive integers (1–32 for initial UI); estimate demo memory before rendering and reject outputs exceeding the 500 MB audio budget. Use one playback schedule for audition, looping a section via the existing transport.
- [ ] Build Songs with drag and button reordering, explicit version selection, Undo/Redo, sequential playback, and Download song demo (PCM16 WAV). Do not stretch sections to tempo automatically. Promote all three completed primary routes; put existing lessons and traditional tunes under Learn.
- [ ] Browser-check two real takes -> intro/verse -> duplicate/reorder -> notes -> demo export. Run arrangement and existing song/library tests, typecheck, build.
- [ ] Commit: `feat: arrange pinned performances into playable song projects`.

## Task 9: Complete project backup and safe restore

**Files:** Create `src/workbench/archive.ts`, `web/workbench/archive.worker.ts`, `web/workbench/backup.ts`, `test/workbench.archive.test.ts`; extend repository staging; modify `scripts/build.mjs`, `package.json`, `package-lock.json`, relevant workspace export/import controls.

**Interfaces:** `ProjectManifest` version 1 contains project, included riffs/all their versions, audio entries `{id,path,sha256,sampleRate,channelCount,sampleCount,originalFilePath?}`, and `missingAudio:string[]`. `exportProject(projectId:string,repo:WorkbenchRepository,signal:AbortSignal):Promise<Blob>`; `restoreProject(zip:Blob,repo:WorkbenchRepository,signal:AbortSignal):Promise<{projectId:string;skipped:number;remapped:number}>`; pure `validateManifest(value:unknown):ProjectManifest`. Repository adds `beginRestore(id:string):Promise<void>`, `stageRestoreEntry(id:string,path:string,bytes:Uint8Array):Promise<void>`, `commitRestore(id:string,manifest:ProjectManifest):Promise<void>`, and `discardRestore(id:string):Promise<void>`.

- [ ] Add pinned runtime dependency `fflate@0.8.3`. Configure the existing build to copy `node_modules/fflate/esm/browser.js` to `dist/vendor/fflate.js` and rewrite only the `fflate` bare import to the correct relative vendor path in emitted modules. Node tests keep the normal package import; browser output never loads it from a CDN.
- [ ] Write a round-trip fixture with stereo source, raw imported Blob, alternate takes, a sketch, changed ranges, pinned/repeated sections, and lyrics. Assert exact decoded float32 samples and original file bytes, all parent/reference ids, and project text match after restore into a fresh repository. Assert existing equal ids skip, differing ids remap consistently, and a failed restore leaves existing repository snapshots unchanged.
- [ ] Run `node --test --experimental-strip-types test/workbench.archive.test.ts`; expect failures for absent backup/restore functions.
- [ ] Stream ZIP work in a cancellable worker. Export all full assets referenced by every version of the project's ideas, plus original import bytes, manifest, and readable notes. Use Web Crypto SHA-256 outside live IDB transactions. Preflight `500_000_000` expanded bytes including originals and manifest. Missing legacy recordings require explicit acknowledgement and manifest entries; never fabricate audio.
- [ ] Before publishing any restored record, validate schema/version, references, hashes, exact channel/sample counts, duplicate ids/paths, valid relative paths (reject absolute paths, `..`, backslashes, NUL), entry count <=10,000, manifest <=5 MB, archive input <=500 MB, declared size and streamed expanded output <=500 MB. Use streaming output accounting and terminate on overflow; do not use unrestricted `unzipSync` on unknown archives. Reject unsupported encrypted archives. Stage assets privately, then publish records and mark the restore committed together. Do not delete another active restore's staging on boot; clean only sessions marked abandoned through an ownership/heartbeat check.
- [ ] Add tests for corrupt hashes, false declared length, actual expansion overflow, duplicate paths, cancellation after staging, and collision remapping inside provenance/song/asset refs. Run archive/repository tests, typecheck, and production build; verify emitted vendor import resolves locally.
- [ ] Commit: `feat: back up and restore complete projects including original audio`.

## Task 10: Device lifecycle, updates, and finishing the interface

**Files:** Create `web/workbench/lifecycle.ts`, `test/workbench.lifecycle.test.ts`; modify `web/service-worker.js`, `web/index.html`, `web/app.ts`, `web/workbench.css`, `web/audio/clipStore.ts` as needed for shared connections.

**Interfaces:** `canApplyUpdate({recording:boolean,finalizing:boolean,recoveryPending:boolean,saving:boolean}):boolean`; `installWorkbenchLifecycle({recorder,transport,repository,onUpdateAvailable}):()=>void`. Repository exposes `close():void`; open connections close on versionchange and prevent further writes until reload. UI reports blocked upgrades and reload-required states explicitly.

- [ ] Tests assert updates are deferred for any unsafe state; explicit update activation occurs only when every current app tab reports safe; vanished tabs cannot leave a permanent deadlock. Cancelled permissions or old worker replies never reactivate recording. Simulate a v1 tab holding DB open and assert the upgrade remains blocked without clearing data.
- [ ] Run `node --test --experimental-strip-types test/workbench.lifecycle.test.ts`; expect failures for new lifecycle API.
- [ ] Remove unconditional `skipWaiting`; activate a waiting worker only after an explicit user update action and all open app tabs acknowledge no capture/save/recovery. Wait if a client does not acknowledge; prompt to close that app tab. Use a per-build cache and its own cache lookup, retaining the prior build's cache while old clients exist. Cache required workbench modules/vendor assets for reload. Never replace a module request with HTML. If controllerchange occurs unexpectedly during recovery, defer reload and show a persistent update message.
- [ ] Implement keyboard shortcuts outside text fields, safe-area transport spacing, accessible handles/labels, focus return from sheets, reduced-motion styles, no horizontal overflow, and visible processing/cancel states. Offer persistent storage only after explaining it; retain Saved on this device and backup actions. Check all legacy routes with audio-only ideas and ensure lesson state remains intact. Explicit legacy Delete becomes archive for migrated ideas.
- [ ] Verify layout at 390px and 1440px, double-click Record, pause/resume/device interruption, offline reopen of already cached work, and two-tab update behavior. Run lifecycle tests plus full suite, typecheck, build.
- [ ] Commit: `fix: preserve musical work across interruptions updates and device layouts`.

## Task 11: Release evidence, independent review, and deployment

**Files:** Update `docs/VALIDATION.md`, `docs/ROADMAP.md`, `README.md`; fix only demonstrated failures in the responsible files and add targeted regressions where appropriate.

**Interfaces:** No new product API. Record the actual tested commit, browsers/devices, fixtures, commands, workflow results, live URL, and any unverified hardware behavior. This is the handoff contract.

- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check` on the complete branch. Expected: zero failures and no missing emitted dependency. Resolve failures before release.
- [ ] Exercise the full scenario in the browser: record/import real audio -> mark/select -> loop -> keep -> alternate take -> A/B -> note interpretation/variation -> song -> demo -> project ZIP -> restore into a separate empty test profile -> compare source bytes and play. Use a user-supplied original fixture if available; no downloaded copyrighted music. A synthetic signal verifies machinery but cannot substitute for a musical listening check.
- [ ] Validate real desktop microphone capture, audible output, and iPhone Safari when accessible. If a microphone, audio listening channel, or iPhone is unavailable, explicitly record that limitation; do not call that portion verified or use desktop emulation as iPhone evidence. Complete all accessible verification before requesting a focused hardware check from Brandon.
- [ ] Obtain one independent whole-branch review using `superpowers:requesting-code-review`; address important findings and rerun affected checks. If Native is approved, keep this as the single review gate rather than spawning a fresh reviewer for every task.
- [ ] Follow the established GitHub PR workflow against main, with expected-head merge protection and CI success. Existing authorization to ship through GitHub persists; ask only for genuinely new authority or a protected-workflow blocker. Upload the tested tree through the configured connector if local Git lacks credentials; verify the tree hash matches. Do not change the public hosting destination.
- [ ] Confirm Pages deployment and the live capture/import-to-export flow. Report what shipped, where to open it, and any remaining hardware verification limits. Preserve previous musical data and the recovery export path.
- [ ] Commit: `docs: record songwriting workbench release validation`.

## Source checks and planning clarification

Technical behavior checked against primary documentation on 2026-10-08:
- IndexedDB commits: https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event
- Browser decoding and resampling: https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData
- ZIP streaming/cancellation APIs: https://github.com/101arrowz/fflate
- IndexedDB test implementation: https://github.com/dumbmatter/fakeIndexedDB

Package pins were checked with npm registry metadata; nothing was installed during planning. The compressed-import clarification in Task 5 is intentional: retaining the original file and honestly naming the decoded working rate satisfies source preservation without promising native-rate decoding that the browser API does not guarantee. This clarification is included in the plan review.

## Self-review and coverage

Spec sections 1–3: global constraints and full-path release gate. Record (4): Tasks 1, 2, 4–6. Develop (5): Tasks 5 and 7. Songs (6): Task 8. Visual behavior (7): Tasks 6–8 and 10. Existing-code reuse (8): file map and Tasks 2–5. Persistence (9): Tasks 1, 2, 4. Migration (10): Tasks 3, 10. Export (11): Tasks 5, 6, 8, 9. Source policy (12): discriminated provenance and no remote services in Tasks 5, 7, 9. Verification (13): task tests and Task 11. Delivery order (14): dependencies and per-task commits.

Self-review: no unspecified API names between tasks; all five Review Focus conditions have assigned tests; all numeric limits have explicit code values; no production code is included in this plan. Execution begins only after review of this plan and selection of execution method.
