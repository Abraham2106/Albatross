import { MAX_AUDIO_SECONDS, pcmToWav } from '../application/audio';
export interface Recording { stop(): Promise<Uint8Array>; cancel(): Promise<void> }
export async function startRecording(onLimit: () => void, onSeconds: (value: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
  let context: AudioContext | undefined;
  let node: AudioWorkletNode | undefined;
  let source: MediaStreamAudioSourceNode | undefined;
  const chunks: Float32Array[] = [];
  let count = 0;
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const close = async () => {
    ended = true;
    if (timer) clearTimeout(timer);
    node?.disconnect(); source?.disconnect();
    stream.getTracks().forEach(track => track.stop());
    if (context && context.state !== 'closed') await context.close();
  };
  try {
    context = new AudioContext({ sampleRate: 16000 });
    await context.audioWorklet.addModule(import.meta.env.BASE_URL + 'pcm-recorder.js');
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'pcm-recorder');
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      if (ended) return;
      const capacity = Math.floor(context!.sampleRate * MAX_AUDIO_SECONDS) - count;
      if (capacity <= 0) return;
      const samples = event.data.slice(0, capacity);
      chunks.push(samples); count += samples.length;
      onSeconds(Math.floor(count / context!.sampleRate));
    };
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(node); node.connect(mute); mute.connect(context.destination);
    await context.resume();
    timer = setTimeout(onLimit, MAX_AUDIO_SECONDS * 1000);
    return {
      async stop() {
        if (ended) throw new Error('La grabación ya terminó.');
        const rate = context!.sampleRate;
        await close();
        const pcm = new Float32Array(count);
        let offset = 0;
        for (const chunk of chunks) { pcm.set(chunk, offset); offset += chunk.length; }
        return pcmToWav(pcm, rate);
      },
      cancel: close,
    };
  } catch (error) { await close(); throw error; }
}
