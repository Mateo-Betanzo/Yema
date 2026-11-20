import {
  isValidCode,
  isValidPassword,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
  validateAdminProfile,
  validateCode,
  validateEmail,
  validateLogin,
  validateNewPassword,
  validateProfile,
  validateSignUp,
  type ProfileForm,
  type SignUpForm,
} from "@/logic/auth-validation";

const REQUIRED = "Completá este campo";
const EMAIL = "Ingresá un email válido, como nombre@ejemplo.com";
const PHONE = "Ingresá 10 dígitos con el código de área, sin 0 ni 15. Ej.: 11 3344 5566";
const PASSWORD = "Usá entre 8 y 72 caracteres, con al menos una letra y un número";
const MISMATCH = "Las contraseñas no coinciden";
const CODE = "Ingresá los 6 dígitos del código";

const valid: SignUpForm = {
  firstName: "Ana",
  lastName: "Pérez",
  email: "ana@example.com",
  phone: "11 3344-5566",
  address: 'Av. Rivadavia 4521, piso 3 "B"',
  addressNotes: "Timbre B",
  password: "clave1234",
  passwordConfirmation: "clave1234",
};

function errorsOf(changes: Partial<SignUpForm>) {
  const result = validateSignUp({ ...valid, ...changes });
  if (result.ok) throw new Error("expected the form to be rejected");
  return result.errors;
}

describe("normalizeEmail (RF-13)", () => {
  test.each([
    ["  Ana@Example.COM  ", "ana@example.com"],
    ["ana@example.com", "ana@example.com"],
    ["\tANA@EXAMPLE.COM\n", "ana@example.com"],
  ])("%j → %j", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe("normalizePhone (RF-8)", () => {
  test.each([
    ["11 3344-5566", "1133445566"],
    [" 11-3344-5566 ", "1133445566"],
    ["1133445566", "1133445566"],
    ["11a3445566", "11a3445566"],
  ])("%j → %j", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("isValidPhone (RF-7)", () => {
  test.each(["1133445566", "2214567890", "3514445566"])("accepts %s", (digits) => {
    expect(isValidPhone(digits)).toBe(true);
  });

  test.each([
    ["starts with 0", "0113344556"],
    ["9 digits", "113344556"],
    ["11 digits", "11334455667"],
    ["with the 15 (12 digits)", "111533445566"],
    ["with letters", "11a3445566"],
    ["with spaces", "11 3344 5566"],
    ["empty", ""],
  ])("rejects a phone %s", (_case, digits) => {
    expect(isValidPhone(digits)).toBe(false);
  });
});

describe("isValidPassword (RF-9), mirroring the Auth server", () => {
  test.each([
    ["8 characters with a letter and a number", "clave123"],
    ["72 characters", "a1".repeat(36)],
    ["spaces inside and around, not trimmed", " abc 123 "],
    ["uppercase letters", "CLAVE123"],
    ["symbols besides the letter and the number", "c!@#$%^1"],
  ])("accepts %s", (_case, password) => {
    expect(isValidPassword(password)).toBe(true);
  });

  test.each([
    ["7 characters", "clave12"],
    ["73 characters", "a1".repeat(36) + "b"],
    ["no number", "clavesecreta"],
    ["no letter", "12345678"],
    // The server only counts a-z and A-Z as letters.
    ["only accented letters and numbers", "áéíó1234"],
    ["only ñ and numbers", "ññññ1234"],
    // The server limit is 72 bytes: ñ takes two.
    ["42 characters that take 82 bytes", "ñ".repeat(40) + "a1"],
  ])("rejects %s", (_case, password) => {
    expect(isValidPassword(password)).toBe(false);
  });

  test("8 spaces around a valid core are counted as characters", () => {
    expect(isValidPassword("   a1   ")).toBe(true);
  });
});

describe("validateSignUp", () => {
  test("RF-8 / RF-13: returns the data normalized, ready for signUp", () => {
    expect(
      validateSignUp({
        ...valid,
        firstName: "  Ana ",
        lastName: " Pérez ",
        email: "  Ana@Example.COM ",
        address: "  Calle 1  ",
        addressNotes: "  Timbre B ",
        password: " clave1234 ",
        passwordConfirmation: " clave1234 ",
      }),
    ).toEqual({
      ok: true,
      data: {
        email: "ana@example.com",
        password: " clave1234 ",
        profile: {
          first_name: "Ana",
          last_name: "Pérez",
          phone: "1133445566",
          address: "Calle 1",
          address_notes: "Timbre B",
        },
      },
    });
  });

  test("RF-5: the references are optional and empty ones become null", () => {
    for (const addressNotes of ["", "   "]) {
      const result = validateSignUp({ ...valid, addressNotes });
      expect(result.ok && result.data.profile.address_notes).toBeNull();
    }
  });

  test("RF-6: every empty or blank required field gets its own message", () => {
    expect(
      errorsOf({
        firstName: "",
        lastName: "   ",
        email: " ",
        phone: "",
        address: "  ",
        password: "",
        passwordConfirmation: "",
      }),
    ).toEqual({
      firstName: REQUIRED,
      lastName: REQUIRED,
      email: REQUIRED,
      phone: REQUIRED,
      address: REQUIRED,
      password: REQUIRED,
      passwordConfirmation: REQUIRED,
    });
  });

  test("RF-6: a password of only spaces counts as empty", () => {
    expect(errorsOf({ password: "        ", passwordConfirmation: "        " })).toEqual({
      password: REQUIRED,
      passwordConfirmation: REQUIRED,
    });
  });

  test("RF-5 / RF-6: the maximum lengths are accepted", () => {
    const result = validateSignUp({
      ...valid,
      firstName: "a".repeat(50),
      lastName: "b".repeat(50),
      address: "c".repeat(120),
      addressNotes: "d".repeat(120),
    });
    expect(result.ok).toBe(true);
  });

  test("RF-5 / RF-6: a field longer than its maximum is rejected with the limit", () => {
    expect(
      errorsOf({
        firstName: "a".repeat(51),
        lastName: "b".repeat(51),
        address: "c".repeat(121),
        addressNotes: "d".repeat(121),
      }),
    ).toEqual({
      firstName: "Usá hasta 50 caracteres",
      lastName: "Usá hasta 50 caracteres",
      address: "Usá hasta 120 caracteres",
      addressNotes: "Usá hasta 120 caracteres",
    });
  });

  test("RF-6: the limit is checked after trimming", () => {
    expect(validateSignUp({ ...valid, firstName: `  ${"a".repeat(50)}  ` }).ok).toBe(true);
  });

  test("RF-6: lengths count characters like the database, not UTF-16 units", () => {
    // Each emoji is one character for Postgres (char_length) but two units for String.length.
    expect(validateSignUp({ ...valid, firstName: "😀".repeat(50) }).ok).toBe(true);
    expect(errorsOf({ firstName: "😀".repeat(51) })).toEqual({ firstName: "Usá hasta 50 caracteres" });
  });

  test.each(["0113344556", "113344556", "11 15 3344 5566", "11a3445566"])(
    "RF-7: the phone %j is rejected with the expected format and an example",
    (phone) => {
      expect(errorsOf({ phone })).toEqual({ phone: PHONE });
    },
  );

  test("RF-9: an invalid password shows the rule", () => {
    expect(errorsOf({ password: "clavesecreta", passwordConfirmation: "clavesecreta" })).toEqual({
      password: PASSWORD,
    });
  });

  test("RF-10: a different confirmation is marked on the confirmation", () => {
    expect(errorsOf({ passwordConfirmation: "clave12345" })).toEqual({ passwordConfirmation: MISMATCH });
  });

  test("RF-10: the confirmation is compared without trimming", () => {
    expect(errorsOf({ passwordConfirmation: "clave1234 " })).toEqual({ passwordConfirmation: MISMATCH });
  });

  test.each(["ana", "ana@", "@example.com", "ana@example", "ana @example.com", "ana@@example.com"])(
    "RF-11: the email %j is rejected",
    (email) => {
      expect(errorsOf({ email })).toEqual({ email: EMAIL });
    },
  );

  test("RF-6: reports every invalid field at once", () => {
    expect(Object.keys(errorsOf({ firstName: "", phone: "123", email: "ana" })).sort()).toEqual([
      "email",
      "firstName",
      "phone",
    ]);
  });
});

describe("validateLogin", () => {
  test("RF-13: returns the email normalized and the password as typed", () => {
    expect(validateLogin({ email: "  Ana@Example.COM ", password: " clave1234 " })).toEqual({
      ok: true,
      data: { email: "ana@example.com", password: " clave1234 " },
    });
  });

  test("an empty email or password is marked as required", () => {
    expect(validateLogin({ email: "  ", password: "" })).toEqual({
      ok: false,
      errors: { email: REQUIRED, password: REQUIRED },
    });
  });

  test("does not check the password rules: a wrong password is the server's answer (RF-18)", () => {
    expect(validateLogin({ email: "ana@example.com", password: "123" }).ok).toBe(true);
  });
});

// Change of 2026-11-19: the code that arrives by email (RF-40, RF-55).
describe("isValidCode", () => {
  test.each(["123456", "000000", " 123456 "])("accepts %p (surrounding spaces are trimmed)", (code) => {
    expect(isValidCode(code)).toBe(true);
  });

  test.each(["", "12345", "1234567", "12345a", "123 456", "１２３４５６", "12-456"])("rejects %p", (code) => {
    expect(isValidCode(code)).toBe(false);
  });
});

describe("validateCode (RF-40)", () => {
  test("returns the code trimmed", () => {
    expect(validateCode({ code: " 123456 " })).toEqual({ ok: true, data: { code: "123456" } });
  });

  test("an empty code is required", () => {
    expect(validateCode({ code: "  " })).toEqual({ ok: false, errors: { code: REQUIRED } });
  });

  test("a code without 6 digits says so", () => {
    expect(validateCode({ code: "1234" })).toEqual({ ok: false, errors: { code: CODE } });
  });
});

describe("validateEmail (RF-53)", () => {
  test("returns the email normalized, as RF-13", () => {
    expect(validateEmail({ email: "  Ana@Example.COM " })).toEqual({ ok: true, data: { email: "ana@example.com" } });
  });

  test("an empty email is required", () => {
    expect(validateEmail({ email: " " })).toEqual({ ok: false, errors: { email: REQUIRED } });
  });

  test.each(["ana", "ana@", "ana@example", "ana @example.com"])("the sign-up rule of RF-11 rejects %p", (email) => {
    expect(validateEmail({ email })).toEqual({ ok: false, errors: { email: EMAIL } });
  });
});

describe("validateNewPassword (RF-55)", () => {
  const form = { code: "123456", password: "nueva1234", passwordConfirmation: "nueva1234" };

  test("returns the code trimmed and the password as typed", () => {
    expect(validateNewPassword({ ...form, code: " 123456 ", password: " nueva1234", passwordConfirmation: " nueva1234" })).toEqual({
      ok: true,
      data: { code: "123456", password: " nueva1234" },
    });
  });

  test("marks every field at once, without sending anything", () => {
    expect(validateNewPassword({ code: "12", password: "corta", passwordConfirmation: "otra" })).toEqual({
      ok: false,
      errors: { code: CODE, password: PASSWORD, passwordConfirmation: MISMATCH },
    });
  });

  test("empty fields are required; a password of only spaces counts as empty", () => {
    expect(validateNewPassword({ code: "", password: "        ", passwordConfirmation: "" })).toEqual({
      ok: false,
      errors: { code: REQUIRED, password: REQUIRED, passwordConfirmation: REQUIRED },
    });
  });

  test("uses the password rule of RF-9, as the sign-up", () => {
    expect(validateNewPassword({ ...form, password: "sololetras", passwordConfirmation: "sololetras" })).toEqual({
      ok: false,
      errors: { password: PASSWORD },
    });
  });

  test("the confirmation is compared without trimming, as RF-10", () => {
    expect(validateNewPassword({ ...form, passwordConfirmation: "nueva1234 " })).toEqual({
      ok: false,
      errors: { passwordConfirmation: MISMATCH },
    });
  });
});

// Spec 010, RF-24: editing the profile uses the same rules and messages as the sign-up.
describe("validateProfile (spec 010, RF-24)", () => {
  const profile: ProfileForm = {
    firstName: "  Ana ",
    lastName: "Pérez",
    phone: "11 3344-5566",
    address: " Calle 1 ",
    addressNotes: "Timbre B",
  };

  function profileErrors(changes: Partial<ProfileForm>) {
    const result = validateProfile({ ...profile, ...changes });
    if (result.ok) throw new Error("expected the form to be rejected");
    return result.errors;
  }

  test("returns the data normalized, with the column names of profiles", () => {
    expect(validateProfile(profile)).toEqual({
      ok: true,
      data: { first_name: "Ana", last_name: "Pérez", phone: "1133445566", address: "Calle 1", address_notes: "Timbre B" },
    });
  });

  test("empty references become null", () => {
    const result = validateProfile({ ...profile, addressNotes: "   " });
    expect(result.ok && result.data.address_notes).toBeNull();
  });

  test("every empty required field gets its own message", () => {
    expect(profileErrors({ firstName: " ", lastName: "", phone: "", address: "" })).toEqual({
      firstName: REQUIRED,
      lastName: REQUIRED,
      phone: REQUIRED,
      address: REQUIRED,
    });
  });

  test("an invalid phone shows the expected format", () => {
    expect(profileErrors({ phone: "011 3344 5566" })).toEqual({ phone: PHONE });
  });

  test("the maximum lengths are the sign-up ones", () => {
    expect(validateProfile({ ...profile, firstName: "a".repeat(50), address: "a".repeat(120), addressNotes: "a".repeat(120) }).ok).toBe(true);
    expect(
      profileErrors({ firstName: "a".repeat(51), lastName: "a".repeat(51), address: "a".repeat(121), addressNotes: "a".repeat(121) }),
    ).toEqual({
      firstName: "Usá hasta 50 caracteres",
      lastName: "Usá hasta 50 caracteres",
      address: "Usá hasta 120 caracteres",
      addressNotes: "Usá hasta 120 caracteres",
    });
  });
});

describe("validateAdminProfile (spec 011, RF-17, RF-18)", () => {
  const profile: ProfileForm = {
    firstName: "  Mateo ",
    lastName: "Admin",
    phone: "11 3344-5566",
    address: " Calle 1 ",
    addressNotes: " Timbre B ",
  };

  function adminErrors(changes: Partial<ProfileForm>) {
    const result = validateAdminProfile({ ...profile, ...changes });
    if (result.ok) throw new Error("expected the form to be rejected");
    return result.errors;
  }

  test("RF-18: returns the data trimmed, with the phone in its 10 digits", () => {
    expect(validateAdminProfile(profile)).toEqual({
      ok: true,
      data: { first_name: "Mateo", last_name: "Admin", phone: "1133445566", address: "Calle 1", address_notes: "Timbre B" },
    });
  });

  test("RF-17: phone, address and notes are optional: empty is null", () => {
    expect(validateAdminProfile({ ...profile, phone: "", address: "", addressNotes: "" })).toEqual({
      ok: true,
      data: { first_name: "Mateo", last_name: "Admin", phone: null, address: null, address_notes: null },
    });
  });

  test("RF-17: only spaces (and hyphens in the phone) count as empty", () => {
    expect(validateAdminProfile({ ...profile, phone: " - - ", address: "   ", addressNotes: "  " })).toEqual({
      ok: true,
      data: { first_name: "Mateo", last_name: "Admin", phone: null, address: null, address_notes: null },
    });
  });

  test("RF-17: first and last name are still required", () => {
    expect(adminErrors({ firstName: " ", lastName: "" })).toEqual({ firstName: REQUIRED, lastName: REQUIRED });
  });

  test("RF-17: a phone that is filled in follows the sign-up rule and message", () => {
    expect(adminErrors({ phone: "011 3344 5566" })).toEqual({ phone: PHONE });
    expect(adminErrors({ phone: "113344556" })).toEqual({ phone: PHONE });
  });

  test("RF-17: the maximum lengths are the sign-up ones", () => {
    expect(
      validateAdminProfile({ ...profile, firstName: "a".repeat(50), address: "a".repeat(120), addressNotes: "a".repeat(120) }).ok,
    ).toBe(true);
    expect(
      adminErrors({ firstName: "a".repeat(51), lastName: "a".repeat(51), address: "a".repeat(121), addressNotes: "a".repeat(121) }),
    ).toEqual({
      firstName: "Usá hasta 50 caracteres",
      lastName: "Usá hasta 50 caracteres",
      address: "Usá hasta 120 caracteres",
      addressNotes: "Usá hasta 120 caracteres",
    });
  });
});
