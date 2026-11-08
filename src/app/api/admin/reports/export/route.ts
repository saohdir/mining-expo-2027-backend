import {NextRequest,NextResponse} from "next/server";
import ExcelJS from "exceljs";
import {PDFDocument,StandardFonts,rgb} from "pdf-lib";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure,HttpError} from "@/lib/errors";
import {safeCell} from "@/lib/policy";
import {Prisma} from "@prisma/client";
export const runtime="nodejs";
const TYPES=["VISITOR","CONFERENCE","EXHIBITOR"] as const;
const STATUSES=["DRAFT","SUBMITTED","PENDING_REVIEW","CONFIRMED","REJECTED","CANCELLED"] as const;
function parseDate(v:string|null,final:boolean){if(!v)return; if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||Number.isNaN(Date.parse(v)))throw new HttpError(400,"BAD_DATE","Dates must use YYYY-MM-DD WIB.");return new Date(Date.parse(v+"T00:00:00+07:00")+(final?86400000:0));}
export async function GET(req:NextRequest){try{
 const actor=await admin(["SUPER_ADMIN","FINANCE","OPERATIONS","SALES"]);
 const p=req.nextUrl.searchParams,from=parseDate(p.get("from"),false),to=parseDate(p.get("to"),true),type=p.get("type"),status=p.get("status"),q=p.get("q")?.trim().slice(0,120),fmt=p.get("format")||"xlsx";
 if(!["xlsx","pdf"].includes(fmt))throw new HttpError(400,"BAD_FORMAT","Supported formats: xlsx, pdf.");
 if(type&&!TYPES.includes(type as typeof TYPES[number]))throw new HttpError(400,"BAD_TYPE","Unsupported type.");
 if(status&&!STATUSES.includes(status as typeof STATUSES[number]))throw new HttpError(400,"BAD_STATUS","Unsupported registration status.");
 if(from&&to&&from>=to)throw new HttpError(400,"BAD_RANGE","End date must follow start date.");
 if(from&&to&&(+to- +from)>366*86400000)throw new HttpError(400,"RANGE_TOO_LARGE","Maximum report period is 366 days.");
 const where:Prisma.EnrollmentWhereInput={
 ...(type?{type:type as typeof TYPES[number]}:{}),
 ...(status?{status:status as typeof STATUSES[number]}:{}),
 ...(from||to?{createdAt:{...(from?{gte:from}:{}),...(to?{lt:to}:{})}}:{}),
 ...(q?{OR:[{id:{startsWith:q,mode:"insensitive"}},{account:{email:{contains:q,mode:"insensitive"}}},{account:{profile:{fullName:{contains:q,mode:"insensitive"}}}}]}:{})
 };
 const limit=2000;const count=await db.enrollment.count({where});
 if(count>limit)throw new HttpError(413,"EXPORT_TOO_LARGE","More than 2,000 records: narrow the period or request an asynchronous export.");
 const rec=await db.enrollment.findMany({where,orderBy:{createdAt:"desc"},
 include:{account:{select:{email:true,phone:true,profile:{select:{fullName:true,organization:true}}}},conference:{select:{title:true}}}});
 const rows=rec.map(x=>[x.id,x.type,x.status,x.account.profile?.fullName||"",x.account.email||"",x.account.profile?.organization||"",x.conference?.title||"",x.createdAt.toISOString(),x.confirmedAt?.toISOString()||""]);
 const columns=["Registration ID","Type","Status","Customer","Email","Organization","Conference","Created UTC","Confirmed UTC"];
 const job=await db.exportJob.create({data:{adminId:actor.id,reportType:"REGISTRATIONS",filters:{type,status,q,from:p.get("from"),to:p.get("to")},format:fmt,state:"COMPLETED",rowCount:rows.length,expiresAt:new Date(Date.now()+3600000)}});
 await db.auditLog.create({data:{adminId:actor.id,action:"REPORT_EXPORTED",resourceType:"ExportJob",resourceId:job.id,afterState:{format:fmt,rows:rows.length}}});
 if(fmt==="xlsx"){const wb=new ExcelJS.Workbook();const ws=wb.addWorksheet("Registrations");ws.addRow(columns);
 for(const row of rows)ws.addRow(row.map(safeCell));ws.getRow(1).font={bold:true};ws.columns.forEach(c=>c.width=25);ws.views=[{state:"frozen",ySplit:1}];
 const data=await wb.xlsx.writeBuffer();return new NextResponse(new Uint8Array(data),{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":'attachment; filename="imdx-registrations.xlsx"',"Cache-Control":"private,no-store"}});
 }
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 let page=pdf.addPage([842,595]),y=565;
 const line=(s:string,size=9)=>{if(y<30){page=pdf.addPage([842,595]);y=565;}page.drawText(s.replace(/[^\x20-\x7E]/g,"?").slice(0,140),{x:35,y,size,font,color:rgb(.2,.16,.13)});y-=size+7;};
 line("IMDX 2027 - Registrations / All timestamps UTC",16);line("Period (WIB): "+(p.get("from")||"all")+" to "+(p.get("to")||"all")+"; Type: "+(type||"all")+"; Status: "+(status||"all"),10);
 for(const x of rows)line([x[7]?.slice(0,10),x[1],x[2],x[3],x[4]].join(" | "));
 return new NextResponse(new Uint8Array(await pdf.save()),{headers:{"Content-Type":"application/pdf","Content-Disposition":'attachment; filename="imdx-registrations.pdf"',"Cache-Control":"private,no-store"}});
 }catch(e){return failure(e)}}
