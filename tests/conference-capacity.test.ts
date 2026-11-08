import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ACTIVE_CONFERENCE_STATUSES, conferenceAvailability} from "../src/lib/conference-capacity";

test("active conference bookings include submitted/review/confirmed, not cancelled/rejected", () => {
  assert.deepEqual(ACTIVE_CONFERENCE_STATUSES, [
    "SUBMITTED", "PENDING_REVIEW", "CONFIRMED"
  ]);
  assert.ok(!ACTIVE_CONFERENCE_STATUSES.includes("CANCELLED" as never));
  assert.ok(!ACTIVE_CONFERENCE_STATUSES.includes("REJECTED" as never));
});

test("capacity and approved fee are mandatory before accepting seats", () => {
  assert.deepEqual(conferenceAvailability(null, 0, 0n),
    {registrationState: "NOT_READY", remainingSeats: null});
  assert.deepEqual(conferenceAvailability(20, 0, null),
    {registrationState: "NOT_READY", remainingSeats: 20});
  assert.deepEqual(conferenceAvailability(20, 7, 0n),
    {registrationState: "AVAILABLE", remainingSeats: 13});
  assert.deepEqual(conferenceAvailability(20, 7, 500000n),
    {registrationState: "AVAILABLE", remainingSeats: 13});
});

test("last seat and overbooked legacy state report FULL, never negative remaining seats", () => {
  assert.deepEqual(conferenceAvailability(1, 0, 0n),
    {registrationState: "AVAILABLE", remainingSeats: 1});
  assert.deepEqual(conferenceAvailability(1, 1, 0n),
    {registrationState: "FULL", remainingSeats: 0});
  assert.deepEqual(conferenceAvailability(1, 2, 0n),
    {registrationState: "FULL", remainingSeats: 0});
});

test("reject impossible capacity and count inputs", () => {
  assert.throws(() => conferenceAvailability(0, 0, 0n));
  assert.throws(() => conferenceAvailability(-1, 0, 0n));
  assert.throws(() => conferenceAvailability(10, -1, 0n));
  assert.throws(() => conferenceAvailability(10, 0.5, 0n));
});

test("conference API rechecks capacity/duplicates within a serializable database transaction", () => {
  const route = readFileSync("src/app/api/customer/registrations/route.ts", "utf8");
  assert.match(route, /Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(route, /tx\.enrollment\.count\(/);
  assert.match(route, /tx\.enrollment\.findFirst\(/);
  assert.match(route, /tx\.enrollment\.create\(/);
  assert.match(route, /CONFERENCE_FULL/);
  assert.match(route, /CONFERENCE_NOT_READY/);
  assert.match(route, /P2034/);
});

test("CMS cannot reduce capacity under active seats and free conferences cannot request invoices", () => {
  const cms = readFileSync("src/app/api/admin/conferences/[id]/route.ts", "utf8");
  const invoice = readFileSync("src/app/api/customer/manual-payment-request/route.ts", "utf8");
  const publicEvents = readFileSync("src/app/api/public/events/route.ts", "utf8");
  assert.match(cms, /CAPACITY_BELOW_BOOKINGS/);
  assert.match(cms, /Serializable/);
  assert.match(invoice, /FREE_CONFERENCE/);
  assert.match(invoice, /PAYMENT_REQUEST_EXISTS/);
  assert.match(publicEvents, /conferenceAvailability/);
});
