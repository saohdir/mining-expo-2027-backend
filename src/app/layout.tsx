import "./globals.css";
import "./marketing-nav.css";
import type {ReactNode} from "react";
import MarketingNav from "./components/MarketingNav";

export const metadata = {
  title: "IMDX 2027 — UAT Platform",
  description: "IMDX 2027 customer and organizer UAT platform",
  robots: {index: false, follow: false},
  // Same IMDX favicon as the public website (served from /assets by nginx; public/assets in local/standalone runs).
  icons: {icon: [{url: "/assets/imd-favicon-orange.png", type: "image/png"}], shortcut: "/assets/imd-favicon-orange.png", apple: "/assets/imd-favicon-orange.png"}
};

export default function RootLayout({children}: {children: ReactNode}) {
  return <html lang="en">
    <body>
      <a className="imdx-skip-link" href="#main-content">Skip to content</a>
      <MarketingNav />
      <div id="main-content" tabIndex={-1}>{children}</div>
    </body>
  </html>;
}
