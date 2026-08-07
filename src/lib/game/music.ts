// ============================================================================
// Eldoria Online — procedural ambient fantasy music (Web Audio API)
// No external files. Synthesizes a looping medieval/ethereal soundscape:
// a low drone pad, slow pentatonic flute melody, soft harp arpeggios, and
// occasional tribal percussion. Adapts intensity with day/night and combat.
// ============================================================================

type Mood = 'calm' | 'combat' | 'dungeon'

// Pentatonic / Dorian-ish scales (Hz), pleasant and ambiguous
const SCALES: Record<string, number[]> = {
  // A minor pentatonic across 2 octaves
  calm: [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25],
  // E minor (darker) pentatonic for combat
  combat: [164.81, 196.0, 220.0, 246.94, 293.66, 329.63, 392.0, 440.0, 493.88],
  // C phrygian-ish for dungeon (tense, exotic)
  dungeon: [130.81, 138.59, 174.61, 196.0, 220.0, 261.63, 277.18, 349.23, 392.0],
}

export class MusicEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicGain: GainNode | null = null
  private droneGain: GainNode | null = null
  private schedTimer: number | null = null
  private nextNoteTime = 0
  private step = 0
  private mood: Mood = 'calm'
  private targetMood: Mood = 'calm'
  playing = false
  enabled = true
  private volume = 0.5

  // drone oscillators (kept alive while playing)
  private droneOscs: { osc: OscillatorNode; gain: GainNode }[] = []

  start() {
    if (this.playing) return // already running — don't create a duplicate context
    if (!this.enabled) return
    try {
      // if a previous context exists (shouldn't, but just in case), close it
      if (this.ctx) { try { this.ctx.close() } catch { /* noop */ } }
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
      this.musicGain = this.ctx.createGain()
      this.musicGain.gain.value = 0.8
      this.musicGain.connect(this.master)
      this.droneGain = this.ctx.createGain()
      this.droneGain.gain.value = 0.12
      this.droneGain.connect(this.musicGain)
      this.droneOscs = []
      this.startDrone()
      // reset the scheduler — never try to "catch up" from a previous session
      this.nextNoteTime = this.ctx.currentTime + 0.15
      this.step = 0
      this.playing = true
      this.schedule()
    } catch {
      // audio not available
    }
  }

  stop() {
    this.playing = false
    if (this.schedTimer) {
      clearTimeout(this.schedTimer)
      this.schedTimer = null
    }
    for (const d of this.droneOscs) {
      try { d.osc.stop() } catch { /* noop */ }
    }
    this.droneOscs = []
    if (this.ctx) {
      const ctx = this.ctx
      if (this.master) this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
      setTimeout(() => { try { ctx.close() } catch { /* noop */ } }, 400)
    }
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.droneGain = null
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.stop()
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.1)
    }
  }

  setMood(m: Mood) {
    this.targetMood = m
  }

  private startDrone() {
    if (!this.ctx || !this.droneGain) return
    const base = SCALES[this.mood][0] / 2 // one octave below root
    const fifth = base * 1.5
    // two detuned oscillators for a rich pad
    for (const freq of [base, fifth, base * 2]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = freq
      const g = this.ctx.createGain()
      g.gain.value = 0.5
      // slow LFO on gain for breathing effect
      const lfo = this.ctx.createOscillator()
      lfo.frequency.value = 0.08 + Math.random() * 0.06
      const lfoGain = this.ctx.createGain()
      lfoGain.gain.value = 0.25
      lfo.connect(lfoGain)
      lfoGain.connect(g.gain)
      lfo.start()
      osc.connect(g)
      g.connect(this.droneGain)
      osc.start()
      this.droneOscs.push({ osc, gain: g })
      this.droneOscs.push({ osc: lfo, gain: lfoGain })
    }
  }

  private retuneDrone() {
    if (!this.ctx) return
    const base = SCALES[this.mood][0] / 2
    const freqs = [base, base * 1.5, base * 2]
    let i = 0
    for (const d of this.droneOscs) {
      if (d.osc.type === 'sine' && i < freqs.length) {
        d.osc.frequency.setTargetAtTime(freqs[i], this.ctx.currentTime, 1.5)
        i++
      }
    }
  }

  // ---- note synthesis -----------------------------------------------------
  private playFlote(time: number, freq: number, dur: number, vel: number) {
    if (!this.ctx || !this.musicGain) return
    const osc = this.ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = freq
    // slight vibrato
    const vib = this.ctx.createOscillator()
    vib.frequency.value = 5
    const vibG = this.ctx.createGain()
    vibG.gain.value = freq * 0.005
    vib.connect(vibG)
    vibG.connect(osc.frequency)
    vib.start(time)
    vib.stop(time + dur + 0.1)
    const g = this.ctx.createGain()
    const attack = 0.08, release = dur * 0.6
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vel * 0.18, time + attack)
    g.gain.setTargetAtTime(0, time + attack, release)
    // lowpass for warmth
    const lp = this.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2000
    lp.Q.value = 1
    osc.connect(lp)
    lp.connect(g)
    g.connect(this.musicGain)
    osc.start(time)
    osc.stop(time + dur + 0.2)
  }

  private playHarp(time: number, freq: number, vel: number) {
    if (!this.ctx || !this.musicGain) return
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0, time)
    g.gain.linearRampToValueAtTime(vel * 0.12, time + 0.005)
    g.gain.setTargetAtTime(0, time + 0.01, 0.25)
    osc.connect(g)
    g.connect(this.musicGain)
    osc.start(time)
    osc.stop(time + 1.2)
    // overtone
    const osc2 = this.ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.value = freq * 2
    const g2 = this.ctx.createGain()
    g2.gain.setValueAtTime(0, time)
    g2.gain.linearRampToValueAtTime(vel * 0.04, time + 0.005)
    g2.gain.setTargetAtTime(0, time + 0.01, 0.2)
    osc2.connect(g2)
    g2.connect(this.musicGain)
    osc2.start(time)
    osc2.stop(time + 1.0)
  }

  private playDrum(time: number, vel: number) {
    if (!this.ctx || !this.musicGain) return
    // kick-ish: sine sweep down
    const osc = this.ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(120, time)
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.18)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(vel * 0.4, time)
    g.gain.setTargetAtTime(0, time + 0.02, 0.12)
    osc.connect(g)
    g.connect(this.musicGain)
    osc.start(time)
    osc.stop(time + 0.3)
  }

  // ---- scheduler ----------------------------------------------------------
  private schedule = () => {
    if (!this.playing || !this.ctx) return
    const tempo = this.mood === 'combat' ? 0.42 : this.mood === 'dungeon' ? 0.55 : 0.7 // sec per step
    // CRITICAL FIX: if we've fallen behind (e.g., after a game freeze / tab
    // switch), do NOT try to catch up by scheduling a burst of notes — that
    // would create dozens of oscillators at once, overloading the audio graph
    // and making the freeze worse (death spiral). Instead, reset the scheduler
    // to "now" and continue from here.
    if (this.nextNoteTime < this.ctx.currentTime) {
      this.nextNoteTime = this.ctx.currentTime + 0.1
    }
    // cap the number of notes per schedule call to prevent storms
    let notesScheduled = 0
    while (this.nextNoteTime < this.ctx.currentTime + 0.25 && notesScheduled < 8) {
      this.stepNote(this.step, this.nextNoteTime)
      this.nextNoteTime += tempo
      this.step = (this.step + 1) % 32
      notesScheduled++
    }
    // smooth mood transition
    if (this.mood !== this.targetMood) {
      this.mood = this.targetMood
      this.retuneDrone()
    }
    this.schedTimer = window.setTimeout(this.schedule, 80)
  }

  private stepNote(step: number, time: number) {
    const scale = SCALES[this.mood]
    // melody: sparse flute notes on certain steps
    const melodyPattern = this.mood === 'combat'
      ? [0, 0, 3, 0, 0, 4, 0, 2, 0, 0, 5, 0, 2, 0, 3, 0, 0, 0, 4, 0, 0, 6, 0, 3, 0, 0, 5, 0, 4, 0, 3, 0]
      : this.mood === 'dungeon'
        ? [0, 0, 0, 2, 0, 0, 3, 0, 0, 0, 4, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 0, 5, 0, 0, 2, 0, 0, 4, 0, 2, 0]
        : [4, 0, 0, 6, 0, 0, 5, 0, 3, 0, 0, 4, 0, 0, 2, 0, 5, 0, 0, 4, 0, 0, 3, 0, 6, 0, 0, 5, 0, 2, 0, 0]
    const noteIdx = melodyPattern[step]
    if (noteIdx > 0) {
      const freq = scale[Math.min(noteIdx, scale.length - 1)]
      const dur = this.mood === 'combat' ? 0.5 : 0.9
      const vel = 0.7 + Math.random() * 0.3
      this.playFlote(time, freq, dur, vel)
    }
    // harp arpeggios every 4 steps
    if (step % 4 === 0) {
      const root = scale[0]
      const chord = [root * 2, root * 3, root * 2.5]
      for (let i = 0; i < chord.length; i++) {
        this.playHarp(time + i * 0.06, chord[i], 0.6)
      }
    }
    // percussion: combat = driving, dungeon = sparse, calm = none
    if (this.mood === 'combat') {
      if (step % 2 === 0) this.playDrum(time, 0.7)
    } else if (this.mood === 'dungeon') {
      if (step % 8 === 0) this.playDrum(time, 0.5)
    }
  }
}

// singleton
let _music: MusicEngine | null = null
export function getMusic(): MusicEngine {
  if (!_music) _music = new MusicEngine()
  return _music
}
