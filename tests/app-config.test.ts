import appJson from "../app.json";
import iosIcon from "../assets/expo.icon/icon.json";
import pkgJson from "../package.json";

type PluginEntry = string | [string, Record<string, unknown>];

const { expo } = appJson;
const plugins = expo.plugins as PluginEntry[];
const adaptiveIcon = expo.android.adaptiveIcon as Record<string, unknown>;
const declared: Record<string, string> = {
  ...(pkgJson as { dependencies?: Record<string, string> }).dependencies,
  ...(pkgJson as { devDependencies?: Record<string, string> }).devDependencies,
};

const DARK_BACKGROUND = "#121116";

function pluginOptions(name: string): Record<string, unknown> | undefined {
  const entry = plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(entry) ? entry[1] : undefined;
}

describe("app.json appearance (RF-1, RF-2)", () => {
  test("restricts the app to the dark interface style", () => {
    expect(expo.userInterfaceStyle).toBe("dark");
  });

  test("uses the dark background for the root view", () => {
    expect(expo.backgroundColor).toBe(DARK_BACKGROUND);
  });

  test("registers the expo-system-ui plugin", () => {
    expect(plugins).toContain("expo-system-ui");
  });

  test("splash screen background is the dark background", () => {
    expect(pluginOptions("expo-splash-screen")?.backgroundColor).toBe(DARK_BACKGROUND);
  });

  test("android adaptive icon background is the dark color, without a background image", () => {
    expect(adaptiveIcon.backgroundColor).toBe(DARK_BACKGROUND);
    expect(adaptiveIcon).not.toHaveProperty("backgroundImage");
  });
});

describe("package.json dependencies (RF-16)", () => {
  test.each(["expo-device", "expo-glass-effect", "expo-symbols", "@expo/ui"])(
    "does not declare %s",
    (name) => {
      expect(declared).not.toHaveProperty(name);
    },
  );
});

// /feature 2026-11-18: the identity of the app, "Yema", and its icons drawn by scripts/generate-icons.py.
// The project has no Node types (only Jest's): fs is taken as Jest's real module, typed with what is used.
// Paths are relative to the root of the repo, where Jest runs.
const fs = jest.requireActual<{ readFileSync(path: string): Uint8Array; existsSync(path: string): boolean }>("fs");

/** Width and height of a PNG, from its IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = fs.readFileSync(path);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

describe("identity", () => {
  test("the app is called Yema, with its slug and its link scheme", () => {
    expect(expo.name).toBe("Yema");
    expect(expo.slug).toBe("yema");
    expect(expo.scheme).toBe("yema");
    expect((pkgJson as { name: string }).name).toBe("yema");
  });

  test.each([
    [expo.icon, 1024, 1024],
    [adaptiveIcon.foregroundImage as string, 512, 512],
    [adaptiveIcon.monochromeImage as string, 432, 432],
    [pluginOptions("expo-splash-screen")?.image as string, 480, 480],
    [expo.web.favicon, 48, 48],
  ])("%s exists and is %d × %d", (path, width, height) => {
    expect(pngSize(path)).toEqual([width, height]);
  });

  test("the splash shows the icon at 120 pt on the dark background", () => {
    expect(pluginOptions("expo-splash-screen")?.imageWidth).toBe(120);
  });

  test("the iOS icon is the Yema drawing on the dark background, without the Expo symbol", () => {
    expect(expo.ios.icon).toBe("./assets/expo.icon");
    const images = iosIcon.groups.flatMap((group) => group.layers.map((layer) => layer["image-name"]));
    expect(images).toEqual(["yema.png"]);
    expect(pngSize("./assets/expo.icon/Assets/yema.png")).toEqual([1024, 1024]);
    expect(fs.existsSync("./assets/expo.icon/Assets/expo-symbol 2.svg")).toBe(false);
    expect(iosIcon.fill).toEqual({ solid: "extended-srgb:0.07059,0.06667,0.08627,1.00000" });
  });
});

