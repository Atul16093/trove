export interface DefaultCategory { slug: string; name: string; color: string; sort_order: number; }

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { slug: 'jobs',         name: 'Jobs',         color: '#3D5A80', sort_order: 1 },
  { slug: 'ai_tools',     name: 'AI Tools',     color: '#6D597A', sort_order: 2 },
  { slug: 'shopping',     name: 'Shopping',     color: '#B0596B', sort_order: 3 },
  { slug: 'learning',     name: 'Learning',     color: '#2A9D8F', sort_order: 4 },
  { slug: 'finance',      name: 'Finance',      color: '#3E7C4E', sort_order: 5 },
  { slug: 'productivity', name: 'Productivity', color: '#C67B5C', sort_order: 6 },
  { slug: 'inspiration',  name: 'Inspiration',  color: '#8478B8', sort_order: 7 },
  { slug: 'reading',      name: 'Reading',      color: '#6E7259', sort_order: 8 },
  { slug: 'other',        name: 'Other',        color: '#6C6B64', sort_order: 99 },
];

export const FALLBACK_CATEGORY_SLUG = 'other';
export const CATEGORY_SLUGS = DEFAULT_CATEGORIES.map((c) => c.slug);
