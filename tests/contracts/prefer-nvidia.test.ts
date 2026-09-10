import { describe, expect, it } from 'vitest';
import { llamaDedicatedGpuConfig, nvidiaIndexFromVulkanSummary } from '../../src/adapters/inference/qvac/prefer-nvidia';

const summary = `
Devices:
========
GPU0:
	apiVersion         = 1.3.280
	vendorID           = 0x1002
	deviceType         = PHYSICAL_DEVICE_TYPE_INTEGRATED_GPU
	deviceName         = AMD Radeon(TM) Graphics
GPU1:
	apiVersion         = 1.4.325
	vendorID           = 0x10de
	deviceType         = PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
	deviceName         = NVIDIA GeForce RTX 2050
`;

describe('NVIDIA GPU pin', () => {
  it('picks the NVIDIA Vulkan index, not the AMD iGPU', () => {
    expect(nvidiaIndexFromVulkanSummary(summary)).toEqual({ index: 1, name: 'NVIDIA GeForce RTX 2050' });
  });

  it('keeps llama.cpp on a single dedicated GPU', () => {
    expect(llamaDedicatedGpuConfig()).toEqual({ device: 'gpu', 'main-gpu': 'dedicated', 'split-mode': 'none' });
  });
});
