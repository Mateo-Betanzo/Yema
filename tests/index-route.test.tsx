import { render } from "@testing-library/react-native";

import type { SessionStatus } from "@/lib/session";

import Index from "@/app/index";

// Spec 002 · T6: the root route sends each state to its place (RF-1, RF-17, RF-21, RF-31). It is the
// anchor of the root stack, so a link to a screen the user cannot open also lands here.
let mockStatus: SessionStatus = "loading";
const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock("expo-router", () => ({ Redirect: (props: { href: string }) => mockRedirect(props) }));
jest.mock("@/lib/session", () => ({ useSession: () => ({ status: mockStatus }) }));

describe("index route", () => {
  beforeEach(() => mockRedirect.mockClear());

  test("shows nothing while the session loads (the splash is still up)", async () => {
    mockStatus = "loading";
    await render(<Index />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test.each([
    ["signed-out", "/welcome"],
    ["client", "/client"],
    ["admin", "/admin"],
  ] as const)("%s → %s", async (status, href) => {
    mockStatus = status;
    await render(<Index />);
    expect(mockRedirect).toHaveBeenCalledWith({ href });
  });
});
