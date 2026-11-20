// Saving the profile of "Editar perfil" (spec 010: RF-25, RF-28). The base decides: the permissions
// of profiles let a user update only these five columns of their own row (never the role), and the
// normalize_profile trigger trims the texts and keeps the 10 digits of the phone (spec 002). The row
// it returns goes to the session. Spec 011: the admin may save an empty contact (null), which the
// base accepts only for the admin (profiles_client_contact).
import { useMutation } from "@tanstack/react-query";

import type { EditableProfile } from "@/logic/profile";

import { useSession } from "./session";
import { supabase } from "./supabase";

export function useUpdateProfile() {
  const { profile, setProfile } = useSession();
  return useMutation({
    mutationFn: async (data: EditableProfile) => {
      if (!profile) throw new Error("useUpdateProfile needs a session with a profile");
      const { data: saved, error } = await supabase.from("profiles").update(data).eq("id", profile.id).select().single();
      if (error) throw error;
      return saved;
    },
    onSuccess: (saved) => setProfile(saved),
  });
}
