export type DocSection = {
  section: string;
  items: Array<{ slug: string; label: string; icon: string }>;
};

export const docsNavigation: Array<DocSection> = [
  {
    section: 'Getting Started',
    items: [
      { slug: 'introduction', label: 'Introduction', icon: 'BookOpen' },
      { slug: 'installation', label: 'Installation', icon: 'Download' },
      { slug: 'configuration', label: 'Configuration', icon: 'Settings' },
    ],
  },
  {
    section: 'Features',
    items: [
      { slug: 'server-management', label: 'Server Management', icon: 'Server' },
      { slug: 'console', label: 'Console', icon: 'Terminal' },
      { slug: 'files', label: 'Files', icon: 'FolderOpen' },
      { slug: 'plugins', label: 'Plugins', icon: 'Puzzle' },
      { slug: 'tasks', label: 'Tasks', icon: 'Clock' },
    ],
  },
  {
    section: 'Administration',
    items: [
      { slug: 'users', label: 'Users', icon: 'Users' },
      { slug: 'security', label: 'Security', icon: 'Shield' },
      { slug: 'domain', label: 'Domain', icon: 'Globe' },
    ],
  },
  {
    section: 'Reference',
    items: [
      { slug: 'docker', label: 'Docker', icon: 'Container' },
      { slug: 'api', label: 'API', icon: 'Code' },
      { slug: 'rate-limits', label: 'Rate Limits', icon: 'Gauge' },
    ],
  },
];

export const docsSlugs = docsNavigation.flatMap((s) => s.items.map((i) => i.slug));

export const DEFAULT_DOC_SLUG = 'introduction';
