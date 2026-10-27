# M18 Scale Sequencer — plan

Status: **in progress**, 2026-10-27
Branch: `scale-sequencer` (local, uncommitted)
Base: this repo, `yakovkhalinsky/m18-webseq`

## Goal

A browser step sequencer for the DROID Master18 whose pitch is **scale-first**:
pick a root and a scale, and every note that is entered, transposed, randomised,
or re-spelled by a scale change is snapped into that scale. Notes leave the
browser as ordinary MIDI notes; the Master18's `droid.ini` turns them into
1 V/oct pitch CV and gates.

The app stays a **single `index.html`** with no build step: open it over
`http://localhost` (Web MIDI requires a secure origin) and send to the M18.

## What is already done

- 15 scales: major/Ionian, Dorian, Phrygian, Lydian, Mixolydian, minor/Aeolian,
  Locrian, harmonic minor, melodic minor, pentatonic major, pentatonic minor,
  blues, whole tone, diminished, chromatic.
- Root selector and an "In scale" readout in the header.
- `quantise(note, scale, root, dir)` — `nearest` (exact ties go down), `up`, `down`.
- `scaleStep()` movement by scale degree, `octaveStep()` by octave.
- Scale snapping on:
  - note entry (`mouse wheel`, note dropdown),
  - `−deg` / `+deg` / `−oct` / `+oct` track transposes,
  - `Randomise`,
  - changing scale or root (whole sequence re-spelled),
  - loading saved/imported/legacy state (`saneState`).
- The step note dropdown only contains notes in the current scale. Trigger
  tracks keep the full 128-note list for their fixed drum note.
- `saneState()` moved into the engine script and exported, so it is unit-testable.
- State gained `version: 2` for scale-first, then `version: 3` for the 5-track
  layout, then `version: 4` for the 4-track (1 melodic + 3 drum) layout. The
  layout upgrades remap the musically meaningful tracks rather than discarding
  them (see below).
- README updated with the new behaviour.
- Tests added for scale helpers, direction, degree/octave stepping, migration,
  and harmonic-minor output.
- **Live MIDI input** (nanoKEY 2 / any Web MIDI keyboard):
  - Input port enumeration and selection beside the output, remembered in
    `localStorage`; a lone input (or the only nanoKEY) is auto-selected.
  - `parseMidi()` handles note-on / note-off (including note-on velocity 0)
    and ignores clock/CC; `recordNote()` writes one step. Both live in the
    engine and are unit-tested.
  - Scale-quantised **monitoring** through the M18 on the armed track's
    channel, with ref-counted note-offs when different keys snap to the same
    note.
  - **Record arm + explicit target track.** Stopped: step entry at the selected
    step, then the selection advances. Playing: writes to the step currently
    sounding on the armed track. One step per key press.
  - Velocity is not stored per step; playback still uses the track velocity.
  - The last played note is shown (`In: C#4 → C4`), and arming is not persisted.
  - `test/ui.test.js` (DOM-stub smoke test) covers input selection, monitoring,
    stopped step entry and persistence; it is wired into `test/run.sh`.
- **4-track layout: 1 melodic + 3 drum tracks.**
  - Defaults are track 1 melodic (ch 1) and tracks 2/3/4 drum triggers (ch 2/3/4)
    for kick 36, snare 38 and closed hat 42, with a simple demo groove. Tracks
    absent from an older state start silent.
  - State version is now 4. Migrations: a v3 5-track state keeps the first
    melody and remaps the three drum tracks, dropping the second melody; a v2
    4-track state keeps the first melody and the old drum, and adds two silent
    drum tracks. Custom layouts fall back to merging by index.
  - `droidIni()` emits a pitch output only for the melodic track and allocates
    gates as `G1.1`–`G1.4` for the four tracks, so all four hardware gates are
    used and no CV output is needed as a gate. The generic extra-gate path
    (`_GATEn` + a 0.5 `[copy]`) remains for any future tracks beyond four.
    Clock/start remain on `O7`/`O8`; `O2`–`O6` are spare.
  - `droid.ini`, the README output table and the tests were updated to match.
  - `defaultState()`, `saneState()`, presets, the UI track/selection/playhead
    arrays and the record-target list all use `TRACK_COUNT`/`S.tracks.length`
    rather than a hard-coded count.
- **Track-type-aware editor UI.**
  - Melodic tracks expose a Melodic badge, gate %, transposes, note names in
    the grid, and a selected-step editor with On, Note, per-step
    −oct/−deg/+deg/+oct, and Tie.
  - Drum tracks expose a Drum badge, trigger note and gate ms, a hit dot
    instead of note names, and a Hit-only step editor. Gate %, transpose, note
    and tie controls are hidden, and wheel/Alt editing no longer touches
    pitch/tie.
  - `stepNote(s,ti,si,dir)` is a tested engine helper for single-step note
    movement; the −/+ buttons and tests use it.

Unchanged on purpose: MIDI clock/start/stop, swing, polymeter, tie/legato,
trigger mode, per-track MIDI channel, velocity/gate, pattern storage.
`droid.ini` generation was extended for the new layout.

## Files

| File | Purpose |
|---|---|
| `index.html` | everything: engine (`<script id="engine">`), UI (`<script id="ui">`), styles |
| `test/engine.test.js` | Node tests against the extracted engine |
| `test/ui.test.js` | DOM-stub smoke test for the extracted UI (input/monitor/record) |
| `test/run.sh` | extracts the two scripts from `index.html`, syntax-checks both, runs tests |
| `README.md` | user-facing docs |
| `PLAN.md` | this file |

Key locations in `index.html`:

- `SCALES` / `SCALE_LABELS` — scale table, object order is UI order.
- `TRACK_COUNT` — 4 tracks (1 melodic, 3 drum); `defaultState()` builds the
  layout and demo patterns.
- `quantise()`, `scaleStep()`, `octaveStep()`, `randomScaleNote()` — pitch helpers.
- `parseMidi()`, `recordNote()`, `stepNote()` — live input parsing, step
  recording, and single-step note movement.
- `saneState()` — merge defaults, validate, snap every pitched step; new tracks
  from an older state start silent.
- `snapAllNotes()` — re-spell the sequence on scale/root change.
- `scaleNoteOpts()` — build the in-scale note dropdown.
- `renderTrack()` — rebuilds the dropdown and displays snapped note names.
- `droidIni()` — pitch outputs for melodic tracks, hardware gates plus a CV
  output as the 5th gate.

## How to run and test

```sh
cd /home/yakov/git/m18-webseq
python3 -m http.server 8000     # then open http://localhost:8000 in Chrome/Edge
./test/run.sh                   # engine + UI syntax + Node tests
git diff                        # review the uncommitted branch
```

The engine script must stay DOM-free: the test extracts it and runs it in Node.
The UI script is only syntax-checked by `test/run.sh`.

A throwaway jsdom smoke test was used during development (outside this repo):
load `index.html`, stub `navigator.requestMIDIAccess`, change scale/root, and
check the header, dropdown sizes, and cell names. Consider adding a small
in-repo UI test later.

## Design decisions

- **Store MIDI notes, not scale degrees.** Scale sizes differ (5, 6, 7, 8, 12
  notes), so a degree index does not transfer cleanly between scales. Storing a
  note and snapping by nearest keeps imports and scale changes predictable.
- **Global scale and root.** All four tracks share them. Trigger tracks ignore
  pitch.
- **Nearest-note snapping, ties down.** This is the same tie rule the original
  app used. Example: C minor-flavoured `C Eb G Bb` in C major becomes
  `C D G A`. If that feels wrong, add a direction selector (see below) or change
  the tie rule.
- **Scale changes are destructive to stored notes.** Selecting a scale re-snaps
  all steps immediately; this is intentional so the grid matches what plays.
- **Single file, no framework.** Keep it deployable by copying one file. If the
  app grows much larger, revisit moving it into the `sequencers` monorepo.
- **`droid.ini` stays static.** Scale quantisation is done in the browser; no
  Master18 patch changes are needed. The four hardware gates cover the four
  tracks; the extra-gate path is only for any future expansion.
- **Four tracks in one layout.** One melodic track covers the pitched voice,
  three trigger tracks cover drums. Drums have no pitch output, so O2–O6 remain
  free (clock/start use O7/O8). A fixed track count keeps the single-file UI and
  the hardware-gate mapping simple; more tracks would need an output-allocation
  UI.

## Next steps (rough priority)

1. ~~**Live MIDI input and recording**~~ — done. Follow-ups if wanted: sustain
   (tie) recording for held keys, per-step velocity from keyboard velocity, and
   channel-to-track routing.
2. **Quantise direction control** — a header select for `nearest` / `up` / `down`,
   persisted in state and used by `saneState`, `snapAllNotes`, and output.
3. **Per-track scale/root** — useful for polytonal patches; needs a UI decision
   (per-track override or global only).
4. **Custom scale editor** — 12-note mask; store the mask in state and export it
   with patterns.
5. **Scale-aware musical helpers** — diatonic chords, arpeggios, "next/previous
   chord tone", scale-degree display in cells.
6. **UI/editor polish** — piano-roll or degree view, copy/paste bars, undo,
   clearer indication of the active scale, keyboard entry.
7. **Persistence** — include a schema version in exported JSON, migrate older
   exports explicitly (currently `saneState` is forgiving), and decide whether
   presets should keep their own scale or adopt the current one.
8. **Repository home** — decide whether this stays `m18-webseq` or becomes an
   app in `yakovkhalinsky/sequencers` (`apps/m18-scale-seq`). Moving would need a
   Vite/React or single-page static setup and a Pages deploy path.

## Open questions

- ~~Should live input be quantised on the way in, at output, or both?~~ Both:
  the UI quantises monitored/recorded input, and the engine still quantises at
  output.
- ~~Should live recording be step-based or loop-based?~~ Step-based while
  stopped (selection advances) and loop-based while playing (writes to the
  sounding step). Explicit armed track; one step per key press.
- Should held keys record ties in a later pass? Deferred; Alt+click for now.
- Should keyboard velocity become a per-step velocity? Deferred; track velocity
  is used.
- Should the scale be global, per track, or per pattern?
- On a scale change, should notes snap (current) or keep their old pitches and
  only quantise at output (the old behaviour)?
- Should presets reset the scale, or should loading a preset keep the current
  scale and re-snap its notes?
- ~~Is the target still the M18's 4 CV/gate tracks, or do you want more tracks
  using spare CV outputs / expanders?~~ Four tracks: 1 melodic + 3 drum, using
  all four hardware gates. More tracks would need an allocation UI.

## Handoff notes

- The branch exists locally only; nothing has been pushed.
- `main` is untouched at `bec9e46`.
- `git status` should show `README.md`, `droid.ini`, `index.html`,
  `test/engine.test.js`, `test/ui.test.js`, `test/run.sh`, and `PLAN.md`
  modified/untracked on `scale-sequencer`.
- The test suite currently prints `ALL TESTS PASSED` and `UI smoke OK`.
