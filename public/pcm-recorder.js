class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._chunks = [];
    this._length = 0;
    this._target = Math.max(2048, Math.round(sampleRate * 0.08));
  }

  process(inputs) {
    const channels = inputs[0];
    if (channels?.length && channels[0]?.length) {
      const n = channels[0].length;
      const mono = new Float32Array(n);
      for (const channel of channels) {
        for (let i = 0; i < n; i++) mono[i] += channel[i] / channels.length;
      }
      this._chunks.push(mono);
      this._length += n;
      if (this._length >= this._target) this.flush();
    }
    return true;
  }

  flush() {
    if (!this._length) return;
    const out = new Float32Array(this._length);
    let offset = 0;
    for (const chunk of this._chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    this._chunks = [];
    this._length = 0;
    this.port.postMessage(out, [out.buffer]);
  }
}

registerProcessor('pcm-recorder', PcmRecorder);
