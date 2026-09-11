import { InvitationPairingAdapter } from '../adapters/qvac/InvitationPairingAdapter';
import { DemoCaptureManagementAdapter } from '../adapters/demo/DemoCaptureManagementAdapter';

export const container = {
  computer: new InvitationPairingAdapter(),
  captures: new DemoCaptureManagementAdapter(),
};
