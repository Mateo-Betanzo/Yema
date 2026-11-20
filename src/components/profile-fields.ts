import type { TextInputProps } from "react-native";

import type { ProfileForm } from "@/logic/auth-validation";

export type ProfileFieldConfig = { field: keyof ProfileForm; label: string; placeholder: string; input: TextInputProps };

// The fields of the profile, in the order the keyboard's "next" key walks them: the same label (read by
// the screen reader), placeholder, keyboard and autofill in the sign-up (spec 002) and in "Editar perfil"
// (spec 010, RF-23).
export const PROFILE_NAME_FIELDS: ProfileFieldConfig[] = [
  {
    field: "firstName",
    label: "Nombre",
    placeholder: "Tu nombre",
    input: { autoComplete: "given-name", textContentType: "givenName", autoCapitalize: "words" },
  },
  {
    field: "lastName",
    label: "Apellido",
    placeholder: "Tu apellido",
    input: { autoComplete: "family-name", textContentType: "familyName", autoCapitalize: "words" },
  },
];

export const PROFILE_CONTACT_FIELDS: ProfileFieldConfig[] = [
  {
    field: "phone",
    label: "Teléfono",
    placeholder: "Tel: (11 3344 5566)",
    input: { keyboardType: "phone-pad", autoComplete: "tel", textContentType: "telephoneNumber" },
  },
  {
    field: "address",
    label: "Dirección",
    placeholder: "Calle, número, piso y barrio",
    input: { autoComplete: "street-address", textContentType: "fullStreetAddress" },
  },
  {
    field: "addressNotes",
    label: "Referencias (opcional)",
    placeholder: "Timbre, portón, entre calles",
    input: {},
  },
];
