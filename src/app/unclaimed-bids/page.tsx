import { redirect } from "next/navigation";

export default function UnclaimedBidsRedirect() {
  redirect("/opportunities");
}
