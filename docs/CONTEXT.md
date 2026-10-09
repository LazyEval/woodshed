# Woodshed

Personal practice tool for jazz standards: import a tune's chord changes from a scanned chart, derive simplified versions of those changes, and keep a rotation of tunes due for refreshing.

## Language

### Tunes and charts

**Tune**:
A jazz standard in the user's repertoire (title, composer, key, form). Owns exactly one Source Chart and any number of Simplified Charts.
_Avoid_: Song, standard, piece

**Chart**:
A bar-by-bar grid of chord symbols for a Tune, organized by the tune's form.
_Avoid_: Lead sheet, changes, progression

**Scan**:
The original image/PDF of a published chart that a Source Chart was extracted from. Kept attached for reference.
_Avoid_: Upload, photo, picture

**Source Chart**:
The Tune's reference Chart, extracted from a Scan and kept as printed (sections, repeats, endings). Is either _Draft_ (being corrected) or _Verified_ (trusted as reference); a Verified Source Chart can be reopened.
_Avoid_: Original, master chart

**Correction**:
Changing chords on a reopened Source Chart while keeping its bar grid; affected bars of Simplified Charts are flagged for review.
_Avoid_: Fix, edit

**Replacement**:
Swapping a Tune's Source Chart for one extracted from a new Scan; existing Simplified Charts become Archived.
_Avoid_: Re-import, re-upload

**Simplified Chart**:
A named, editable Chart derived from a Verified Source Chart, sharing its exact bar grid; only chords differ. Multiple Simplified Charts are alternative approaches, not difficulty levels. _Archived_ ones are read-only leftovers of a Replacement.
_Avoid_: Simplification, version, level, reharmonization

**Key Center**:
A span of bars in a Source Chart that functions in a single local key; the reference against which chord function is read.
_Avoid_: Key area, tonality, local key

### Simplification

**Rule**:
A plain-language simplification trick written by the user (e.g. "VI and III chords become I", "a II V sharing one bar followed by I becomes V | I"). Rules are instructions for the AI, not code.
_Avoid_: Simplification rule, transform, filter

**Generation**:
Producing a Simplified Chart by handing a Source Chart and a chosen set of Rules to the AI. The alternative is writing the Simplified Chart by hand.
_Avoid_: Auto-simplify, conversion

### Rotation

Rotation is about retaining tunes already learned, not learning new ones.

**Active**:
A Tune in rotation that can become Due. Default once its Source Chart is Verified.
_Avoid_: Enabled, current

**Shelved**:
A Tune kept in the library but out of rotation; never Due.
_Avoid_: Archived, inactive, retired

**Practice Session**:
A dated log entry that the user practiced a Tune, with a Rating.
_Avoid_: Review, workout, rep

**Rating**:
The user's self-assessment of a Practice Session: _shaky_, _ok_, or _solid_. Determines when the Tune is next Due.
_Avoid_: Score, grade

**Due**:
A Tune is Due when its scheduled refresh date (derived from its Practice Session history) has passed.
_Avoid_: Overdue, stale, expired
