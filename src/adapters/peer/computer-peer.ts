import { parseEnvelope, parseSubmitCapture } from '../../application/capture-protocol';
import { CaptureService, type CaptureSession } from '../../application/capture-service';
import { InferenceError } from '../../application/ports/inference-engine';
import { invalid } from '../../application/validation';
import { DeviceRegistry } from './device-registry';

/** Application-channel peer. Does not start QVAC DHT or listen on the network. */
export class ComputerPeerService {
  private pump: Promise<void> = Promise.resolve();

  constructor(
    private readonly capture: CaptureService,
    private readonly devices: DeviceRegistry,
    private readonly peerId: string,
  ) {}

  idle() { return this.pump; }

  async dispatch(raw: unknown) {
    const envelope = parseEnvelope(raw);
    this.devices.session(envelope.deviceId);
    const session: CaptureSession = { deviceId: envelope.deviceId, author: envelope.deviceId, peerId: this.peerId };
    switch (envelope.operation) {
      case 'capabilities':
        return this.capture.capabilities();
      case 'submitCapture': {
        if (!envelope.captureId) invalid('Falta captureId.');
        const body = parseSubmitCapture(envelope.payload);
        if (envelope.captureId !== body.idempotencyKey) invalid('captureId debe coincidir con la clave idempotente.');
        const receipt = this.capture.submit(session, envelope.payload);
        this.enqueue(session, receipt.captureId);
        return receipt;
      }
      case 'uploadAttachment': {
        if (!envelope.captureId) invalid('Falta captureId.');
        const job = this.capture.upload(session, envelope.captureId, envelope.payload);
        this.enqueue(session, job.id);
        return job;
      }
      case 'getCaptureStatus':
      case 'getDraft':
        if (!envelope.captureId) invalid('Falta captureId.');
        return this.capture.status(session, envelope.captureId);
      case 'acceptDraft':
        if (!envelope.captureId) invalid('Falta captureId.');
        return this.capture.accept(session, envelope.captureId, envelope.payload);
      case 'cancelCapture':
        if (!envelope.captureId) invalid('Falta captureId.');
        return this.capture.cancel(session, envelope.captureId);
      case 'queryInstalledBase':
        throw new InferenceError('UNSUPPORTED_INPUT', 'La consulta de base instalada aún no está en el peer.');
    }
  }

  private enqueue(session: CaptureSession, captureId: string) {
    this.pump = this.pump.then(async () => {
      const job = this.capture.status(session, captureId);
      if (job.state === 'queued') {
        try { await this.capture.process(session, captureId); }
        catch { /* el trabajo queda en failed y se consulta por status */ }
      }
    });
  }
}
