const SUFFIXES = ['', 'k', 'M', 'B', 'T'];

/** Formats item counts like the game: 920, 2.22k, 10.8k, 474M, 1.55B (three significant digits). */
export function formatCount(value: number): string {
  if (value < 1000) return String(Math.floor(value));
  const tier = Math.min(Math.floor(Math.log10(value) / 3), SUFFIXES.length - 1);
  const scaled = value / 1000 ** tier;
  // Truncate rather than round, so a count never displays more than the player has.
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const text = (Math.floor(scaled * 10 ** digits) / 10 ** digits).toFixed(digits).replace(/\.?0+$/, '');
  return `${text}${SUFFIXES[tier]}`;
}
