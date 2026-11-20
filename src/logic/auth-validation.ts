// Sign-up and login rules (spec 002, RF-5 to RF-11 and RF-13), and since the change of 2026-11-19 the
// code that arrives by email and the new password (RF-40, RF-53, RF-55). The database repeats the profile rules
// (RF-35) and the Auth server the password rules: these exist so the user sees each mistake under its
// field before sending anything.

import { characterCount, REQUIRED, tooLong, type Validation } from "./form-rules";
import type { EditableProfile } from "./profile";

export type SignUpForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  addressNotes: string;
  password: string;
  passwordConfirmation: string;
};

/** The fields of the profile a client fills in and edits (spec 010, RF-23). */
export type ProfileForm = Pick<SignUpForm, "firstName" | "lastName" | "phone" | "address" | "addressNotes">;

/** The profile with the column names of `profiles`, normalized as the base stores it. */
export type ProfileData = {
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  address_notes: string | null;
};

/** What signUp receives: the profile goes as user metadata, with the column names of `profiles`. */
export type SignUpData = {
  email: string;
  password: string;
  profile: ProfileData;
};

export type LoginForm = { email: string; password: string };
export type LoginData = LoginForm;

export type CodeForm = { code: string };
export type EmailForm = { email: string };
/** The second step of "Recuperar contraseña": the code and the new password (RF-54, RF-55). */
export type NewPasswordForm = { code: string; password: string; passwordConfirmation: string };
export type NewPasswordData = { code: string; password: string };

export type { Validation };

const EMAIL = "Ingresá un email válido, como nombre@ejemplo.com";
const PHONE = "Ingresá 10 dígitos con el código de área, sin 0 ni 15. Ej.: 11 3344 5566";
const PASSWORD = "Usá entre 8 y 72 caracteres, con al menos una letra y un número";
const MISMATCH = "Las contraseñas no coinciden";
const CODE = "Ingresá los 6 dígitos del código";

const NAME_MAX = 50;
const ADDRESS_MAX = 120;
const PASSWORD_MIN = 8;
// The Auth server (bcrypt) limits the password to 72 bytes, not characters: "ñ" takes two.
const PASSWORD_MAX_BYTES = 72;

/** RF-13: without surrounding spaces and in lowercase, as the Auth server stores it. */
export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** RF-8: without spaces or hyphens; anything else is left for isValidPhone to reject. */
export function normalizePhone(input: string): string {
  return input.replace(/[\s-]/g, "");
}

/** RF-7: 10 digits with the area code, without the leading 0 or the 15. */
export function isValidPhone(digits: string): boolean {
  return /^[1-9][0-9]{9}$/.test(digits);
}

/**
 * RF-9, exactly as the Auth server checks it (`letters_digits` in config.toml): at least 8 characters,
 * at most 72 bytes, at least one a–z or A–Z letter (accented letters and ñ do not count) and one digit.
 * Not trimmed.
 */
export function isValidPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN &&
    new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** RF-40: the 6 digits of the email (0 to 9 only), without surrounding spaces. */
export function isValidCode(code: string): boolean {
  return /^[0-9]{6}$/.test(code.trim());
}

/** RF-11, RF-13: the email normalized, or its message. */
function emailError(email: string): string | undefined {
  if (email === "") return REQUIRED;
  if (!isEmail(email)) return EMAIL;
  return undefined;
}

function codeError(code: string): string | undefined {
  if (code === "") return REQUIRED;
  if (!isValidCode(code)) return CODE;
  return undefined;
}

type PasswordFields = { password: string; passwordConfirmation: string };

/**
 * RF-9 and RF-10, shared by the sign-up and the new password (RF-55): blank counts as empty, but a
 * password is never trimmed.
 */
function passwordErrors(form: PasswordFields): Partial<Record<keyof PasswordFields, string>> {
  const errors: Partial<Record<keyof PasswordFields, string>> = {};
  if (form.password.trim() === "") errors.password = REQUIRED;
  else if (!isValidPassword(form.password)) errors.password = PASSWORD;

  if (form.passwordConfirmation.trim() === "") errors.passwordConfirmation = REQUIRED;
  else if (form.passwordConfirmation !== form.password) errors.passwordConfirmation = MISMATCH;
  return errors;
}

/** Drops the fields without a message, so an empty object means a valid form. */
function compact<Form>(errors: Partial<Record<keyof Form, string | undefined>>): Partial<Record<keyof Form, string>> {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message !== undefined)) as Partial<
    Record<keyof Form, string>
  >;
}

type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

/** The profile trimmed and the phone in its digits, before checking it. */
function trimProfile(form: ProfileForm) {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    phone: normalizePhone(form.phone),
    address: form.address.trim(),
    addressNotes: form.addressNotes.trim(),
  };
}

/**
 * The rules of each profile field (RF-5 to RF-8). `contactRequired`: the phone and the address are
 * required of a client (the base checks it with profiles_client_contact) and optional for the admin
 * (spec 011, RF-17); when they are filled in, the rules are the same.
 */
function profileErrors(profile: ReturnType<typeof trimProfile>, contactRequired: boolean): ProfileErrors {
  const errors: ProfileErrors = {};
  for (const [field, value, max, required] of [
    ["firstName", profile.firstName, NAME_MAX, true],
    ["lastName", profile.lastName, NAME_MAX, true],
    ["address", profile.address, ADDRESS_MAX, contactRequired],
    ["addressNotes", profile.addressNotes, ADDRESS_MAX, false],
  ] as const) {
    if (value === "") {
      if (required) errors[field] = REQUIRED;
    } else if (characterCount(value) > max) errors[field] = tooLong(max);
  }
  if (profile.phone === "") {
    if (contactRequired) errors.phone = REQUIRED;
  } else if (!isValidPhone(profile.phone)) errors.phone = PHONE;
  return errors;
}

/**
 * The profile rules of the sign-up (RF-5 to RF-8), also used to edit the profile (spec 010, RF-24):
 * the same limits and messages, and the data trimmed with the phone in its 10 digits.
 */
export function validateProfile(form: ProfileForm): Validation<ProfileForm, ProfileData> {
  const profile = trimProfile(form);
  const errors = profileErrors(profile, true);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      first_name: profile.firstName,
      last_name: profile.lastName,
      phone: profile.phone,
      address: profile.address,
      address_notes: profile.addressNotes === "" ? null : profile.addressNotes,
    },
  };
}

/**
 * "Editar perfil" of the admin (spec 011, RF-17, RF-18): the same rules, with the phone, the address
 * and the notes optional; an empty one (only spaces, or hyphens in the phone) is saved as null.
 */
export function validateAdminProfile(form: ProfileForm): Validation<ProfileForm, EditableProfile> {
  const profile = trimProfile(form);
  const errors = profileErrors(profile, false);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const orNull = (value: string) => (value === "" ? null : value);
  return {
    ok: true,
    data: {
      first_name: profile.firstName,
      last_name: profile.lastName,
      phone: orNull(profile.phone),
      address: orNull(profile.address),
      address_notes: orNull(profile.addressNotes),
    },
  };
}

export function validateSignUp(form: SignUpForm): Validation<SignUpForm, SignUpData> {
  const profile = validateProfile(form);
  const errors: Partial<Record<keyof SignUpForm, string>> = profile.ok ? {} : { ...profile.errors };
  const email = normalizeEmail(form.email);

  const emailMessage = emailError(email);
  if (emailMessage) errors.email = emailMessage;
  Object.assign(errors, passwordErrors(form));

  if (!profile.ok || Object.keys(errors).length > 0) return { ok: false, errors };

  return { ok: true, data: { email, password: form.password, profile: profile.data } };
}

/** Only checks that both fields are filled: a wrong password is the server's answer (RF-18). */
export function validateLogin(form: LoginForm): Validation<LoginForm, LoginData> {
  const errors: Partial<Record<keyof LoginForm, string>> = {};
  const email = normalizeEmail(form.email);

  if (email === "") errors.email = REQUIRED;
  if (form.password.trim() === "") errors.password = REQUIRED;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { email, password: form.password } };
}

/** "Confirmá tu email" (RF-40). */
export function validateCode(form: CodeForm): Validation<CodeForm, CodeForm> {
  const code = form.code.trim();
  const errors = compact<CodeForm>({ code: codeError(code) });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { code } };
}

/** First step of "Recuperar contraseña" (RF-53): the rule of RF-11. */
export function validateEmail(form: EmailForm): Validation<EmailForm, EmailForm> {
  const email = normalizeEmail(form.email);
  const errors = compact<EmailForm>({ email: emailError(email) });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { email } };
}

/** Second step of "Recuperar contraseña" (RF-55): the code and the rules of RF-9 and RF-10. */
export function validateNewPassword(form: NewPasswordForm): Validation<NewPasswordForm, NewPasswordData> {
  const code = form.code.trim();
  const errors = compact<NewPasswordForm>({ code: codeError(code), ...passwordErrors(form) });
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { code, password: form.password } };
}
