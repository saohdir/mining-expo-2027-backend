import { HttpError } from "./errors";
export const policies={
 registration:()=>process.env.ENABLE_REGISTRATION==="true",
 invoices:()=>process.env.ENABLE_INVOICES==="true",
 admission:()=>process.env.ENABLE_QR_ADMISSION==="true",
 exhibitorStaff:()=>process.env.ENABLE_EXHIBITOR_STAFF==="true",
 groupEnrollment:()=>process.env.ENABLE_GROUP_ENROLLMENT==="true"
};
export function requireEnabled(name:keyof typeof policies){if(!policies[name]())throw new HttpError(503,"NOT_ENABLED",name+" requires organizer approval and server configuration.");}
export function bankDetails(){const name=process.env.APPROVED_BANK_NAME,owner=process.env.APPROVED_BANK_ACCOUNT_NAME,number=process.env.APPROVED_BANK_ACCOUNT_NUMBER;if(!name||!owner||!number)throw new HttpError(503,"BANK_NOT_APPROVED","Bank transfer instructions are not configured.");return {name,owner,number};}
export type Receipt={amountMinor:bigint,status:string};
export function financeTotals(invoiceTotal:bigint,transfers:Receipt[],reversals:bigint[]=[]) {
 if(invoiceTotal<0n)throw new Error("Negative invoice");
 const paid=transfers.filter(x=>x.status==="VERIFIED").reduce((a,b)=>a+b.amountMinor,0n)-reversals.reduce((a,b)=>a+b,0n);
 if(paid<0n)throw new Error("Negative net receipts");
 return {paidMinor:paid.toString(),outstandingMinor:(invoiceTotal>paid?invoiceTotal-paid:0n).toString(),state:paid===0n?"AWAITING_PAYMENT":paid>=invoiceTotal?"PAID_IN_FULL":"DP_RECEIVED",invoiceState:paid===0n?"SENT":paid>=invoiceTotal?"PAID":"PARTIALLY_PAID"};
}
export function isoWibDate(d:Date){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
export function safeCell(value:unknown){const text=String(value??"").replace(/[\x00-\x1F\x7F]/g," ");return /^[=+@\-]/.test(text)? "'"+text:text;}
