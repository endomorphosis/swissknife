// AudioWorklet processor for Strudel AI DAW
// Minimal synthesis engine producing a metronome tick at the current BPM
// and a quiet base tone so visualizers have a signal. Controlled via port messages.

class StrudelProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super(options);

    // State controlled from the main thread
    this.playing = false;
    this.bpm = 120;
    this.volume = 0.2; // worklet-side gain, master gain still applied outside

    // Phase accumulators
    this.sampleRate = sampleRate;
    this.timeSec = 0; // running time in seconds

    // Metronome tick state
    this.tickDuration = 0.03; // 30ms short tick
    this.tickPhase = 0; // time since last tick

    this.port.onmessage = (e) => {
      const msg = e.data || {};
      switch (msg.type) {
        case 'setPlaying':
          this.playing = !!msg.value;
          break;
        case 'setBPM':
          if (typeof msg.value === 'number' && isFinite(msg.value) && msg.value > 0) {
            this.bpm = msg.value;
          }
          break;
        case 'setVolume':
          if (typeof msg.value === 'number') {
            this.volume = Math.max(0, Math.min(1, msg.value));
          }
          break;
        default:
          // no-op
          break;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const left = output[0];
    const right = output[1] || output[0];

    const frames = left.length;
    const secPerBeat = 60 / this.bpm;

    for (let i = 0; i < frames; i++) {
      // Advance time
      this.timeSec += 1 / this.sampleRate;
      this.tickPhase += 1 / this.sampleRate;

      let sample = 0;

      if (this.playing) {
        // Produce a short tick at each beat boundary
        // When tickPhase exceeds the beat duration, reset and start a new tick
        if (this.tickPhase >= secPerBeat) {
          this.tickPhase = 0;
        }

        // Within the first tickDuration seconds after boundary, produce a click
        if (this.tickPhase < this.tickDuration) {
          // Exponential decay click
          const t = this.tickPhase;
          const env = Math.exp(-t * 200);
          const freq = 1000;
          sample += env * Math.sin(2 * Math.PI * freq * this.timeSec) * 0.6;
        }

        // Add a quiet base tone so visualizations have continuous signal
        sample += 0.02 * Math.sin(2 * Math.PI * 220 * this.timeSec);
      }

      sample *= this.volume;
      left[i] = sample;
      right[i] = sample;
    }

    return true;
  }
}

registerProcessor('strudel-processor', StrudelProcessor);
