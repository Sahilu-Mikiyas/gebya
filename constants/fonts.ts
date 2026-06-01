/**
 * Gebya font constants — mirrors the design's Inter + JetBrains Mono stack.
 * Use Fonts.bold for most headings and Fonts.mono for all ETB prices.
 */
export const Fonts = {
  regular:   'Inter_400Regular',
  semibold:  'Inter_600SemiBold',
  bold:      'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
  black:     'Inter_900Black',
  mono:      'JetBrainsMono_700Bold',
} as const;

export type FontKey = keyof typeof Fonts;
