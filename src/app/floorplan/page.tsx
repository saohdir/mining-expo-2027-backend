import type {Metadata} from "next";
import {FloorplanViewer} from "../components/FloorplanViewer";

export const metadata: Metadata = {
  title: "Exhibition floorplan | IMDX 2027",
  description: "Published booth map for the Indonesia Mining & Downstream Industries Exhibition 2027, JIEXPO Jakarta. Request a preferred booth area.",
  alternates: {canonical: "/floorplan"}
};
export default function PublicFloorplanPage() {
  return <main className="portal-shell">
    <header><p className="eyebrow">EXHIBIT AT IMDX 2027</p><h1>Exhibition <em>floorplan.</em></h1>
      <p>Explore the published booth map. Choosing an available booth starts a request in your account; it does not reserve the space.</p></header>
    <FloorplanViewer />
  </main>;
}
