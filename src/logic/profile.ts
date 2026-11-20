// "Editar perfil" of the client (spec 010: RF-23, RF-27, RF-28). The rules of each field are the
// sign-up ones (validateProfile in auth-validation.ts); the base checks them again and normalizes.
import type { ProfileForm } from "./auth-validation";
import { isPostgresError } from "./catalog-errors";
import { NO_CONNECTION } from "./form-rules";

/** The editable columns of `profiles`; the admin may have no phone or address (spec 002, RF-37). */
export type EditableProfile = {
  first_name: string;
  last_name: string;
  phone: string | null;
  address: string | null;
  address_notes: string | null;
};

/** RF-23: the form loaded with the current data; what is missing is an empty field. */
export function profileToForm(profile: EditableProfile): ProfileForm {
  return {
    firstName: profile.first_name,
    lastName: profile.last_name,
    phone: profile.phone ?? "",
    address: profile.address ?? "",
    addressNotes: profile.address_notes ?? "",
  };
}

/**
 * RF-27: whether leaving would lose something the client typed. Compared as typed, without
 * normalizing: a space or a hyphen the client added is still a change of theirs.
 */
export function isProfileChanged(form: ProfileForm, profile: EditableProfile): boolean {
  const loaded = profileToForm(profile);
  return (Object.keys(loaded) as (keyof ProfileForm)[]).some((field) => form[field] !== loaded[field]);
}

/** RF-28: a request that never reached the server (empty code) is the connection; anything else, generic. */
export function profileSaveErrorMessage(error: unknown): string {
  if (isPostgresError(error) && error.code === "") return NO_CONNECTION;
  return "No pudimos guardar tus datos. Intentá de nuevo";
}
