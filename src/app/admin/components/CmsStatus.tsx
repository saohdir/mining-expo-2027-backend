import {CmsIcon} from "./CmsShell";

type Domain="Account"|"Registration"|"Booth request"|"Invoice"|"Payment"|"Receipt"|"Booth unit"|"Pass"|"Check-in";
type Tone="neutral"|"waiting"|"action"|"partial"|"positive"|"negative"|"negative-muted";
const tones:Record<string,Tone>={
  PENDING_VERIFICATION:"waiting", ACTIVE:"positive", SUSPENDED:"negative", CLOSED:"neutral",
  DRAFT:"neutral",SUBMITTED:"waiting",PENDING_REVIEW:"waiting",CONFIRMED:"positive",REJECTED:"negative",CANCELLED:"negative-muted",
  NEW:"action",UNDER_REVIEW:"action",OFFERED:"waiting",ACCEPTED:"action",WAITING_INVOICE:"action",
  INVOICED:"waiting",ALLOCATION_PENDING:"action",
  ISSUED:"waiting",SENT:"waiting",PARTIALLY_PAID:"partial",PAID:"positive",OVERDUE:"negative",VOID:"negative-muted",
  NOT_REQUIRED:"neutral",NOT_INVOICED:"neutral",AWAITING_PAYMENT:"waiting",DP_RECEIVED:"partial",
  PAID_IN_FULL:"positive",REFUND_PENDING:"action",REFUNDED:"neutral",
  SUBMITTED_PROOF:"action",PENDING_VERIFICATION_RECEIPT:"action",VERIFIED:"positive",
  AVAILABLE:"positive",RESERVED:"waiting",OCCUPIED:"positive",BLOCKED:"neutral",
  NOT_ISSUED:"neutral",REVOKED:"negative",EXPIRED:"negative",
  VALID_ACCEPTED:"positive",ALREADY_CHECKED_IN:"waiting",WRONG_ZONE:"waiting",NOT_YET_VALID:"waiting",
  UNPAID:"negative",INVALID:"negative",OFFLINE_ERROR:"neutral"
};
const labels:Record<string,string>={
  DP_RECEIVED:"DP received",PAID_IN_FULL:"Paid in full",ALLOCATION_PENDING:"Allocation pending",
  PENDING_VERIFICATION:"Pending verification",VALID_ACCEPTED:"Accepted",OFFLINE_ERROR:"Connection lost — no decision"
};
export default function CmsStatus({domain,value}:{domain:Domain;value:string|null|undefined}){
  const key=value||"NOT_ISSUED";
  const tone=tones[key]||"neutral";
  const symbol=tone==="positive"?"check":tone==="waiting"?"clock":tone==="negative"?"close":tone==="partial"?"clock":null;
  return <span className="imdx-cms-status-chip" data-tone={tone} title={domain+" status"}>
    {symbol&&<CmsIcon name={symbol} size={14}/>}
    {domain}: {labels[key]||key.toLowerCase().replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
  </span>;
}
