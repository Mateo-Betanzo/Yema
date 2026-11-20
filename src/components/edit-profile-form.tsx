import { router, usePreventRemove } from "expo-router";
import { useRef, useState } from "react";
import { AccessibilityInfo, Alert, type TextInputInstance } from "react-native";

import { PageScreen } from "@/components/page-screen";
import { PrimaryButton } from "@/components/primary-button";
import { PROFILE_CONTACT_FIELDS, PROFILE_NAME_FIELDS } from "@/components/profile-fields";
import { TextField } from "@/components/text-field";
import { useUpdateProfile } from "@/lib/profile";
import type { Profile } from "@/lib/session";
import type { ProfileForm, Validation } from "@/logic/auth-validation";
import { isProfileChanged, profileSaveErrorMessage, profileToForm, type EditableProfile } from "@/logic/profile";

type Field = keyof ProfileForm;

const FIELDS = [...PROFILE_NAME_FIELDS, ...PROFILE_CONTACT_FIELDS];

type Props = {
  profile: Profile;
  /** The rules of the role: validateProfile for a client, validateAdminProfile for the admin (spec 011). */
  validate: (form: ProfileForm) => Validation<ProfileForm, EditableProfile>;
};

// "Editar perfil" of both roles (spec 010: RF-23 to RF-28; spec 011: RF-16 to RF-20), opened from the
// menu of the Perfil. No Figma: the fields of the sign-up, loaded with the current data, without the
// email, and "Guardar". Each role passes its rules (the messages are the sign-up ones); the base checks
// them again and normalizes (useUpdateProfile), and the saved profile goes to the session, so the Perfil
// (and, for a client, the greeting of the Home and the checkout) shows it. Orders already confirmed keep
// the address they copied (in the base). Leaving with changes asks first, with usePreventRemove as the
// counter sale (spec 008).
export function EditProfileForm({ profile, validate }: Props) {
  const update = useUpdateProfile();
  const [form, setForm] = useState<ProfileForm>(() => profileToForm(profile));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saving, setSaving] = useState(false);
  // A ref, because two taps in a row arrive before the disabled state renders.
  const savingRef = useRef(false);
  const inputs = useRef<Partial<Record<Field, TextInputInstance | null>>>({});

  // With something typed that is not saved, leaving asks; "Descartar" lets the blocked way out go on.
  const disablePrevention = usePreventRemove(isProfileChanged(form, profile), ({ repeat }) => {
    Alert.alert("¿Descartar los cambios?", undefined, [
      { text: "Seguir editando", style: "cancel" },
      { text: "Descartar", style: "destructive", onPress: repeat },
    ]);
  });

  function change(field: Field, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function save() {
    if (savingRef.current) return;
    const result = validate(form);
    if (!result.ok) {
      // What was typed stays; each field shows its own message.
      setErrors(result.errors);
      AccessibilityInfo.announceForAccessibility("Revisá los campos marcados");
      return;
    }

    setErrors({});
    savingRef.current = true;
    setSaving(true);
    try {
      await update.mutateAsync(result.data);
      // Saved, nothing is left to discard: back to the Perfil without asking.
      disablePrevention();
      router.back();
    } catch (error) {
      // What was typed stays, so the user can try again.
      Alert.alert(profileSaveErrorMessage(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <PageScreen title="Editar perfil">
      {FIELDS.map(({ field, label, placeholder, input }, index) => {
        const next = FIELDS[index + 1]?.field;
        return (
          <TextField
            key={field}
            ref={(instance) => {
              inputs.current[field] = instance;
            }}
            label={label}
            placeholder={placeholder}
            value={form[field]}
            onChangeText={(value) => change(field, value)}
            error={errors[field]}
            {...input}
            returnKeyType={next ? "next" : "done"}
            submitBehavior={next ? "submit" : "blurAndSubmit"}
            onSubmitEditing={next ? () => inputs.current[next]?.focus() : undefined}
          />
        );
      })}
      <PrimaryButton title="Guardar" onPress={save} loading={saving} />
    </PageScreen>
  );
}
