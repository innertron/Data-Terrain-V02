export const PRIMARY_MEDIA = [
  "Cable TV",
  "Broadcast TV",
  "Radio",
  "Print",
  "Podcast",
  "Digital Video",
] as const;

export type PrimaryMedium = (typeof PRIMARY_MEDIA)[number];

const LEGACY_PRIMARY_MEDIA: Record<string, PrimaryMedium> = {
  "tv": "Cable TV",
  "print / digital": "Print",
  "podcast / youtube": "Podcast",
  "podcast / digital": "Podcast",
  "podcast / social": "Podcast",
  "podcast / radio": "Podcast",
};

export function normalizePrimaryMedium(
  value: string | null | undefined,
): PrimaryMedium | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;

  return (
    PRIMARY_MEDIA.find(medium => medium.toLowerCase() === normalized) ??
    LEGACY_PRIMARY_MEDIA[normalized] ??
    null
  );
}