class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.downFactor = sampleRate / 16000; // e.g., 48000/16000 = 3
    this.residual = new Float32Array(0);
  }

  // naive downsample + convert to 16-bit PCM
  _downsampleFloat32To16le(float32) {
    const outLen = Math.floor((float32.length + this.residual.length) / this.downFactor);
    const mixed = new Float32Array(this.residual.length + float32.length);
    mixed.set(this.residual, 0);
    mixed.set(float32, this.residual.length);

    const out = new Int16Array(outLen);
    let i = 0, o = 0;
    while (i + this.downFactor <= mixed.length) {
      let sum = 0;
      const end = i + this.downFactor;
      const n = Math.floor(this.downFactor);
      for (let k = i; k < end; k++) sum += mixed[k];
      const avg = sum / (end - i);
      // clamp & convert
      const s = Math.max(-1, Math.min(1, avg));
      out[o++] = s * 0x7fff;
      i = end;
    }
    // keep remainder for next callback
    this.residual = mixed.slice(i);
    return out;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input[0]) {
      const float32 = input[0]; // mono [0] (or take L channel)
      const pcm16 = this._downsampleFloat32To16le(float32);
      if (pcm16.length) {
        this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
      }
    }
    return true;
  }
}

registerProcessor('pcm-worklet', PCMWorkletProcessor);
