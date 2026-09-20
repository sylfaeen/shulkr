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
    items: [{ slug: 'tasks', label: 'Tasks', icon: 'Clock' }],
  },
  {
    section: 'Shulkr Core',
    items: [{ slug: 'shulkr-core', label: 'Shulkr Core', icon: 'Puzzle' }],
  },
  {
    section: 'Administration',
    items: [{ slug: 'troubleshooting', label: 'Troubleshooting', icon: 'LifeBuoy' }],
  },
];

export const docsSlugs = docsNavigation.flatMap((s) => s.items.map((i) => i.slug));

export const DEFAULT_DOC_SLUG = 'introduction';

export const DOC_LOCALES = ['en', 'fr', 'es', 'de'] as const;
export type DocLocale = (typeof DOC_LOCALES)[number];
export const DEFAULT_DOC_LOCALE: DocLocale = 'en';
