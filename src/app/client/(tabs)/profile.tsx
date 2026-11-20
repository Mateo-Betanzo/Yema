import { router } from "expo-router";

import { ProfileView } from "@/components/profile-view";
import { useSession } from "@/lib/session";

// Perfil of the client (spec 002: RF-29). Since spec 010 (RF-16), "Cerrar sesión" moved to the menu,
// with the history and "Editar perfil". Inside this group the session always has a profile.
export default function Profile() {
  const { profile, email } = useSession();
  if (!profile) return null;
  return <ProfileView profile={profile} email={email} onMenu={() => router.push("/client/menu")} />;
}
