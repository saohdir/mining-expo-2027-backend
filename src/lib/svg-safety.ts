/** FR-091 / NFR-21: SVG floorplans are accepted only if they contain no active or external content,
 * and are then RASTERISED server-side (the original SVG is never served). */
const FORBIDDEN: [RegExp, string][] = [
  [/<script[\s>]/i, "script"], [/<foreignObject[\s>]/i, "foreignObject"], [/\son[a-z]+\s*=/i, "event handler attribute"],
  [/javascript:/i, "javascript: URL"], [/<!ENTITY/i, "XML entity"], [/<!DOCTYPE/i, "DOCTYPE"], [/<(iframe|embed|object|audio|video)[\s>]/i, "embedded media"],
  [/(href|src)\s*=\s*["']\s*(https?:|\/\/|file:|data:(?!image\/(png|jpe?g|webp);base64,))/i, "external or data reference"],
  [/url\(\s*["']?\s*(https?:|\/\/|file:)/i, "external CSS reference"], [/@import/i, "CSS import"]
];
export function svgProblems(text: string) {
  if (!/<svg[\s>]/i.test(text)) return ["not an SVG document"];
  return FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => why);
}
