import { HttpError } from "./errors";
export const DECISIONS={autoAllocateBooth:false,paymentGateway:false,manualFinanceOnly:true,publicQrScanner:false} as const;
export function validateArea(value:number,min=1,max=10000){if(!Number.isFinite(value)||value<min||value>max||Math.round(value*10)!==value*10)throw new HttpError(400,"BAD_AREA","Booth area must be 0.1 precision within approved bounds.");return value;}
export function assertAvailable(status:string){if(status!=="AVAILABLE")throw new HttpError(409,"BOOTH_UNAVAILABLE","Selected unit is no longer available. Choose another preference.");}
export function assertInvoiceVerifiedByFinance(role:string){if(!["FINANCE","SUPER_ADMIN"].includes(role))throw new HttpError(403,"FINANCE_ONLY","Only finance staff can confirm a bank transfer.");}
export function assertPassWindow(now:Date,starts:Date,ends:Date){if(now<starts||now>ends)throw new HttpError(403,"WRONG_DATE","Pass is not valid on this date.");}
