/** Booth colours on the public / customer maps: available booths use their CMS booth-category colour (no hatching);
 * booked booths use status colours. Text colour is chosen for contrast on the fill. */
export const STATUS_FILL: Record<string, string> = {RESERVED: "#F2C14E", OCCUPIED: "#5B6472", BLOCKED: "#C5C9CF", UNAVAILABLE: "#C5C9CF"};
export const AVAILABLE_FALLBACK = "#A9D4F5";
const hex = (c: string) => /^#?([0-9a-f]{6})$/i.exec(c)?.[1];
export function boothFill(status: string, categoryColor?: string | null) {
  if (status === "AVAILABLE") return categoryColor && hex(categoryColor) ? "#" + hex(categoryColor) : AVAILABLE_FALLBACK;
  return STATUS_FILL[status] || STATUS_FILL.BLOCKED;
}
/** Dark text on light fills, white on dark ones (WCAG relative luminance). */
export function boothText(fill: string) {
  const h = hex(fill); if (!h) return "#111";
  const [r, g, b] = [0, 2, 4].map(i => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? "#111" : "#fff";
}
