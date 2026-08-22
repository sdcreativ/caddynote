import globals from "globals";
import tseslint from "typescript-eslint";
import compat from "eslint-plugin-compat";
import reactHooks from "eslint-plugin-react-hooks";

/** NFR-007 — lint APIs navigateur uniquement (pas le reste des règles ESLint). */
export default tseslint.config({
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["**/*.test.ts", "**/*.test.tsx", "src/test/**"],
  languageOptions: {
    parser: tseslint.parser,
    globals: globals.browser,
  },
  linterOptions: {
    reportUnusedDisableDirectives: "off",
  },
  plugins: { compat, "react-hooks": reactHooks },
  rules: {
    "compat/compat": "error",
    // Présent pour que les `eslint-disable-next-line react-hooks/*` du code
    // restent valides dans ce config isolé — la règle n'est pas appliquée ici.
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/rules-of-hooks": "off",
  },
});
