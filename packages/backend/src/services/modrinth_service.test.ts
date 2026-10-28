import { describe, it, expect } from 'vitest';
import {
  searchModrinthProjects,
  getModrinthProject,
  getModrinthVersions,
  getModrinthCategories,
  downloadModrinthPlugin,
} from '@shulkr/backend/services/modrinth_service';

describe('modrinth_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof searchModrinthProjects).toBe('function');
    expect(typeof getModrinthProject).toBe('function');
    expect(typeof getModrinthVersions).toBe('function');
    expect(typeof getModrinthCategories).toBe('function');
    expect(typeof downloadModrinthPlugin).toBe('function');
  });
});
