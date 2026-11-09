import type {ReactNode} from "react";
import CmsShell from "./components/CmsShell";
import "./cms-design.css";
import "./cms-refresh.css";
import "./cms-2027.css";

export default function AdminLayout({children}:{children:ReactNode}){
  return <CmsShell>{children}</CmsShell>;
}
