import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {comparePasses, passFileName, passNaming} from "../src/lib/pass-label";

const read = (path: string) => readFileSync(path, "utf8");

test("passes are named after what they are for, not the gate zone code", () => {
  assert.deepEqual(passNaming("EXPO_ENTRY"), {kind: "EXHIBITION", label: "Exhibition entry", startsAt: null});
  const at = new Date("2027-05-27T11:30:00Z");
  assert.deepEqual(passNaming("CONF_NETWORK", {title: "2027 Indonesia Mining Industry Networking Reception", startsAt: at}),
    {kind: "CONFERENCE", label: "2027 Indonesia Mining Industry Networking Reception", startsAt: at});
  assert.equal(passNaming("CONFERENCE", null).label, "Conference programme");     // shared zone, programme missing
  assert.equal(passFileName("2027 China–Indonesia Coal & Energy Conference — Main Forum"), "imdx-pass-2027-china-indonesia-coal-energy-conference-main-forum.png");
  assert.equal(passFileName("???"), "imdx-pass-qr.png");
});

test("exhibition pass first, then conference passes by date", () => {
  const list = [passNaming("CONF_NETWORK", {title: "Networking Reception", startsAt: new Date("2027-05-27T11:30:00Z")}),
    passNaming("CONF_GREEN", {title: "Green Mining Conference", startsAt: new Date("2027-05-26T06:00:00Z")}), passNaming("EXPO_ENTRY")];
  assert.deepEqual(list.sort(comparePasses).map(p => p.label), ["Exhibition entry", "Green Mining Conference", "Networking Reception"]);
});

test("My pass shows the full name and prints one pass at a time", () => {
  const card = read("src/app/account/PassCard.tsx"), page = read("src/app/account/page.tsx"), css = read("src/app/globals.css");
  assert.match(page, /<PassCard key=\{p\.passId\} p=\{p\}\/>/);
  assert.doesNotMatch(page, /Private pass · \{p\.entitlement\}/);
  assert.match(card, /className="pass-title">\{label\}/);
  assert.match(card, /print-one-pass/);
  assert.match(css, /\.print-one-pass \.printable-pass:not\(\.print-target\)/);
  assert.match(read("src/app/api/customer/passes/route.ts"), /conference: \{select: \{title: true, startsAt: true\}\}/);
});
