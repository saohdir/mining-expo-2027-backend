import {z} from "zod";
export const KINDS = ["PARTNER", "ORGANIZER", "DOWNLOAD", "NEWS", "SCOPE", "CONTACT", "PAGE_BLOCK", "GALLERY"] as const;
const safeUrl = z.string().max(500).refine(v => /^\/[A-Za-z0-9/_\-.%]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), "Use a site path or https URL");
/** FR-034/035/037/038 content item; rights metadata required before publishing media (NFR-12). */
export const contentInput = z.object({
  kind: z.enum(KINDS), locale: z.enum(["en", "id"]).default("en"), title: z.string().trim().min(2).max(200), slug: z.string().regex(/^[a-z0-9-]{2,80}$/),
  summary: z.string().max(500).nullable().optional(), body: z.string().max(20000).nullable().optional(), url: safeUrl.nullable().optional(),
  fileType: z.string().max(20).nullable().optional(), fileSizeBytes: z.number().int().min(0).max(500_000_000).nullable().optional(),
  imageUrl: safeUrl.nullable().optional(), altText: z.string().max(300).nullable().optional(),
  rightsStatus: z.enum(["OWNED", "LICENSED", "ORGANIZER_PROVIDED", "PENDING_APPROVAL"]).nullable().optional(), role: z.string().max(80).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
}).strict();
export function publishProblems(c: {kind: string; imageUrl?: string | null; altText?: string | null; rightsStatus?: string | null; url?: string | null; fileType?: string | null}) {
  const p: string[] = [];
  if (c.imageUrl && (!c.altText || !c.rightsStatus || c.rightsStatus === "PENDING_APPROVAL")) p.push("Images need alt text and an approved rights status");
  if (c.kind === "DOWNLOAD" && (!c.url || !c.fileType)) p.push("Downloads need a file URL and type");
  return p;
}
