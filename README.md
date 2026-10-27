# M18 Web Seq

A 4-track step sequencer that runs in the browser (Web MIDI) and drives the **DROID Master18** over a direct USB connection: **1 melodic pitch+gate track and 3 drum trigger tracks**. Scale-first: every note is snapped to the selected root and scale, on entry and whenever the scale changes. Single file (`index.html`), no build step, no internet needed.

## Run it

Web MIDI only works on a secure origin, so open it via **localhost** or an https URL, not by double-clicking:

```sh
cd m18-webseq
python -m http.server 8000      # or: npx serve
```

Then open **http://localhost:8000** in **Chrome or Edge**. Allow MIDI access when asked — the permission covers both the Master18 output and any keyboard input. Firefox works too, but it asks for a site permission first. Safari doesn't support Web MIDI.

## Wiring

```
PC USB ──► USB cable ──► Master18 USB port   (droid.ini: usb = 1)
```

- The Master18 appears as a USB MIDI device; Windows lists it as **DROID X7 MIDI**. Pick that under **MIDI output**. The choice is remembered.
- **Master18 USB switch:** set it to the **right** position for USB MIDI. Left = USB stick mode (SD card access), middle = off/reloads the patch.
- The Master18's four hardware gate outputs **G1.1–G1.4** cover all four tracks. Gate-only `[midiin]` voices handle the drum tracks, so they need no pitch output.
- You don't need a separate MIDI interface. Per the DROID manual (blue-7, `midiin` → port selection), `usb = 1` is the Master18's own USB port, and setting only `usb` turns TRS off for that circuit.
- **TRS also works:** to feed TRS MIDI1 from a USB MIDI interface instead, change every `usb = 1` to `trs = 1`.

## Outputs (matches droid.ini)

| Track | MIDI ch (default) | Pitch (1 V/oct) | Gate |
|---|---|---|---|
| 1 melodic | 1 | O1 | G1.1 |
| 2 drum (kick 36) | 2 | — | G1.2 |
| 3 drum (snare 38) | 3 | — | G1.3 |
| 4 drum (hat 42) | 4 | — | G1.4 |
| Clock: 16ths, 0/5 V | MIDI clock | O7 | |
| Start/reset: 0/5 V | MIDI Start | O8 | |

O2–O6 are spare. You can clock the Behringer STEPS from O7 and reset it from O8. Velocity is fixed (100 by default, set per track), because dynamics come from STEPS.

## Features

- **Transport:** Play/Stop (or the space bar), BPM 40–240, swing 50–75% (50 = straight, ~66 = triplet feel).
  - Play sends MIDI **Start (0xFA)** and then **24 ppq clock (0xF8)**.
  - Stop sends **Stop (0xFC)**, note-offs for any sounding notes, and All Notes Off (CC123) on each track channel.
  - Optional **Clock when stopped** setting (off by default).
  - **Panic** button.
- **Timing:** uses a lookahead scheduler (a 25 ms `setTimeout` loop that schedules 120 ms ahead, with `performance.now()` timestamps passed to `output.send`), so timing doesn't depend on UI jank.
- **Per track:**
  - MIDI channel (1–16) and length 1–32 for polymeters.
  - Velocity, mute.
  - Melodic tracks: gate %, transpose −oct, −1, +1, +oct.
  - Drum tracks: fixed trigger note, gate length in ms; note/gate-%/transpose controls are hidden.
  - Randomise and clear. Each track shows a **Melodic** or **Drum** badge.
- **Per step:** on/off, and on melodic tracks note (shown as name + octave; MIDI 60 = C4) and **tie/slide**. A tied step holds into the next one, and the next note-on is sent *before* the previous note-off (legato). Tying into the same pitch holds it without a retrigger. Drum tracks show a hit dot instead of a note name.
- **Trigger mode** (on for tracks 2–4 by default) makes a track a drum trigger: a fixed note and a short gate in ms (15 ms by default). The defaults are kick 36, snare 38 and closed hat 42, with a simple kick/snare/hat groove in the initial state. Switching a track to Drum hides all pitch controls and leaves the step editor with just **Hit**.
- **Scale-first pitch:** pick a root and one of 15 scales (the seven modes, harmonic/melodic minor, pentatonic major/minor, blues, whole tone, diminished, chromatic). Notes are snapped to the scale on entry, on transposition, and when the scale or root changes; the note editor only offers in-scale notes. Snapping uses the nearest scale note, with exact ties going down. The header shows the selected scale's notes. Output is quantised defensively as well, so imported or legacy patterns stay in key.
- **Live MIDI input:** play notes in from any Web MIDI keyboard (a KORG nanoKEY 2 needs no driver), monitor them through the M18, and record them into an armed track. Notes are quantised exactly like mouse entry. See [Live MIDI input](#live-midi-input-nanokey-2-any-usb-keyboard).
- **Patterns:**
  - Autosave in the browser.
  - Named save/load/delete (localStorage).
  - Export/import JSON.
- **Presets:** pick one from the **Presets** dropdown and click **Load preset**. Built in so far:
  - **Octave Strut**: an original octave-jumping bass groove on track 1 (ch 1) at 121 BPM with a 50% gate. Other tracks are empty.
  - To add more, add an entry to the `PRESETS` array in `index.html` (`{name, bpm, tracks:[{notes:[…], gate}]}`; note 0 = step off).
- **droid.ini panel** with a Copy button. It updates when you change channels and warns about duplicate channels.

### Step editing

- Click = on/off and select.
- Right-click or Shift+click = select a step without toggling.
- **Melodic tracks:** the editor under the track shows **On**, **Note**, **−oct / −deg / +deg / +oct**, and **Tie / slide**. The Note dropdown sets the selected step's pitch, and the buttons move it by one scale degree or one octave. Only the selected step changes.
- **Drum tracks:** the editor shows just **Hit**, and the cells show a hit dot rather than a note name. The fixed trigger note and gate length are in the track header; gate %, transpose and tie are hidden.
- Mouse wheel over a cell = next/previous note of the scale on melodic tracks (hold Shift for ±1 octave); on drum tracks it just selects the step.
- Alt+click = toggle tie on a melodic track (on a drum track it toggles the hit).
- The track transpose buttons move every step by one scale degree (`−deg` / `+deg`) or one octave (`−oct` / `+oct`); `Randomise` chooses in-scale notes on melodic tracks and random hits on drum tracks.

### Live MIDI input (nanoKEY 2, any USB keyboard)

The sequencer can take notes from a Web MIDI **input** as well as the mouse.

1. Plug the keyboard into the computer. The nanoKEY 2 is USB class-compliant, so it needs no driver or KORG software; its own octave buttons simply change the notes it sends.
2. Under **MIDI input**, pick the keyboard (on Linux it appears as something like `nanoKEY2 KEYBOARD`). If it is the only input — or the only nanoKEY — it is selected automatically, and the choice is remembered.
3. Incoming notes are snapped to the current root and scale. The last played note is shown beside the selector, e.g. `In: C#4 → C4`.
4. **Monitor input** (on by default) sends the quantised note through **MIDI output** on the armed track's MIDI channel, so you hear it through the M18. Turn it off for silent entry.
5. **● Record** arms capture, and **to Track N** picks the target. Arming is per session: reloading never starts in record mode.

Recording behaviour:

- **While stopped** — select a step (click, right-click, or Shift+click), then play keys. Each key writes its note into the selected step and advances the selection. On a trigger track the key writes a trigger hit instead of a pitch. This is the quickest way to type a melody in.
- **While playing** — keys land on the step that is currently sounding on the armed track. The loop overwrites as it comes around.
- One key press writes one step. A held note does not sustain or tie across steps; add ties afterwards with Alt+click.
- Velocity is not recorded: playback uses the track's **Vel** setting. The keyboard's velocity still controls how loud the monitored note is.
- Live notes, imported notes, and transposed notes all take the same quantise path, so they agree.

## droid.ini

This is the default, and the app shows a live copy that updates with channel changes:

```ini
# droid.ini - M18 Web Seq (browser Web MIDI) -> USB cable -> MASTER18 USB port (usb = 1)
# generated by m18-webseq
# (to use TRS MIDI1 instead, change every "usb = 1" to "trs = 1")
# track 1
[midiin]
    usb = 1
    channel = 1
    pitch1 = O1
    gate1 = G1.1
# track 2 (drum trigger - gate only)
[midiin]
    usb = 1
    channel = 2
    gate1 = G1.2
# track 3 (drum trigger - gate only)
[midiin]
    usb = 1
    channel = 3
    gate1 = G1.3
# track 4 (drum trigger - gate only)
[midiin]
    usb = 1
    channel = 4
    gate1 = G1.4
# clock + start
[midiin]
    usb = 1
    clock = _MIDI_CLK16
    start = _MIDI_START
# 16th clock as 0/5 V on O7
[copy]
    input = _MIDI_CLK16 * 0.5
    output = O7
# start/reset pulse as 0/5 V on O8
[copy]
    input = _MIDI_START * 0.5
    output = O8
```

(It's also saved as `droid.ini` in this folder.)

## Tests

`./test/run.sh` (needs Node 18+) extracts the engine and UI scripts from `index.html`, syntax-checks both, then runs:

- `test/engine.test.js` against a mocked MIDI output with a virtual clock. It checks:
  - Start before the first clock, and 24 clocks per beat.
  - Note on/off on channels 1–4, fixed velocity, and gate length.
  - The trigger-mode gate.
  - The legato order for ties.
  - The swing offset and polymeter lengths.
  - Scale quantise, scale-degree/octave stepping, direction, migration snapping, and the v2/v3 → v4 layout migrations.
  - Harmonic-minor output and channel changes.
  - Stop/CC123, and clock-when-stopped.
  - The droid.ini output, including gate-only drum tracks.
  - Per-step note movement and its rejection on drum tracks.
  - MIDI input parsing, the record helper, and monitor note-on/off.
- `test/ui.test.js`, which runs the real UI against a tiny DOM stub to check input auto-selection, monitoring, stopped step-entry recording, and persistence. It is a smoke test, not a browser test.
