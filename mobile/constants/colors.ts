/**
 * Gebya design tokens — mirrors the CSS variables in price-tracker.html
 */
export const Colors = {
  // Backgrounds
  bg:      '#080808',
  s0:      '#0A0A0A',
  s1:      '#111111',
  s2:      '#161616',
  s3:      '#1A1A1A',
  s4:      '#222222',
  border:  '#1E1E1E',
  border2: '#141414',

  // Text
  t1: '#FFFFFF',
  t2: '#CCCCCC',
  t3: '#999999',
  t4: '#666666',
  t5: '#444444',
  t6: '#2A2A2A',

  // Categories
  veggie:  '#22C55E',
  grain:   '#F97316',
  protein: '#EC4899',
  oil:     '#EAB308',
  dairy:   '#3B82F6',
  spice:   '#A855F7',
  bread:   '#F59E0B',
  other:   '#6B7280',

  // Status
  deal:     '#00D4FF',
  verified: '#39FF14',
  flagged:  '#FF6B35',
  birr:     '#F59E0B',
  saving:   '#22C55E',
} as const;

export type CategoryKey = 'veggie' | 'grain' | 'protein' | 'oil' | 'dairy' | 'spice' | 'bread' | 'other';

export const categoryColor = (cat: CategoryKey): string => Colors[cat] ?? Colors.other;
