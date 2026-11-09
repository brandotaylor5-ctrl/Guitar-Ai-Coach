# Guitar Academy curriculum architecture (pilot v1)

Updated November 9, 2026. This document now governs the **educational** product. The original creative-workbench vision is preserved in PRODUCT_VISION.md, but does not define the Academy curriculum.

## Purpose

Develop independent musicianship through connected, teachable, assessable experiences. Avoid two failures: turning practice into an unstructured playground, or treating a stalled physical technique as a gate to all other learning.

The current release is an **eight-lesson rhythm chapter**, not a complete scientifically validated guitar curriculum. It is accessible from Learn. A separate barre-chord clinic is accessible from the chapter and the Learn screen.

## Teaching commitments

1. Keep a carefully authored sequence of outcomes, explanations, examples, practice tasks, supports, concept checks and transfer assignments.
2. Separate *understanding*, *practice attempts* and *self-reported independent execution*. A quiz can verify its correct answer; a user click cannot verify motor skill or musical fluency.
3. Give the learner a way to keep studying parallel compatible skills when a technique is still developing. A skill remains unfinished; it is never automatically waived or declared mastered.
4. Make difficulty adjustable by isolating hands, slowing tempo, simplifying rhythm, or dividing a progression into pairs. Do not change the destination without explaining why.
5. Use realistic musical demonstrations and explicitly describe synthesized sound as synthesized. Do not claim acoustic fidelity or microphone-based individual-string grading.
6. Teach why a skill matters, then create opportunities to apply it in a different progression or context.
7. Avoid gamified metrics that imply musical mastery without meaningful evidence. Do not use time spent or number of buttons pressed as a substitute for playing ability.
8. Keep beginner language understandable and avoid unnecessary theory jargon. Explain rhythm subdivisions before terms like syncopation.

## Proposed full competency map (not yet implemented)

- Physical technique: posture, fretting, relaxation, barre shapes, transitions, picking coordination.
- Rhythm: pulse, subdivision, strum motion, patterns, accents, syncopation, groove, time.
- Harmony: open and movable chord families, voicings, relationships and harmonic function.
- Fretboard: strings, intervals, navigation, keys, scales and positions.
- Musical listening: relative pitch, pulse, phrase memory, chord qualities and aural comparison.
- Melodic technique: flatpicking, articulation, fingerstyle, phrases and improvisation.
- Repertoire and performance: learning, remembering, accompanying and performing whole pieces.
- Literacy: chord charts, tab, notation where relevant and terminology.
- Musical expression: tone, dynamics, timing and phrase shaping.
- Creative fluency: variations, arrangement, composition and deliberate musical choices.
- Practice independence: problem diagnosis, goal selection, self-evaluation and transfer.

Each competency eventually needs separate evidence for conceptual understanding, physical execution, retention and transfer. Dependencies should be reviewed by actual guitar educators rather than inferred from software logic alone. This roadmap is a proposal, not a validated sequence.

## Rhythm Foundations: the complete pilot slice

The eight authored lessons in src/curriculum/rhythmChapter.ts:

1. Find the pulse (steady downstrokes).
2. Discover the & between beats (eighth-note subdivision).
3. Make one rhythm out of six strokes (D D U U D U, with silent movements).
4. Change the groove without changing chords (accents).
5. Let the rhythm survive a chord change (G to D).
6. Make the space between beats count (offbeat accent).
7. Put four familiar chords under one rhythm (G, D, Em, Cmaj7).
8. Play it without the instructions (transfer to a different chord order).

Each lesson contains a count grid, a synthetic audio reference and slower/simpler versions, physical directions, concept question, practice goal, support, and a transfer challenge. Chord diagrams are available. The chapter is designed for learners with basic open-chord knowledge; it is not yet a zero-experience guitar course.

The lesson UI allows manual navigation at all times. The suggested next lesson is the first unattempted concept or exercise; a declared difficulty is marked as *needs work* but does not prevent continuing. No student is credited with mastery by advancing.

## Parallel barre clinic

For a student struggling with C#m → G# → A → E, the clinic presents four different diagnoses: unclear shape, difficult same-shape motion, rhythm collapse, and four-chord integration. It isolates a smaller task and preserves the full progression as an eventual goal. This clinic records self-reported practice sessions separately and never affects rhythm outcomes.

## Evidence and local storage

- A correct multiple-choice concept response records a date. This is evidence of that **one concept question**, not broad conceptual mastery.
- "I practiced this" records a practice attempt, not a score, successful performance or lesson pass.
- "I played it without the guide" requires a recorded attempt and stores only **self-reported** independence. It does not become algorithmic mastery in the existing skill graph.
- "I am stuck" removes an earlier independence claim, marks the lesson as needing more work, and offers an alternative. Other lessons remain accessible.
- Unknown or malformed records are ignored. Progress is kept in the browser's localStorage key guitar-academy.rhythm-chapter.v1 and does not sync across devices. A separate key tracks barre practice. It is not linked to the existing old course and will not alter saved music.
- No microphone is used or required in the new chapter. Real sound quality and real guitar technique still need hands-on device testing.

## Validation performed in code

The automated tests cover unique lesson IDs, each lesson's explicit teaching stages and check answer, the separation of understanding/practice/independence, nonblocking recovery, malformed storage, the audible example event structure, and the barre-clinic alternatives.

These tests check software invariants, not educational effectiveness. Browser audio, responsiveness on the actual learner's iPhone, and human motor-skill assessment require physical testing.

## What remains before claiming a cutting-edge curriculum

1. Expert review of goals, sequence, physical safety, accessibility and each example's musical accuracy.
2. Usability sessions with beginners and intermediate players across music genres, including people who get stuck.
3. Performance assessments scored by qualified teachers, using pre/post and delayed retention and transfer tasks.
4. Refine the selection model from those findings. Do not hard-code universal success criteria without evidence.
5. Gradually extend into other core skill areas, while preserving an educational backbone and meaningful learner choice.
6. Accessibility and auditory alternatives for hearing-impaired learners; broader instruments/tunings where validated.
7. Device-level tests for phone audio unlock and offline updating. Verify backups separately before relying on storage.

Until those steps happen, describe this as an **implemented and tested pilot chapter**, not a proven full guitar education.

## November 9 entry-point correction

The first pilot release failed to distinguish brand-new learners from experienced players and showed a one-bar chord demo before asking for four bars of playing. This is a sequencing failure, not a button problem. The chapter now asks for the learner's approximate rhythm starting point in a single non-graded choice: brand new, chords without automatic strumming, strumming with rough changes, or already playing songs. Choosing a later lesson never credits earlier lessons as passed. The entry choice is saved locally and can be changed.

The pulse lesson now begins with clapping and muted strings instead of requiring G major. References offer four audible high-pitched count-in plucks and four full bars of synthetic chords. These are *not* spoken lessons or validated real-guitar audio, and physical playing remains self-reported. The longer count-in and four-bar examples intentionally replace the original mismatched one-bar preview.
