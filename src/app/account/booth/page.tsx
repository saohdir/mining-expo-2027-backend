import {redirect} from "next/navigation";
/** FR-060: dedicated exhibitor booth-request route (keeps the selected unit for AT-057). */
export default async function BoothRequestRoute({searchParams}: {searchParams: Promise<{unit?: string}>}) {
  const {unit} = await searchParams;
  redirect(unit && /^[0-9a-f-]{36}$/.test(unit) ? "/account?request=" + unit + "#booth" : "/account?tab=booth");
}
