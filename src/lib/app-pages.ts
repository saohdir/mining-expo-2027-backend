/** App pages rendered by Next.js (not static HTML): only their page banner is CMS-editable, with the same field keys as
 * the static pages' fixed "page-hero" section. Kept separate from page-layout.ts so the browser bundle stays small. */
type BannerField = {key: string; kind: "text" | "image"; tag: string; mode?: "plain" | "rich" | "own"; text?: string; src?: string; alt?: string};
export const APP_PAGE_PATHS: Record<string, string> = {floorplan: "/floorplan"};
export const APP_PAGE_FIELDS: Record<string, Record<string, BannerField[]>> = {floorplan: {"page-hero": [
  {key: "page-hero.0", kind: "image", tag: "img", src: "/assets/industry-01.webp", alt: "Exhibition Floorplan — banner photo"},
  {key: "page-hero.1", kind: "text", tag: "h1", mode: "plain", text: "Exhibition Floorplan"},
  {key: "page-hero.2", kind: "text", tag: "p", mode: "plain", text: "Explore the published booth map. Choosing an available booth starts a request in your account; it does not reserve the space."}]}};
