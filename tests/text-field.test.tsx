import { fireEvent, render, screen } from "@testing-library/react-native";

import { TextField } from "@/components/text-field";
import { theme } from "@/theme";

// The eye of a password field: the closed eye while the password is hidden, the open one while it
// shows, in the secondary gray.
const eye = (name: "Mostrar contraseña" | "Ocultar contraseña") => screen.getByRole("button", { name });
const icon = (name: string) => screen.queryByTestId(`icon:${name}`, { includeHiddenElements: true });

describe("password eye", () => {
  test("a password field has the eye and a plain field does not", async () => {
    await render(<TextField label="Email" />);
    expect(icon("eye")).toBeNull();
    expect(icon("eye-closed")).toBeNull();
  });

  test("starts hidden, with the closed eye in gray", async () => {
    await render(<TextField label="Contraseña" password />);
    expect(icon("eye-closed")).toHaveProp("tintColor", theme.colors.textSecondary);
    expect(icon("eye")).toBeNull();
    expect(screen.getByLabelText("Contraseña")).toHaveProp("secureTextEntry", true);
  });

  test("showing the password opens the eye", async () => {
    await render(<TextField label="Contraseña" password />);
    await fireEvent.press(eye("Mostrar contraseña"));
    expect(icon("eye")).toHaveProp("tintColor", theme.colors.textSecondary);
    expect(icon("eye-closed")).toBeNull();
    expect(screen.getByLabelText("Contraseña")).toHaveProp("secureTextEntry", false);
  });

  test("hiding it again closes the eye", async () => {
    await render(<TextField label="Contraseña" password />);
    await fireEvent.press(eye("Mostrar contraseña"));
    await fireEvent.press(eye("Ocultar contraseña"));
    expect(icon("eye-closed")).toBeOnTheScreen();
    expect(screen.getByLabelText("Contraseña")).toHaveProp("secureTextEntry", true);
  });
});
