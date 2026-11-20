import { Redirect } from "expo-router";

import { useSession } from "@/lib/session";

// The anchor of the root stack: sends each session state to its place (RF-1, RF-17, RF-21, RF-31).
export default function Index() {
  const { status } = useSession();

  // Nothing while the session loads: the splash is still up.
  if (status === "loading") return null;
  if (status === "signed-out") return <Redirect href="/welcome" />;
  return <Redirect href={status === "admin" ? "/admin" : "/client"} />;
}
