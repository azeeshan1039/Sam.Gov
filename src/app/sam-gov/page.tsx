import { redirect } from "next/navigation";

export default function SamGovCatalogRedirect() {
  redirect("/opportunities?view=all");
}
