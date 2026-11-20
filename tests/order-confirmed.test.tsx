import { fireEvent, render, screen } from "@testing-library/react-native";

import OrderConfirmed from "@/app/client/order-confirmed";
import { addDays, formatDayKey, toBuenosAiresDate } from "@/logic/dates";

// Spec 004 · T11: the confirmation of an order (RF-31). The checkout replaces itself with this screen
// and passes what create_order returned as route params.
const tomorrow = addDays(toBuenosAiresDate(new Date()), 1);
const mockParams: { current: Record<string, string | undefined> } = { current: {} };
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams.current,
  router: { dismissTo: (...args: unknown[]) => mockDismissTo(...args), back: jest.fn() },
}));

beforeEach(() => {
  mockParams.current = { date: tomorrow, startsAt: "09:00:00", endsAt: "11:00:00", total: "22200" };
  mockDismissTo.mockClear();
});

describe("Order confirmed", () => {
  test("RF-31: the day, the slot, the total and cash on delivery", async () => {
    await render(<OrderConfirmed />);
    expect(screen.getByRole("header", { name: "¡Pedido confirmado!" })).toBeOnTheScreen();
    expect(screen.getByText(formatDayKey(tomorrow, new Date()))).toBeOnTheScreen();
    expect(screen.getByText("9 a 11 h")).toBeOnTheScreen();
    expect(screen.getByLabelText("Total $22.200")).toBeOnTheScreen();
    expect(screen.getByText("Pagás en efectivo al recibir")).toBeOnTheScreen();
  });

  test("spec 010, RF-15: Ver productos closes the order screens and opens the Home, where the Shop is", async () => {
    await render(<OrderConfirmed />);
    expect(screen.queryByRole("button", { name: "Volver a la Tienda" })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Ver productos" }));
    expect(mockDismissTo).toHaveBeenCalledWith("/client");
  });

  test("there is no back to the empty cart", async () => {
    await render(<OrderConfirmed />);
    expect(screen.queryByRole("button", { name: "Volver" })).toBeNull();
  });

  test("without the order details (an old link), it still confirms and goes back to the Home", async () => {
    mockParams.current = {};
    await render(<OrderConfirmed />);
    expect(screen.getByRole("header", { name: "¡Pedido confirmado!" })).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Total/)).toBeNull();
    expect(screen.getByRole("button", { name: "Ver productos" })).toBeOnTheScreen();
  });
});
