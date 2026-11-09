import type {ReactNode} from "react";
import "./account-refresh.css";

export default function AccountLayout({children}: {children: ReactNode}) {
  return <div className="account-app">{children}</div>;
}
