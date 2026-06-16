/** Canonical loop release label (/health app_version, /loop chrome). CI bumps on PRs to main. */
export const LOOP_APP_VERSION_DEFAULT = "v0.34";

export const LOOP_APP_VERSION =
  (process.env.LOOP_APP_VERSION || "").trim() || LOOP_APP_VERSION_DEFAULT;
