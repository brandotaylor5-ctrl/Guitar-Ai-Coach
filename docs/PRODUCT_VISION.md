# Product Vision

> This is the governing document. Every design decision in this repository
> should be traceable back to something on this page. If a proposed feature
> conflicts with the principles here, the principles win.

## What this is

**An intelligent musical sketchbook, riff memory and guitar collaborator.**

It is *not* primarily a tuner, a note detector, or a guitar lesson app. Live
note recognition is only the technical foundation — the floor, not the building.

## The problem

Guitarists improvise, noodle, experiment, or accidentally play something they
love. Then they forget exactly what they played.

The app should listen continuously during an intentional session and be able to
recognise musical phrases, remember them, compare them, and help the player
develop them.

The eventual experience should feel like **another musician sitting across from
you who is paying attention.**

## The headline interaction

You play for 45 seconds. Somewhere in there you accidentally play something
interesting. A few moments later you ask:

> "What was that thing I just played?"

And the app answers:

```
I think you mean this phrase from about 18 seconds ago:

  E2 → G2 → A2 → B2 → G2 → E2

You played a variation of it three times.

The second version was:
  E2 → G2 → A2 → C3 → B2 → G2

The third version was the cleanest.

Do you want to save one of them as a riff?
```

That is the product.

## The governing principle

Most guitar apps work like this:

```
APP HAS MUSIC  →  USER LEARNS APP'S MUSIC
```

This product works like this:

```
USER MAKES MUSIC  →  APP UNDERSTANDS USER'S MUSIC  →  APP HELPS USER DEVELOP IT
```

That distinction guides every design decision. **The user's own playing is the
curriculum.** Do not turn this into another guitar course. Do not make
famous-song lessons the centre of the app.

---

## Features

### Riff capture

The app should automatically identify likely musical phrases rather than
treating a session as one enormous stream of notes. It should recognise:

- repeated note sequences
- recurring rhythmic patterns
- phrases separated by pauses
- motifs the player returns to
- variations of the same riff

So that it can say *"you played something very similar to this four times"* and
then offer **SAVE RIFF**.

A saved riff carries whatever is available: note sequence, timing, rhythm,
estimated string/fret positions, tablature, audio recording, date created,
tempo, key/scale estimate, and the different takes or variations.

### Riff Library

A library of **the player's own musical ideas** — not songs downloaded from
other musicians.

```
Riff 01 — unnamed
Riff 02 — Late Night Thing
Riff 03 — Nylon Idea
Riff 04 — Weird E Minor Thing
```

Opening a riff shows the original audio, detected notes, tablature, fretboard
positions, tempo, rhythm, key/scale estimate, every recorded variation,
notes and comments, and the date it was first played.

Most importantly, there is a button: **PLAY THIS WITH ME.**

### Riff Practice Mode

Select a saved riff; the app listens while you try to play it again. Instead of
teaching you a famous song, it teaches you **your own riff**:

> "You nailed the opening. On the second half you played G instead of A.
> Your rhythm was slightly faster than the original take. Try it again."

This turns accidental creativity into something reproducible. The player can
choose to practise the original version, the latest version, the best take, or
to practise slowly — playback slows without changing pitch.

### Riff evolution — version control for music

Riffs evolve. **Never overwrite an old riff when the player changes something.**
Use branches and versions instead.

```
Riff 12
├── Version A
├── Version B
└── Version C
```

The AI can observe: *"Version B changes only one note, but it makes the ending
feel unresolved."* Or: *"You keep changing the last three notes every time you
play this."*

The player chooses: **Keep A · Keep B · Keep both · Combine them.**

### Riff recognition across sessions

When the player plays something similar to an older saved idea, the app should
notice:

> "You just played something very similar to Riff 14 from three weeks ago."

A guitarist may unknowingly return to the same melodic shapes repeatedly. The
app can reveal that.

### Musical fingerprint

Over time the app learns the player's tendencies — not generic guitar
statistics, but *their* musical vocabulary:

- "You return to E more than any other tonal centre."
- "You use this 0 → 3 → 5 movement constantly."
- "You tend to use low bass notes followed by answers on the upper strings."
- "You've written seven riffs using essentially this rhythmic shape."
- "You tend to resolve downward rather than upward."

**The goal is not to criticise these tendencies.** It is to show the musician
what their natural musical vocabulary looks like. The AI may then occasionally
offer a door out of it:

> "You normally resolve this phrase downward. Want to hear what happens if you
> climb instead?"

### Creative assistant

Once a riff exists, the player can ask conversational questions about it:

*What did I just play? · Save that. · Play it back. · Show me the tab. · Show me
where my fingers were probably going. · Why does this sound sad? · What scale am
I accidentally using? · Give me three ways to finish this. · Make the ending
darker. · Make this slightly more bluesy. · What chord could sit underneath
this? · Can I turn this into a verse? · Give me another riff that answers this
one. · Keep everything except the last three notes. · Make a version that climbs
instead. · What note did I change between Take 2 and Take 3? · Which version
sounds more resolved?*

**The AI should not replace the musician.** It should help the musician explore
*their* idea. The player's original musical phrase always remains the centre of
the creative process.

### Ghost Capture / Instant Recall

The app keeps a rolling musical memory during a session. The player has not
pressed Record. They play something good and say *"WAIT. What did I just play?"*
— and the app retrieves the previous 10–30 seconds of structured pitch data and
identifies the phrase.

**Privacy must be respected. Raw audio need not be permanently stored unless the
user saves something.** This may be one of the signature features of the
product.

### A/B riff comparison

Record two versions, then ask *"what changed?"*

```
Take A:  E → G → A → B → G
Take B:  E → G → A → C → B

Difference: you added C before returning to B.
```

Rhythm differences too, eventually.

### Riff completion

The AI can suggest endings, but they must be generated **from the musical
context of the player's own riff**:

```
1. RESOLVED     returns to E
2. UNRESOLVED   ends on B
3. DARKER       leans into G and D
```

Let the musician audition them. **Do not present one as objectively best.**

### Riff conversation

Eventually the player should be able to have a conversation with one musical
idea:

> **User:** Make that darker.
> **AI:** Try changing the final A to G.
> *(user plays it)*
> **AI:** Yep. You made that change. Want to save this as Version B?

### Song seed

Multiple riffs can become a song workspace — Riff 4 as a verse idea, Riff 9 as a
chorus, Riff 13 as a transition. The app may notice that *"Riff 9 sounds related
to Riff 4 because they share several notes and the same tonal centre."*

The AI assists with organisation and understanding. It does **not** write the
song unless the user explicitly asks for suggestions.

---

## Beginner-first explanations

This product must be unusually good at explaining music to people who do not yet
understand theory.

Do **not** begin with:

> "You emphasised the minor third and flattened seventh."

Instead say:

> "You kept playing E as your home note. The G you keep using is one of the
> notes that makes this sound darker. On your low E string, that's the 3rd
> fret."

Then, optionally, afterwards:

> "That relationship is something musicians call a minor third."

**Theory should emerge FROM the player's own music.** This is a major product
philosophy, and it is enforced by tests in `test/assistant.test.ts`.
