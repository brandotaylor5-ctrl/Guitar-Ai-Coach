# Persistent Musical Intelligence Rework

## Status and intent

This specification defines the next architectural pass for Guitar AI Coach. It
builds on the merged one-room Coach, guided journey, rolling riff memory,
versioned library, conversation tools, and adaptive player model. It does not
replace those systems.

The goal is to make them feel like one persistent musical intelligence sitting
beside the guitarist. A player should be able to start with a lesson, drift into
an accidental idea, ask what they just played, develop that idea, practise the
hard part, and have tomorrow's coaching remember what happened without leaving
the Coach room or understanding the app's internal feature map.

The target loop is:

> listen -> notice -> recall -> understand -> develop -> practise -> remember

Success is not a dashboard with more analysis. Success is a session in which
the player keeps holding the guitar and always knows the single useful thing to
do next.

## Product principles

### One coach, two sources of curriculum

Coach has two legitimate sources of direction:

1. The structured guitar journey, used when the player asks to be guided or no
   stronger musical context exists.
2. The player's own current phrase, used as soon as there is a real idea worth
   understanding, developing, or practising.

These are not separate modes or destinations. The active source can change
within one session. A lesson may produce a riff; that riff then becomes the
lesson. When work on the riff settles, Coach can return to the journey without
losing context.

Coach must state the transition plainly: "That turned into an idea. Want to
stay with it, or finish today's lesson?" It must not silently abandon either
path.

### One action at a time

The one-room design remains. At any moment Coach presents:

- one sentence about what it heard or why the next task matters;
- one primary action;
- at most one quiet secondary escape;
- a small live-hearing strip that confirms the microphone is working.

Analysis, history, and alternatives stay behind deliberate disclosure. The
player should not have to scan cards while holding an instrument.

### Evidence before confidence

The system must distinguish:

- what the microphone actually detected;
- what the system inferred, such as a probable fingering or tonal centre;
- what the player self-reported;
- what a measured attempt verified.

Every result carries confidence internally. Low-confidence transcription must
be described as approximate and remain easy to correct. Coach must never claim
to know a physical string or fret solely from pitch.

### The original performance remains authoritative

Detected notes are an interpretation of the recording, not a replacement for
it. Saving an idea preserves the retained audio when available, the detected
events, the confidence, the probable route, and the relationship to earlier
takes. Corrections create a new transcription revision; they do not rewrite the
recording or erase the first interpretation.

### Local-first and forgetful by default

Continuous listening remains session-scoped. Unsaved note and audio memory
expires. No raw audio leaves the device. Model-backed conversation is opt-in
and may send structured notes only after the player asks a question. The UI
must explain this without forcing a privacy tutorial into the first session.

## The complete session experience

### 1. Entering Coach

The first screen offers one clear decision:

- **Guide me** starts or resumes the structured session selected from placement,
  mastery, and recent evidence.
- **Listen while I play** opens an unscored creative session with rolling
  memory active.

This is a starting stance, not a permanent mode. Both paths use the same
listener, timeline, active-idea context, player model, and library.

Returning players see one short continuity sentence when evidence supports it,
for example: "Last time the ending of Nylon Idea kept changing," or "Your G to
D change was the part still slowing down." The app says nothing when it lacks
enough evidence.

### 2. Listening and noticing

While the player plays, Coach quietly builds settled phrase candidates from the
rolling window. It may surface an unobtrusive notice only when one of these is
true:

- a phrase repeats or returns with a variation;
- a phrase closely matches a saved riff;
- a guided lesson produces a musically complete idea;
- the player stops and explicitly asks for recall.

Coach does not interrupt continuous playing, the final free-play phase, or an
active measured attempt. It never celebrates every detected phrase. Silence is
part of the product.

The room keeps a compact visual session trail of candidate ideas. It is not a
waveform editor. Each candidate is represented by time, a small contour, repeat
count, and confidence. The newest useful candidate is active; the player can
tap an older one to make it active.

### 3. "What did I just play?"

The recall action must be permanently reachable while listening. It retrieves
the last complete phrase by default and can expand to nearby candidates when
the choice is ambiguous.

The answer leads with sound and recognition, not theory:

- play back the retained recording when available;
- show the detected note contour and probable tab;
- say whether the phrase repeated or varied;
- say whether it resembles an existing saved riff;
- label transcription confidence in ordinary language.

When two candidates are similarly plausible, Coach shows the smallest useful
choice: "The short low idea, or the longer one after it?" It does not choose
with false confidence.

### 4. Making an active idea

Recalling or selecting a phrase creates one `ActiveIdeaContext` shared by
Coach, conversation, practice, and saving. It contains:

- the source session and time range;
- the original retained audio reference when available;
- the detected phrase and analysis;
- transcription confidence and any player corrections;
- motif siblings from the current session;
- likely matches from the saved library;
- the current working variation;
- edit history and parent version, if any.

There must never be separate copies of "the riff" in different screens. An
edit made through conversation, a version chosen from the session, and a
practice target must all refer to this shared context.

### 5. Understand, develop, or practise

Once an idea is active, Coach offers one recommendation chosen from evidence:

- **Understand it** when the player has not yet heard a useful explanation or
  the transcription is uncertain.
- **Develop it** when the phrase is stable enough to vary and no clear
  performance problem dominates.
- **Practise it** when repeated attempts reveal a specific breakdown.
- **Save it** when it has repeated, relates to an existing riff, or the player
  explicitly asks.

The player can always choose another direction through a compact disclosure,
but Coach does not present all tools as equal cards.

Development changes one musical dimension at a time: ending, rhythm, space,
register, contour, or supporting chord. Every generated option must derive from
the player's phrase, remain playable on the configured instrument, and be
auditionable. Choosing an option creates a working variation, not an automatic
save.

Practice isolates the smallest useful target. The default is the note before a
miss, the miss, and the note after it, or one chord transition when harmonic
work is measured. Playback at 100, 75, and 50 percent and microphone comparison
remain inline. Coach reports one correction at a time.

### 6. Version lineage instead of duplicate riffs

Saving first asks a musical identity question only when needed:

- new idea;
- another take of a likely existing riff;
- intentional branch from the active parent.

When similarity is strong, Coach recommends the relationship in plain
language: "This sounds like Nylon Idea with a different ending." The player can
attach it as a version or keep it separate. The system never silently merges.

Lineage records three different relationships:

- **take**: another performance of substantially the same musical content;
- **variation**: one or more deliberate musical changes;
- **transcription revision**: a correction to what the app thought it heard.

The library visualises these relationships without exposing Git terminology.
The original recording and every musical branch remain recoverable.

### 7. Remembering into the next session

The player model records compact evidence, not an opaque judgement:

- phrases and recurring interval/rhythm tendencies;
- measured timing and note errors;
- chord-string clarity checks;
- which development choices the player keeps or rejects;
- which saved riff and version a practice attempt targeted;
- what was self-reported, inferred, or verified.

At the next session Coach may use one strongest relevant memory. It must be able
to show why that memory exists and let the player dismiss it. Dismissal prevents
the same recommendation from immediately returning without new evidence.

## Architecture

### Session orchestration

Add a UI-free `CoachSession` orchestrator above the existing session, journey,
player-model, and library modules. It owns the current stance, active task,
active idea, deferred lesson, and transition rules. The browser view renders
its state and dispatches player actions; it does not independently decide which
product subsystem is active.

The orchestrator uses explicit states rather than nested view callbacks:

- `entry`
- `guided`
- `listening`
- `recall-choice`
- `idea`
- `practice`
- `session-summary`

Transitions are pure and tested. Audio and persistence remain effects at the
browser boundary.

### Candidate and lineage services

Extend the phrase layer with a `SessionIdeaIndex` that incrementally groups
settled phrases, tracks recurrence, and ranks recall candidates. It consumes
`Phrase` objects and never touches raw audio.

Add a `LineageResolver` around the existing similarity and library APIs. It
returns possible relationships with component scores and a recommended label,
but never mutates the library. Saving remains an explicit command after player
confirmation.

### Shared active-idea workspace

Replace the short-lived conversation-only workspace with a serialisable
`ActiveIdeaContext`. Conversation tools operate on it, Coach renders it,
practice reads its selected target, and save commits it. The context is
session-scoped until the player saves; a refresh may discard unsaved edits, and
the UI must say so before a destructive reload or restart when feasible.

### Persistence changes

Version records gain optional provenance fields for relationship, parent
version, source phrase, transcription confidence, and audio availability.
Existing stored libraries remain valid through a versioned migration. The
migration cannot drop riffs, recordings, comments, or song references.

The player model gains evidence for kept/rejected development choices and
targeted idea practice. It does not store raw audio.

### Conversation

The local command router remains the offline baseline. Model-backed
conversation uses the same `ActiveIdeaContext` and deterministic musical tools.
The model may choose and sequence tools; it may not fabricate notes, edits,
practice scores, or library matches in text.

The current Anthropic model name must be configuration, not a hard-coded
product dependency. Availability failure quietly falls back to local commands
without breaking the active idea.

## Error handling and honesty

- Microphone denial keeps non-listening lessons, the saved library, and
  playback usable.
- Low or noisy input prompts one calibration or input check, then stays quiet;
  it does not repeatedly blame the player.
- No settled phrase produces a direct "I didn't catch a complete idea yet"
  response with one suggestion to repeat it.
- Missing retained audio never blocks note-based recall and is labelled
  accurately.
- Storage failure leaves the active session usable and makes the unsaved state
  visible.
- A stale library match, deleted parent, or failed migration cannot destroy the
  new performance; it falls back to saving a separate riff.
- Model or network failure does not roll back deterministic edits already made
  in the local workspace.
- Full polyphonic transcription remains out of scope. Chords use the existing
  chord detector and string-clarity checks; single-note transcription remains
  monophonic.

## Testing and validation

### Automated contracts

Tests must cover:

1. Switching from a guided lesson to an idea and back without losing lesson
   position.
2. No interruption during continuous playing, final free play, or a measured
   attempt.
3. Recall ranking for the last phrase, an earlier repeated motif, and ambiguous
   candidates.
4. One `ActiveIdeaContext` remaining consistent across edits, practice, and
   save.
5. Take, variation, and transcription-revision lineage remaining distinct.
6. Strong similarity prompting rather than silently merging.
7. Player-model evidence influencing one later recommendation and respecting a
   dismissal.
8. Migration of existing riff libraries with no loss of versions, songs, or
   comments.
9. Offline conversation fallback and model failure preserving local work.
10. Accessibility of the primary action, keyboard flow, reduced motion, and
    readable confidence/error states.

### Real-instrument validation

Synthetic fixtures remain necessary but are not sufficient. A consented test
set must include the Washburn steel-string, the nylon-string guitar, direct or
amplified electric input when available, and ordinary room microphones. It
must cover open strings, fretted notes, repeated notes, ringing bass under high
notes, slides, hammer-ons, pull-offs, muted notes, fret buzz, chord strums,
alternate tunings, capo use, and the player's recurring low-E riff shapes.

For each fixture, retain human-reviewed onset and pitch annotations and report
missed notes, extra notes, octave errors, timing error, candidate boundaries,
and whether the correct idea ranked first for recall. UI testing must include a
physical iPhone or iPad browser before claiming mobile reliability.

## Acceptance criteria

1. From a cold start, the player can choose guidance or free playing in one
   decision and start within two actions.
2. During either path, a repeated or requested phrase can become the active
   idea without navigating away from Coach.
3. "What did I just play?" retrieves the correct complete idea from the rolling
   window in the automated fixture set and offers a choice instead of guessing
   when the result is ambiguous.
4. The active idea's recording, detected notes, probable tab, confidence,
   siblings, and saved-riff matches remain consistent through explanation,
   editing, practice, and saving.
5. A new performance can be saved as a new riff, take, variation, or
   transcription revision without overwriting existing music.
6. Coach turns a phrase into one concrete next action and does not show a wall
   of equivalent tools.
7. A measured mistake produces a focused loop and the resulting evidence can
   affect a later session.
8. Existing users retain all riffs, versions, songs, recordings, placement,
   and progress after migration.
9. The app remains fully useful without an API key; model-backed conversation
   enhances language flexibility but owns no musical truth.
10. The full automated suite, typecheck, production build, browser flow, and
    real-instrument validation report pass before the release is labelled
    complete.

## Deliberate non-goals for this pass

- Cloud accounts or cross-device sync.
- A Neko-style hardware unit or always-on background listening outside an
  intentional session.
- Full polyphonic note-by-note chord transcription.
- Famous-song licensing or a large commercial song catalogue.
- Social sharing, public profiles, payments, or subscriptions.
- Generating a finished song in place of the player.
- Replacing the existing local-first storage model with a server database.

## Required documentation cleanup

The product vision and roadmap currently contradict the merged teacher-led
journey and under-report the built conversation layer. Implementation includes
updating those documents so the governing principle becomes:

> The player's own music is the preferred curriculum; the structured journey
> gives the player a useful next step whenever their own music does not.

Status tables must describe shipped behavior rather than the historical order
in which features were built.

## Review boundary

This document approves the architecture and behavior of the rework. It does not
claim that the implementation or real-guitar validation is complete. After
review, the implementation plan must split the work into independently
verifiable vertical slices while keeping the current application usable after
each merge.
