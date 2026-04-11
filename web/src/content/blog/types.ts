export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string; // ISO format YYYY-MM-DD
  author: string;
  readTime: string; // e.g. "5 min read"
  tags: string[];
  category: 'AI Agents' | 'Memory' | 'Tools' | 'Tutorials' | 'Comparisons' | 'Privacy';
  content: string; // markdown
}
