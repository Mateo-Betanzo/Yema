import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { useResendCooldown } from "@/lib/use-resend-cooldown";

// Spec 002 · T14 (change of 2026-11-19), RF-60: "Reenviar código" waits 60 s after each email. The
// screen opens right after a code was sent, so the count starts at once.
function Probe() {
  const { secondsLeft, restart } = useResendCooldown();
  return (
    <Text testID="left" onPress={restart}>
      {String(secondsLeft)}
    </Text>
  );
}

beforeEach(() => {
  jest.useFakeTimers({ now: new Date("2026-11-19T22:00:00.000Z") });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("useResendCooldown (RF-60)", () => {
  test("starts at 60 and counts down each second", async () => {
    await render(<Probe />);
    expect(screen.getByTestId("left")).toHaveTextContent("60");
    await act(async () => jest.advanceTimersByTime(1_000));
    expect(screen.getByTestId("left")).toHaveTextContent("59");
    await act(async () => jest.advanceTimersByTime(58_000));
    expect(screen.getByTestId("left")).toHaveTextContent("1");
  });

  test("stops at 0", async () => {
    await render(<Probe />);
    await act(async () => jest.advanceTimersByTime(75_000));
    expect(screen.getByTestId("left")).toHaveTextContent("0");
  });

  test("restart counts 60 s again from now", async () => {
    await render(<Probe />);
    await act(async () => jest.advanceTimersByTime(61_000));
    expect(screen.getByTestId("left")).toHaveTextContent("0");
    await fireEvent.press(screen.getByTestId("left"));
    expect(screen.getByTestId("left")).toHaveTextContent("60");
    await act(async () => jest.advanceTimersByTime(2_000));
    expect(screen.getByTestId("left")).toHaveTextContent("58");
  });
});
