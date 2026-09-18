// eslint-config-next ships native ESLint 9 flat-config arrays (see
// node_modules/eslint-config-next/dist/*.js — module.exports is already a
// flat config array). Import them directly rather than through
// @eslint/eslintrc's FlatCompat, which expects legacy-style shareable
// configs and throws a circular-structure error on these.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript];

export default eslintConfig;
