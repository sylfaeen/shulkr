import { describe, it, expect } from 'vitest';
import {
  getPaperMCVersions,
  getPaperMCBuilds,
  getPaperMCLatestBuild,
  getPaperMCBuildDownload,
  downloadPaperMCJar,
} from '@shulkr/backend/services/papermc_service';

describe('papermc_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof getPaperMCVersions).toBe('function');
    expect(typeof getPaperMCBuilds).toBe('function');
    expect(typeof getPaperMCLatestBuild).toBe('function');
    expect(typeof getPaperMCBuildDownload).toBe('function');
    expect(typeof downloadPaperMCJar).toBe('function');
  });
});
