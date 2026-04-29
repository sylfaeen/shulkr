import introduction from '@shulkr/shared/docs/introduction.md?raw';
import installation from '@shulkr/shared/docs/installation.md?raw';
import configuration from '@shulkr/shared/docs/configuration.md?raw';
import tasks from '@shulkr/shared/docs/tasks.md?raw';
import troubleshooting from '@shulkr/shared/docs/troubleshooting.md?raw';

export const docsContent: Record<string, string> = {
  introduction,
  installation,
  configuration,
  tasks,
  troubleshooting,
};

export { docsSlugs, DEFAULT_DOC_SLUG } from '@shulkr/shared';
