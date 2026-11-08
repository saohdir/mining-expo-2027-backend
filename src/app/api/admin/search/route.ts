import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {admin} from "@/lib/auth";
import {failure} from "@/lib/errors";

/** Search is scoped by role on the server and returns only a small amount of
 * data from collections already visible to that role. No results for CHECKIN/VIEWER.
 */
export async function GET(req:NextRequest){
  try{
    const actor=await admin();
    const q=(req.nextUrl.searchParams.get("q")||"").trim().slice(0,100);
    if(q.length<2)return NextResponse.json({results:[]},{headers:{"Cache-Control":"private,no-store"}});
    const results:{type:string;label:string;hint:string;href:string}[]=[];
    const people=["SUPER_ADMIN","SALES","FINANCE","OPERATIONS"].includes(actor.role);
    const finance=["SUPER_ADMIN","SALES","FINANCE"].includes(actor.role);
    if(people){
      const [accounts,registrations,booths]=await Promise.all([
        db.customerAccount.findMany({
          where:{OR:[{email:{contains:q,mode:"insensitive"}},{profile:{fullName:{contains:q,mode:"insensitive"}}}]},
          select:{id:true,email:true,profile:{select:{fullName:true}}},
          take:4
        }),
        db.enrollment.findMany({
          where:{OR:[{id:{startsWith:q,mode:"insensitive"}},{account:{email:{contains:q,mode:"insensitive"}}},{account:{profile:{fullName:{contains:q,mode:"insensitive"}}}}]},
          select:{id:true,type:true,status:true,account:{select:{profile:{select:{fullName:true}}}}},
          take:4,orderBy:{createdAt:"desc"}
        }),
        db.boothRequest.findMany({
          where:{OR:[{id:{startsWith:q,mode:"insensitive"}},{account:{email:{contains:q,mode:"insensitive"}}},{account:{profile:{fullName:{contains:q,mode:"insensitive"}}}}]},
          select:{id:true,status:true,account:{select:{profile:{select:{fullName:true}}}}},
          take:4,orderBy:{createdAt:"desc"}
        })
      ]);
      for(const a of accounts)results.push({type:"Account",label:a.profile?.fullName||a.email||"Account",
        hint:"Customer account · "+a.id.slice(0,8),href:"/admin/registrations?q="+encodeURIComponent(q)});
      for(const r of registrations)results.push({type:"Registration",label:r.account.profile?.fullName||r.id.slice(0,8),
        hint:r.type+" · "+r.status+" · "+r.id.slice(0,8),href:"/admin/registrations?q="+encodeURIComponent(q)});
      for(const b of booths)results.push({type:"Booth request",label:b.account.profile?.fullName||b.id.slice(0,8),
        hint:b.status+" · "+b.id.slice(0,8),href:"/admin/booths?request="+encodeURIComponent(b.id)});
    }
    if(finance){
      const invoices=await db.invoice.findMany({
        where:{OR:[{number:{contains:q,mode:"insensitive"}},{account:{email:{contains:q,mode:"insensitive"}}}]},
        select:{id:true,number:true,status:true},take:4,orderBy:{createdAt:"desc"}
      });
      for(const i of invoices)results.push({type:"Invoice",label:i.number,
        hint:"Invoice · "+i.status,href:"/admin/payments?invoice="+encodeURIComponent(i.number)});
    }
    return NextResponse.json({results:results.slice(0,15)}, {headers:{"Cache-Control":"private,no-store"}});
  }catch(e){return failure(e)}
}
