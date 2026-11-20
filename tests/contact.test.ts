import { callUrl, whatsappUrl } from "@/logic/contact";

// Spec 005 · T4: calling and writing to the client (RF-9, RF-10). Phones are 10 digits without the 0
// or the 15 (spec 002), so a mobile takes +54 9 in front.
describe("callUrl (RF-9)", () => {
  test("a tel: URL with +54 9", () => {
    expect(callUrl("1133445566")).toBe("tel:+5491133445566");
  });

  test("no phone, no URL (the admin profile may have none)", () => {
    expect(callUrl(null)).toBeNull();
    expect(callUrl("")).toBeNull();
  });
});

describe("whatsappUrl (RF-10)", () => {
  test("a wa.me link with 549 and no plus sign", () => {
    expect(whatsappUrl("3514556677")).toBe("https://wa.me/5493514556677");
  });

  test("no phone, no URL", () => {
    expect(whatsappUrl(null)).toBeNull();
  });
});
