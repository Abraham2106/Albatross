import { DemoComputerConnectionAdapter } from '../adapters/demo/DemoComputerConnectionAdapter';
import { DemoCaptureManagementAdapter } from '../adapters/demo/DemoCaptureManagementAdapter';

export const container = {
  computer: new DemoComputerConnectionAdapter(),
  captures: new DemoCaptureManagementAdapter(),
};
