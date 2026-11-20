import { renderHook } from "@testing-library/react-native";

import { useRefreshOnFocus } from "@/lib/use-refresh-on-focus";

// Spec 004 · T7: a screen refreshes its data each time it gains focus again (RF-6), but not the first
// time, when the query has just loaded. useFocusEffect of expo-router runs its effect on each focus; here
// it is replaced with a recorder so the test decides when the screen gains focus.
let mockEffect: (() => void) | null = null;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void) => {
    mockEffect = effect;
  },
}));

function focus() {
  if (!mockEffect) throw new Error("useFocusEffect was not called");
  mockEffect();
}

describe("useRefreshOnFocus", () => {
  test("RF-6: refreshes on every focus after the first", async () => {
    const refetch = jest.fn();
    await renderHook(() => useRefreshOnFocus(refetch));

    focus();
    expect(refetch).not.toHaveBeenCalled();

    focus();
    focus();
    expect(refetch).toHaveBeenCalledTimes(2);
  });
});
