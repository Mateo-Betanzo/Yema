import { fireEvent, render, screen } from "@testing-library/react-native";
import { ScrollView } from "react-native";

import { FilterChips } from "@/components/filter-chips";
import { theme } from "@/theme";

// Spec 003 · T6: the single-choice chips of the Shop filters (RF-27) and of the product form.
const options = [
  { value: null, label: "Todos" },
  { value: 1, label: "Media docena" },
  { value: 2, label: "Maple" },
];

describe("filter chips", () => {
  test("each chip is a button with its label; the chosen one is selected", async () => {
    await render(<FilterChips label="Formato" options={options} value={2} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Maple" })).toBeSelected();
    expect(screen.getByRole("button", { name: "Todos" })).not.toBeSelected();
    expect(screen.getByRole("button", { name: "Media docena" })).not.toBeSelected();
  });

  test("choosing a chip reports its value", async () => {
    const onChange = jest.fn();
    await render(<FilterChips label="Formato" options={options} value={null} onChange={onChange} />);
    await fireEvent.press(screen.getByRole("button", { name: "Media docena" }));
    expect(onChange).toHaveBeenCalledWith(1);
  });

  test("the row scrolls sideways inside the page, and has an accessible name", async () => {
    await render(<FilterChips label="Formato" options={options} value={null} onChange={() => {}} />);
    const row = screen.getByLabelText("Formato");
    expect(row).toHaveProp("horizontal", true);
  });

  test("each chip has a touch area of at least 48 pt (34 pt drawn plus 7 pt above and below)", async () => {
    await render(<FilterChips label="Formato" options={options} value={null} onChange={() => {}} />);
    for (const chip of screen.getAllByRole("button")) {
      expect(chip).toHaveStyle({ minHeight: 34 });
      expect(chip).toHaveProp("hitSlop", { top: 7, bottom: 7, left: 4, right: 4 });
    }
  });

  test("spec 004 (RF-3, RF-21): a disabled chip says so and cannot be chosen", async () => {
    const onChange = jest.fn();
    await render(
      <FilterChips
        label="Horario"
        options={[
          { value: 1, label: "9 a 11 h" },
          { value: 2, label: "18 a 21 h · Completa", disabled: true },
        ]}
        value={null}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("button", { name: "18 a 21 h · Completa" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "9 a 11 h" })).toBeEnabled();
    await fireEvent.press(screen.getByRole("button", { name: "18 a 21 h · Completa" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("spec 007 (RF-8): on the orange card, dark chips with white text and the chosen one violet", async () => {
    await render(
      <FilterChips
        label="Período"
        tone="onPrimary"
        options={[
          { value: "week", label: "Semana" },
          { value: "month", label: "Mes" },
        ]}
        value="month"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Mes" })).toHaveStyle({ backgroundColor: theme.colors.accent });
    expect(screen.getByRole("button", { name: "Semana" })).toHaveStyle({ backgroundColor: theme.colors.primaryShade });
    expect(screen.getByText("Semana")).toHaveStyle({ color: theme.colors.text });
    expect(screen.getByText("Mes")).toHaveStyle({ color: theme.colors.text });
  });

  test("spec 009 (T6): the row scrolls once to the chosen chip, so a choice far to the right is seen", async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, "scrollTo");
    const hours = Array.from({ length: 20 }, (_, i) => ({ value: i, label: `${i}:00` }));
    await render(<FilterChips label="Desde" options={hours} value={12} onChange={() => {}} />);
    await fireEvent(screen.getByRole("button", { name: "12:00" }), "layout", { nativeEvent: { layout: { x: 600 } } });
    expect(scrollTo).toHaveBeenCalledWith({ x: 600 - theme.spacing.xl, animated: false });
    await fireEvent(screen.getByRole("button", { name: "12:00" }), "layout", { nativeEvent: { layout: { x: 640 } } });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    scrollTo.mockRestore();
  });
});

