import { describe, expect, it } from 'vitest';
// @ts-expect-error Pure JavaScript state mapping used by the React UI.
import { pipelineState } from '../../ui/cib-ui-5/cib-ui/src/components/pipeline-state.mjs';

describe('recording pipeline phases', () => {
  it('records while Whisper warms, then retains readiness after stopping', () => {
    const result = pipelineState({ recording: true, warming: true, showLlm: true });
    expect(result.stages.map((s: { state: string }) => s.state)).toEqual(['on', 'on', 'wait', 'idle']);
    expect(pipelineState({ captured: true, sttReady: true }).stages[2].label).toBe('listo');
  });
  it('distinguishes transcription, loading Qwen and review, ignoring stale progress at idle', () => {
    expect(pipelineState({ processing: true, progress: 'Transcribiendo 3.0 s de audio…' }).stages[2].state).toBe('on');
    const result = pipelineState({ captured: true, processing: true, progress: 'Cargando modelo llm…', showLlm: true });
    expect(result.stages.map((s: { state: string }) => s.state)).toEqual(['done', 'done', 'done', 'on']);
    expect(pipelineState({ review: true, showLlm: true }).stages.every((s: { state: string }) => s.state === 'done')).toBe(true);
    expect(pipelineState({ progress: 'Extrayendo observaciones…' }).phase).toBe('idle');
  });
});
