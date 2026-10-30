import { describe, it, expect } from 'vitest';
import {
  searchHangarProjects,
  getHangarProject,
  getHangarVersions,
  downloadHangarPlugin,
} from '@shulkr/backend/services/hangar_service';

describe('hangar_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof searchHangarProjects).toBe('function');
    expect(typeof getHangarProject).toBe('function');
    expect(typeof getHangarVersions).toBe('function');
    expect(typeof downloadHangarPlugin).toBe('function');
  });
});
