import { EditProfileForm } from "@/components/edit-profile-form";
import { useSession } from "@/lib/session";
import { validateProfile } from "@/logic/auth-validation";

// "Editar perfil" of the client (spec 010: RF-23 to RF-28), opened from the menu of the Perfil: the
// shared form with the sign-up rules (phone and address required).
export default function EditProfile() {
  const { profile } = useSession();
  // Inside the client group the session always has a profile.
  if (!profile) return null;
  return <EditProfileForm profile={profile} validate={validateProfile} />;
}
