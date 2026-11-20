import { router } from "expo-router";

import { ProfileView } from "@/components/profile-view";
import { useSession } from "@/lib/session";

// Perfil of the admin (spec 002: RF-29). Since spec 011 (RF-1), the same as the client's: a menu button
// that opens Tipos y formatos, the delivery schedule, the stock history, "Editar perfil" and "Cerrar
// sesión". Inside this group the session always has a profile.
export default function Profile() {
  const { profile, email } = useSession();
  if (!profile) return null;
  return <ProfileView profile={profile} email={email} onMenu={() => router.push("/admin/menu")} />;
}
