import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({service:"imdx-platform",state:"development",payments:"MANUAL_TRANSFER_ONLY",registrationEnabled:process.env.ENABLE_REGISTRATION==="true",admissionEnabled:process.env.ENABLE_QR_ADMISSION==="true"},{headers:{"Cache-Control":"no-store"}});}
