import {NextRequest, NextResponse} from "next/server";
import {activeEventCode} from "@/lib/active-event";
import {z} from "zod";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {hashToken} from "@/lib/security";
import {isShortCode, shortCodeHash} from "@/lib/pass-code";
import {isoWibDate, requireEnabled} from "@/lib/policy";
import {failure, HttpError} from "@/lib/errors";

const input = z.object({
  token: z.string().min(10).max(300),
  gate: z.string().min(1).max(60),
  zone: z.string().min(1).max(60).default("EXPO_ENTRY"),
  method: z.enum(["CAMERA", "MANUAL"]).default("CAMERA"),
  eventCode: z.string().max(40).default(activeEventCode)
}).strict();
type Result = "VALID_ACCEPTED" | "ALREADY_CHECKED_IN" | "WRONG_ZONE" | "NOT_YET_VALID" | "EXPIRED" | "REVOKED" | "UNPAID" | "INVALID";
const GUESS_WINDOW_MS = 10 * 60 * 1000, GUESS_LIMIT = 15;
const json = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "private,no-store"}});

/** CMS-only admission decision (FR-081..089, FR-135/136). Gate/zone authorization is enforced
 * server-side; CHECKIN_STAFF only at assigned gates. Re-entry follows AdmissionPolicy. */
export async function POST(req: NextRequest) {
  try {
    requireEnabled("admission");
    const operator = await admin(["CHECKIN_STAFF", "OPERATIONS", "SUPER_ADMIN"]);
    const data = input.parse(await req.json());
    const event = await db.event.findUnique({where: {code: data.eventCode}});
    if (!event) throw new HttpError(404, "EVENT_NOT_FOUND", "Event not found.");
    const gate = await db.gate.findUnique({where: {eventId_code: {eventId: event.id, code: data.gate}}, include: {staff: {where: {adminId: operator.id}}}});
    const deny = async (code: string, message: string) => {
      await db.auditLog.create({data: {adminId: operator.id, action: "SCAN_GATE_DENIED", resourceType: "Gate", resourceId: gate?.id || data.gate, afterState: {code, zone: data.zone}}});
      throw new HttpError(403, code, message);
    };
    if (!gate || !gate.active) await deny("GATE_NOT_ALLOWED", "This gate is not configured or inactive.");
    if (!gate!.zones.includes(data.zone)) await deny("ZONE_NOT_ALLOWED", "This zone is not served by the selected gate.");
    if (operator.role === "CHECKIN_STAFF" && gate!.staff.length === 0) await deny("GATE_NOT_ASSIGNED", "You are not assigned to this gate.");
    const recentInvalid = await db.passScan.count({where: {scannedBy: operator.id, result: "INVALID", createdAt: {gte: new Date(Date.now() - GUESS_WINDOW_MS)}}});
    if (recentInvalid >= GUESS_LIMIT) throw new HttpError(429, "SCAN_RATE_LIMIT", "Too many invalid codes. Wait a few minutes or contact Operations.");

    const raw = data.token.trim();
    const pass = await db.eventPass.findUnique({where: isShortCode(raw) ? {shortCodeHash: shortCodeHash(raw)} : {tokenHash: hashToken(raw)}, include: {enrollment: true, account: {include: {profile: true}}, event: true}});
    if (!pass || pass.eventId !== event.id) {
      await db.passScan.create({data: {passId: null, gate: data.gate, zone: data.zone, result: "INVALID", scannedBy: operator.id, method: data.method}});
      return json({result: "INVALID", admitted: false, message: "Invalid QR code."}, 422);
    }
    let result: Result = "VALID_ACCEPTED";
    const now = new Date();
    if (pass.status === "REVOKED") result = "REVOKED";
    else if (pass.status === "EXPIRED" || now > pass.expiresAt) result = "EXPIRED";
    else if (now < pass.event.startsAt) result = "NOT_YET_VALID";
    else if (pass.entitlement !== data.zone && pass.entitlement !== "ALL_ACCESS") result = "WRONG_ZONE";
    else if (pass.enrollment.status !== "CONFIRMED") result = pass.enrollment.status === "CANCELLED" || pass.enrollment.status === "REJECTED" ? "REVOKED" : "UNPAID";
    else {
      const snap = pass.enrollment.profileSnapshot as {fullName?: string};
      const current = pass.account.profile?.fullName.trim().toLocaleLowerCase("en-US");
      if (!current || current !== snap?.fullName?.trim().toLocaleLowerCase("en-US")) result = "REVOKED";
    }
    let reentry = false;
    if (result === "VALID_ACCEPTED") {
      const dayKey = isoWibDate(now);
      const policy = await db.admissionPolicy.findUnique({where: {eventId_zone: {eventId: event.id, zone: data.zone}}});
      try {
        await db.$transaction(async tx => {
          // A reissued pass must not grant a second same-day entry for the same registration.
          const earlier = await tx.admission.findFirst({where: {zone: data.zone, dayKey, passId: {not: pass.id}, pass: {enrollmentId: pass.enrollmentId}}, select: {id: true}});
          if (earlier) throw Object.assign(new Error("already admitted"), {code: "P2002"});
          await tx.admission.create({data: {passId: pass.id, zone: data.zone, dayKey, gate: data.gate, admittedBy: operator.id}});
          await tx.passScan.create({data: {passId: pass.id, gate: data.gate, zone: data.zone, scannedBy: operator.id, result: "VALID_ACCEPTED", method: data.method}});
        }, {isolationLevel: "Serializable"});
      } catch (e) {
        const dup = typeof e === "object" && e !== null && "code" in e && ["P2002", "P2034"].includes(String((e as {code?: unknown}).code));
        if (!dup) throw e;
        if (policy?.reentry === "ALLOW_REENTRY") {
          reentry = true;
          await db.passScan.create({data: {passId: pass.id, gate: data.gate, zone: data.zone, scannedBy: operator.id, result: "VALID_ACCEPTED", method: data.method}});
        } else result = "ALREADY_CHECKED_IN";
      }
    }
    if (result !== "VALID_ACCEPTED") await db.passScan.create({data: {passId: pass.id, gate: data.gate, zone: data.zone, result, scannedBy: operator.id, method: data.method}});
    const accepted = result === "VALID_ACCEPTED";
    return json({result, admitted: accepted, reentry,
      person: accepted ? {uniqueId: pass.account.id, name: pass.account.profile?.fullName, organization: pass.account.profile?.organization, access: pass.entitlement} : undefined,
      message: accepted ? (reentry ? "Re-entry permitted by zone policy." : "Admission confirmed.") : result === "ALREADY_CHECKED_IN" ? "Already checked in for this zone/day." : "Access denied: " + result},
      accepted ? 200 : 422);
  } catch (e) { return failure(e); }
}
