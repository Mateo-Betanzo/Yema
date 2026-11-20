import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { Text } from "react-native";

import { ProductRow } from "@/components/product-row";

// Spec 003 · T6: the product row of Products (admin) and the Shop (RF-16, RF-26, RF-31).
describe("product row", () => {
  test("shows the fixed egg image, the title, its lines and the trailing slot", async () => {
    await render(
      <ProductRow title="Pack Mediano" lines={["6 maples medianos", "$10.500"]} trailing={<Text>⋮</Text>} />,
    );
    expect(screen.getByTestId("egg-image", { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText("Pack Mediano")).toBeOnTheScreen();
    expect(screen.getByText("6 maples medianos")).toBeOnTheScreen();
    expect(screen.getByText("$10.500")).toBeOnTheScreen();
    expect(screen.getByText("⋮")).toBeOnTheScreen();
  });

  test("RF-31: the image is decorative, the same for every product", async () => {
    await render(<ProductRow title="Maple Grande" lines={[]} />);
    expect(screen.getByTestId("egg-image", { includeHiddenElements: true })).toHaveProp("accessible", false);
  });

  test("when it can be pressed, it is one button named by its texts", async () => {
    const onPress = jest.fn();
    await render(<ProductRow title="Pack Mediano" lines={["$10.500", "Sin stock"]} onPress={onPress} />);
    await fireEvent.press(screen.getByRole("button", { name: "Pack Mediano, $10.500, Sin stock" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // Fading the whole row took "Sin stock" in secondary text to 2.2:1 on the card; only the image fades.
  test("a dimmed row fades its image, never its texts (contrast stays 4.5:1)", async () => {
    await render(<ProductRow title="Pack Mediano" lines={["Sin stock"]} dimmed onPress={() => {}} />);
    expect(screen.getByTestId("egg-image", { includeHiddenElements: true })).toHaveStyle({ opacity: 0.4 });
    expect(screen.getByRole("button")).not.toHaveStyle({ opacity: 0.5 });
    expect(screen.getByText("Sin stock")).not.toHaveStyle({ opacity: 0.5 });
  });

  test("RF-19 (spec 006): an amount on the right, inside the button and in its name", async () => {
    const onPress = jest.fn();
    await render(<ProductRow title="2 × Maple Grandes" lines={["Entregado"]} amount="$10.500" onPress={onPress} />);
    expect(screen.getByText("$10.500")).toHaveStyle({ color: "#ffffff" });
    await fireEvent.press(screen.getByRole("button", { name: "2 × Maple Grandes, Entregado, $10.500" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test("RF-19 (spec 006): an amount that was not charged goes grey (4.94:1 on the card)", async () => {
    await render(<ProductRow title="1 × Maple Grandes" lines={["Rechazado"]} amount="$5.000" amountMuted />);
    expect(screen.getByText("$5.000")).toHaveStyle({ color: "#8f8f94" });
  });

  test("spec 009, RF-26, RF-27: with menuLabel, the whole card is one button with that label and the ⋮ inside", async () => {
    const onPress = jest.fn();
    await render(
      <ProductRow title="Pack Mediano" lines={["Medianos · Pack", "$10.500"]} onPress={onPress} menuLabel="Opciones de Pack Mediano" />,
    );
    const card = screen.getByRole("button", { name: "Opciones de Pack Mediano" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(card).toHaveProp("accessibilityValue", { text: "Medianos · Pack, $10.500" });
    expect(within(card).getByText("Pack Mediano")).toBeOnTheScreen();
    expect(within(card).getByTestId("icon:more-vert", { includeHiddenElements: true })).toBeOnTheScreen();
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
