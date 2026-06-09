/** Canonical loop release label (/health app_version, /loop chrome). Bump on every PR. */
export const LOOP_APP_VERSION_DEFAULT = "v0.21";

export const LOOP_APP_VERSION =
  (process.env.LOOP_APP_VERSION || "").trim() || LOOP_APP_VERSION_DEFAULT;
