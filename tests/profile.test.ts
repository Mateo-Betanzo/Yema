import { isProfileChanged, profileSaveErrorMessage, profileToForm } from "@/logic/profile";

// Spec 010 · T1: the pure functions of "Editar perfil" (RF-23, RF-27, RF-28).
const PROFILE = {
  first_name: "Ana",
  last_name: "Pérez",
  phone: "1133445566",
  address: "Calle 1",
  address_notes: null,
};

describe("profileToForm (RF-23)", () => {
  test("loads the current data, with empty text where there is none", () => {
    expect(profileToForm(PROFILE)).toEqual({
      firstName: "Ana",
      lastName: "Pérez",
      phone: "1133445566",
      address: "Calle 1",
      addressNotes: "",
    });
  });

  test("a profile without phone or address (the admin) gives empty fields", () => {
    expect(profileToForm({ ...PROFILE, phone: null, address: null })).toMatchObject({ phone: "", address: "" });
  });
});

describe("isProfileChanged (RF-27)", () => {
  test("the loaded data has no changes", () => {
    expect(isProfileChanged(profileToForm(PROFILE), PROFILE)).toBe(false);
  });

  test.each([
    ["firstName", "Anabel"],
    ["lastName", "Pérez "],
    ["phone", "11 3344 5566"],
    ["address", "Calle 2"],
    ["addressNotes", "Timbre B"],
  ] as const)("any difference in %s is a change, even one the base would normalize away", (field, value) => {
    expect(isProfileChanged({ ...profileToForm(PROFILE), [field]: value }, PROFILE)).toBe(true);
  });
});

describe("profileSaveErrorMessage (RF-28)", () => {
  test("a request that never reached the server is a missing connection", () => {
    expect(profileSaveErrorMessage({ code: "", message: "TypeError: Network request failed" })).toBe(
      "No hay conexión. Revisá tu internet e intentá de nuevo",
    );
  });

  test.each([
    [{ code: "23514", message: 'new row violates check constraint "profiles_phone_format"' }],
    [{ code: "42501", message: "permission denied for table profiles" }],
    [new Error("boom")],
    [null],
  ])("any other error is the generic message (%j)", (error) => {
    expect(profileSaveErrorMessage(error)).toBe("No pudimos guardar tus datos. Intentá de nuevo");
  });
});
