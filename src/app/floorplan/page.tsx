import type {Metadata} from "next";
import {FloorplanViewer} from "../components/FloorplanViewer";
import {PageHero} from "../components/PageHero";

export const metadata: Metadata = {
  title: "Exhibition floorplan | IMDX 2027",
  description: "Published booth map for the Indonesia Mining & Downstream Industries Exhibition 2027, JIEXPO Jakarta. Request a preferred booth area.",
  alternates: {canonical: "/floorplan"}
};
export default function PublicFloorplanPage() {
  return <>
    <PageHero pageKey="floorplan" crumb="Exhibition Floorplan" />
    <main className="portal-shell floorplan-page"><FloorplanViewer /></main>
  </>;
}
