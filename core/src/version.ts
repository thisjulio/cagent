declare const CAGENT_RELEASE: boolean;
declare const CAGENT_VERSION: string;

export const IS_RELEASE =
  typeof CAGENT_RELEASE === "boolean" ? CAGENT_RELEASE : false;
export const VERSION =
  typeof CAGENT_VERSION === "string" ? CAGENT_VERSION : "dev";
