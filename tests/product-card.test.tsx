import { fireEvent, render, screen } from "@testing-library/react-native";

import { ProductCard } from "@/components/product-card";
import { theme } from "@/theme";

// /feature 2026-11-18: the card of the Shop grid. Its texts open the detail; "Agregar", below, adds one
// unit (the Shop decides with the limits of the cart). No egg image (spec 003, RF-31 as changed on
// 2026-11-18) and no description, which only the detail shows (/feature 2026-11-18). "Agregar" is a pill
// and the card follows it: its radius is the button's plus its padding, and the texts sit further in, so
// they stay clear of the round corners.
const handlers = () => ({ onOpen: jest.fn(), onBuy: jest.fn() });
const PACK = { title: "Pack Mediano", price: "$10.500", remaining: "Quedan 2" };

describe("product card", () => {
  test("spec 003 RF-31: the name and its texts, without image, one button that opens the detail", async () => {
    const props = handlers();
    await render(<ProductCard {...PACK} {...props} />);
    expect(screen.queryByTestId("egg-image", { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Pack Mediano, $10.500, Quedan 2" }));
    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onBuy).not.toHaveBeenCalled();
  });

  test("the hierarchy: the name and the price in white and semibold, the units in grey", async () => {
    await render(<ProductCard {...PACK} {...handlers()} />);
    expect(screen.getByText("Pack Mediano")).toHaveStyle({ color: theme.colors.text, fontWeight: "600" });
    expect(screen.getByText("$10.500")).toHaveStyle({ color: theme.colors.text, fontWeight: "600" });
    expect(screen.getByText("Quedan 2")).toHaveStyle({ color: theme.colors.textSecondary });
  });

  test("a long name takes at most two lines", async () => {
    await render(<ProductCard {...PACK} {...handlers()} />);
    expect(screen.getByText("Pack Mediano")).toHaveProp("numberOfLines", 2);
  });

  test("Agregar, below, adds that product, apart from the detail, and is the 56 pt PrimaryButton", async () => {
    const props = handlers();
    await render(<ProductCard {...PACK} {...props} />);
    const buy = screen.getByRole("button", { name: "Agregar Pack Mediano" });
    expect(buy).toHaveTextContent("Agregar");
    expect(buy).toHaveStyle({ minHeight: 56 });
    await fireEvent.press(buy);
    expect(props.onBuy).toHaveBeenCalledTimes(1);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  test("Agregar can be disabled (no stock or an active order) while the detail still opens", async () => {
    const props = handlers();
    await render(<ProductCard {...PACK} title="Maple Grande" remaining="Sin stock" buyDisabled {...props} />);
    const buy = screen.getByRole("button", { name: "Agregar Maple Grande" });
    expect(buy).toBeDisabled();
    await fireEvent.press(buy);
    expect(props.onBuy).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: /^Maple Grande,/ }));
    expect(props.onOpen).toHaveBeenCalledTimes(1);
  });

  test("Agregar is a pill (56 pt, radius 28) and the card follows it: padding 12 and radius 40 (28 + 12)", async () => {
    await render(<ProductCard {...PACK} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Agregar Pack Mediano" })).toHaveStyle({ borderRadius: 1000, minHeight: 56 });
    expect(screen.getByTestId("product-card")).toHaveStyle({ borderRadius: 40, padding: 12 });
  });

  test("the texts sit 12 pt further in than Agregar, clear of the round corners", async () => {
    await render(<ProductCard {...PACK} {...handlers()} />);
    expect(screen.getByRole("button", { name: /^Pack Mediano,/ })).toHaveStyle({ paddingHorizontal: 12, paddingTop: 12 });
  });

  test("the wide one (Tu más comprado) has the same corners and insets", async () => {
    await render(<ProductCard {...PACK} wide {...handlers()} />);
    expect(screen.getByTestId("product-card-wide")).toHaveStyle({ borderRadius: 40 });
    expect(screen.getByRole("button", { name: /^Pack Mediano,/ })).toHaveStyle({ paddingHorizontal: 12, paddingTop: 12 });
  });

  // /feature 2026-11-18: "Tu más comprado" in violet and white, as the highlighted row of the Figma.
  test("the wide one is violet with every text in white, and its Agregar is a white pill with violet text", async () => {
    await render(<ProductCard {...PACK} wide {...handlers()} />);
    expect(screen.getByTestId("product-card-wide")).toHaveStyle({ backgroundColor: theme.colors.accent });
    for (const text of ["Pack Mediano", "$10.500", "Quedan 2"]) {
      expect(screen.getByText(text)).toHaveStyle({ color: theme.colors.text });
    }
    expect(screen.getByRole("button", { name: "Agregar Pack Mediano" })).toHaveStyle({
      backgroundColor: theme.colors.text,
      borderRadius: 1000,
    });
    expect(screen.getByText("Agregar")).toHaveStyle({ color: theme.colors.accent });
  });

  test("the grid one stays on surface with the orange Agregar", async () => {
    await render(<ProductCard {...PACK} {...handlers()} />);
    expect(screen.getByTestId("product-card")).toHaveStyle({ backgroundColor: theme.colors.surface });
    expect(screen.getByRole("button", { name: "Agregar Pack Mediano" })).toHaveStyle({ backgroundColor: theme.colors.primary });
  });
});
