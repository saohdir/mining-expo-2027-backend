import {test} from "node:test";
import assert from "node:assert/strict";
import {compareProgrammes, paginate, publicFacts, publishProblems, itemInput} from "../src/lib/programme";

test("order: regular programmes first, legacy always last, then displayOrder, createdAt, id", () => {
  const t = (id: string, isLegacy: boolean, displayOrder: number, createdAt = "2026-11-01") => ({id, isLegacy, displayOrder, createdAt});
  const items = [t("l1", true, 0), t("r3", false, 3), t("r1", false, 1), t("l2", true, 1), t("r2b", false, 2, "2026-11-03"), t("r2a", false, 2, "2026-11-02")];
  assert.deepEqual(items.sort(compareProgrammes).map(i => i.id), ["r1", "r2a", "r2b", "r3", "l1", "l2"]);
});
test("pagination per three with clamping", () => {
  const pages = (n: number) => paginate(n, 1).pages;
  assert.deepEqual([0, 1, 3, 4, 6, 7, 9, 10].map(pages), [1, 1, 1, 2, 2, 3, 3, 4]);
  assert.equal(paginate(3, 1).showControls, false); assert.equal(paginate(4, 1).showControls, true);
  assert.equal(paginate(10, 999).page, 4); assert.equal(paginate(10, -2).page, 1); assert.equal(paginate(10, "abc").page, 1);
  const last = paginate(10, 4); assert.deepEqual([last.from, last.to], [9, 10]);
});
test("only organizer-confirmed facts are public", () => {
  const base = {eventDate: new Date("2027-05-26"), startTime: "09:00", endTime: "12:00", venue: "JIEXPO", feeLabel: "USD 800", currency: "USD", dateConfirmed: false, venueConfirmed: false, feeConfirmed: false};
  assert.deepEqual(publicFacts(base), {date: null, time: null, venue: null, fee: null});
  assert.deepEqual(publicFacts({...base, dateConfirmed: true, venueConfirmed: true}), {date: "2027-05-26", time: "09:00–12:00", venue: "JIEXPO", fee: null});
});
test("publish rules", () => {
  const en = {locale: "en", title: "T", summary: "Summary text", overview: "Overview", imageAlt: "alt"};
  assert.deepEqual(publishProblems({imageUrl: "/assets/x.webp", imageRightsStatus: "OWNED", sourceSystem: null, editorialStatus: "PENDING_REVIEW"}, [en]), []);
  assert.match(publishProblems({imageUrl: null, imageRightsStatus: null, sourceSystem: "ICEE", editorialStatus: "PENDING_REVIEW"}, [en]).join(), /editorial approval/);
  assert.match(publishProblems({imageUrl: "/a.webp", imageRightsStatus: "PENDING_APPROVAL", sourceSystem: null, editorialStatus: "APPROVED"}, [en]).join(), /rights/);
  assert.match(publishProblems({imageUrl: null, imageRightsStatus: null, sourceSystem: null, editorialStatus: "APPROVED"}, []).join(), /English/);
});
test("input validation: slug, URLs, no script schemes", () => {
  const ok = {slug: "green-mining", translations: {en: {title: "Green mining", summary: "A short summary", overview: "", highlights: []}}};
  assert.equal(itemInput.safeParse(ok).success, true);
  assert.equal(itemInput.safeParse({...ok, slug: "Green Mining"}).success, false);
  assert.equal(itemInput.safeParse({...ok, imageUrl: "javascript:alert(1)"}).success, false);
  assert.equal(itemInput.safeParse({...ok, sourceUrl: "http://example.com"}).success, false);
});
