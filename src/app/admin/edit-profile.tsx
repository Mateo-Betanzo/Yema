import { EditProfileForm } from "@/components/edit-profile-form";
import { useSession } from "@/lib/session";
import { validateAdminProfile } from "@/logic/auth-validation";

// "Editar perfil" of the admin (spec 011: RF-16 to RF-20), opened from the menu of the Perfil: the
// client's form with the admin rules (the phone, the address and the notes are optional; empty is null).
export default function EditProfile() {
  const { profile } = useSession();
  // Inside the admin group the session always has a profile.
  if (!profile) return null;
  return <EditProfileForm profile={profile} validate={validateAdminProfile} />;
}
