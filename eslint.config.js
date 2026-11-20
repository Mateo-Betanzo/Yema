const { defineConfig, globalIgnores } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const jestGlobals = {
  jest: "readonly",
  describe: "readonly",
  it: "readonly",
  test: "readonly",
  expect: "readonly",
  beforeAll: "readonly",
  beforeEach: "readonly",
  afterAll: "readonly",
  afterEach: "readonly",
};

module.exports = defineConfig([
  // The Edge Functions run on Deno (npm: imports, Deno globals); their logic (prompt.ts) is linted as usual.
  globalIgnores(["dist/*", ".expo/*", ".claude/*", "node_modules/*", "supabase/functions/**/index.ts"]),
  expoConfig,
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: { globals: jestGlobals },
  },
]);
