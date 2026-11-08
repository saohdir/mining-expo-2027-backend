import type {ReactNode} from "react";
import CmsShell from "./components/CmsShell";
import "./cms-design.css";

export default function AdminLayout({children}:{children:ReactNode}){
  return <CmsShell>{children}</CmsShell>;
}
