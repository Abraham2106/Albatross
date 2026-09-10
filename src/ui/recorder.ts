import { MAX_AUDIO_SECONDS, pcmToWav, Pcm16Downsampler, resolveCaptureRate, rms, SAMPLE_RATE } from '../application/audio';

export interface RecordingFrame {
  seconds: number;
  rms: number;
  inputRate: number;
  pcm16: Uint8Array;
}

export interface Recording { stop(): Promise<Uint8Array>; cancel(): Promise<void> }

export async function startRecording(
  onLimit: () => void,
  onSeconds: (value: number) => void,
  onFrame?: (frame: RecordingFrame) => void,
): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, sampleRate: SAMPLE_RATE, echoCancellation: true, noiseSuppression: true },
    video: false,
  });
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  let sink: MediaStreamAudioDestinationNode | undefined;
  const chunks: Float32Array[] = [];
  let count = 0;
  let lastSecond = -1;
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const started = performance.now();
  let downsampler: Pcm16Downsampler | undefined;
  const close = async () => {
    ended = true;
    if (timer) clearTimeout(timer);
    node?.disconnect(); source?.disconnect(); sink?.disconnect();
    stream.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') await context.close();
  };
  try {
    context = new AudioContext({ sampleRate: SAMPLE_RATE });
    await context.audioWorklet.addModule(import.meta.env.BASE_URL + 'pcm-recorder.js');
    source = context.createMediaStreamSource(stream);
    sink = context.createMediaStreamDestination();
    node = new AudioWorkletNode(context, 'pcm-recorder');
    downsampler = new Pcm16Downsampler(context.sampleRate);
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (ended) return;
      const elapsed = (performance.now() - started) / 1000;
      if (elapsed >= MAX_AUDIO_SECONDS) return;
      const samples = event.data;
      chunks.push(samples); count += samples.length;
      const inputRate = elapsed >= 0.35
        ? resolveCaptureRate(count, context!.sampleRate, elapsed)
        : context!.sampleRate;
      if (Math.abs(inputRate - downsampler!.inputRate) > 200) downsampler!.reset(inputRate);
      const pcm16 = downsampler!.push(samples);
      const seconds = Math.floor(elapsed);
      if (seconds !== lastSecond) {
        lastSecond = seconds;
        onSeconds(seconds);
      }
      onFrame?.({ seconds, rms: rms(samples), inputRate, pcm16 });
    };
    source.connect(node); node.connect(sink);
    await context.resume();
    timer = setTimeout(onLimit, MAX_AUDIO_SECONDS * 1000);
    return {
      async stop() {
        if (ended) throw new Error('La grabación ya terminó.');
        const elapsedSec = (performance.now() - started) / 1000;
        const reported = context!.sampleRate;
        await close();
        const pcm = new Float32Array(count);
        let offset = 0;
        for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.length; }
        return pcmToWav(pcm, resolveCaptureRate(count, reported, elapsedSec));
      },
      cancel: close,
    };
  } catch (error) { await close(); throw error; }
}
