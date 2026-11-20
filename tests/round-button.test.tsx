import { fireEvent, render, screen } from "@testing-library/react-native";

import { RoundButton } from "@/components/round-button";

// The round "+" and "−" (spec 004) and the menu of the client Perfil (spec 010, RF-16). Since 2026-11-18
// they look like the tab bar: the overlay with the surface border (they were violet).
describe("round button", () => {
  test("a 48 pt button with its label that presses", async () => {
    const onPress = jest.fn();
    await render(<RoundButton icon="plus" label="Agregar Maple Grandes" onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Agregar Maple Grandes" });
    expect(button).toHaveStyle({ width: 48, height: 48, backgroundColor: "#17171b", borderWidth: 1, borderColor: "#222222" });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("disabled, it turns grey and takes no taps", async () => {
    const onPress = jest.fn();
    await render(<RoundButton icon="plus" label="No disponible: sin stock" disabled onPress={onPress} />);
    const button = screen.getByRole("button", { name: "No disponible: sin stock" });
    expect(button).toBeDisabled();
    expect(button).toHaveStyle({ backgroundColor: "#5a5a5a" });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  // /feature 2026-11-19: "Continuar con Google" in Login (spec 002, RF-20).
  test("loading, it shows a spinner instead of the icon, is busy and takes no taps", async () => {
    const onPress = jest.fn();
    await render(<RoundButton icon="google" label="Continuar con Google" loading onPress={onPress} />);
    const button = screen.getByRole("button", { name: "Continuar con Google" });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
    expect(screen.queryByTestId("icon:google", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});
