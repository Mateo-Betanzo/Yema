import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { ListState } from "@/components/list-state";

// Spec 003 · T6: loading, error and empty for every list (RF-30 and the interface states of the spec).
describe("list state", () => {
  test("while loading, shows an indicator the screen reader announces", async () => {
    await render(
      <ListState loading error={null} empty={null} onRetry={() => {}}>
        <Text>lista</Text>
      </ListState>,
    );
    expect(screen.getByLabelText("Cargando")).toBeOnTheScreen();
    expect(screen.queryByText("lista")).toBeNull();
  });

  test("on error, shows the message and a retry button", async () => {
    const onRetry = jest.fn();
    await render(
      <ListState loading={false} error="No pudimos cargar los productos" empty={null} onRetry={onRetry}>
        <Text>lista</Text>
      </ListState>,
    );
    expect(screen.getByText("No pudimos cargar los productos")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("when empty, explains it", async () => {
    await render(
      <ListState loading={false} error={null} empty="Todavía no hay productos" onRetry={() => {}}>
        <Text>lista</Text>
      </ListState>,
    );
    expect(screen.getByText("Todavía no hay productos")).toBeOnTheScreen();
    expect(screen.queryByText("lista")).toBeNull();
  });

  test("otherwise shows the list", async () => {
    await render(
      <ListState loading={false} error={null} empty={null} onRetry={() => {}}>
        <Text>lista</Text>
      </ListState>,
    );
    expect(screen.getByText("lista")).toBeOnTheScreen();
  });
});
