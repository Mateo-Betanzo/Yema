import { focusManager, useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";

import { QueryProvider } from "@/lib/query-client";

// Spec 003 · T4: TanStack Query for every screen, with "focus" tied to the app being in the foreground
// (TanStack Query's React Native guide).
function Probe() {
  const client = useQueryClient();
  return <Text>{client.getDefaultOptions().queries?.retry === 1 ? "una vez" : "otro"}</Text>;
}

describe("QueryProvider", () => {
  test("gives every screen a query client that retries once", async () => {
    await render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );
    expect(screen.getByText("una vez")).toBeOnTheScreen();
  });

  test("queries count as focused only while the app is in the foreground", async () => {
    const listeners: ((status: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
      listeners.push(listener as (status: AppStateStatus) => void);
      return { remove: jest.fn() } as never;
    });
    await render(
      <QueryProvider>
        <Probe />
      </QueryProvider>,
    );

    listeners.forEach((listener) => listener("background"));
    expect(focusManager.isFocused()).toBe(false);
    listeners.forEach((listener) => listener("active"));
    expect(focusManager.isFocused()).toBe(true);
  });
});
