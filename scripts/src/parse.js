const COMMENT_PREFIX = "!";
const ELEMENT_HIDE_SEPARATOR = "##";
const ELEMENT_HIDE_EXCEPTION_SEPARATOR = "#@#";
const BLOCK_PREFIX = "||";
const EXCEPTION_PREFIX = "@@";
const OPTION_SEPARATOR = "$";

const EXTENDED_SELECTOR_SEPARATOR = "#?#";
const SNIPPET_SEPARATOR = "#$#";

const RESOURCE_TYPE_MAP = {
  script: "script",
  stylesheet: "stylesheet",
  image: "image",
  font: "font",
  media: "media",
  object: "object",
  subdocument: "sub_frame",
  document: "main_frame",
  xmlhttprequest: "xmlhttprequest",
  websocket: "websocket",
  ping: "ping",
  other: "other",
};

const isRule = (line) =>
  Boolean(line) &&
  !line.startsWith(COMMENT_PREFIX) &&
  !line.startsWith("[Adblock");
const isException = (line) => line.startsWith(EXCEPTION_PREFIX);
const isElementHide = (line) => line.includes(ELEMENT_HIDE_SEPARATOR);
const isElementHideException = (line) =>
  line.includes(ELEMENT_HIDE_EXCEPTION_SEPARATOR);
const isExtended = (line) =>
  line.includes(EXTENDED_SELECTOR_SEPARATOR) || line.includes(SNIPPET_SEPARATOR);

const parseOptions = (raw) =>
  (raw || "")
    .split(",")
    .filter(Boolean)
    .map((opt) => {
      if (opt.includes("=")) return opt.split("=");
      if (opt.startsWith("~")) return [opt.slice(1), false];
      return [opt, true];
    });

const splitDomains = (value) => {
  const entries = value.split("|").filter(Boolean);
  const includes = [];
  const excludes = [];
  for (const entry of entries) {
    if (entry.startsWith("~")) excludes.push(entry.slice(1).toLowerCase());
    else includes.push(entry.toLowerCase());
  }
  return { includes, excludes };
};

// Convert one network-filter line (block or exception) into a DNR condition+action,
// or return null if the line uses options we don't support.
const parseNetworkRule = (line) => {
  const exception = isException(line);
  const body = exception
    ? line.slice(EXCEPTION_PREFIX.length)
    : line;

  const [pattern, optionsRaw] = body.split(OPTION_SEPARATOR);
  if (!pattern) return null;

  const condition = {};
  const resourceTypes = new Set();
  const excludedResourceTypes = new Set();
  let resourceMode = null; // "include" | "exclude"

  for (const [key, value] of parseOptions(optionsRaw)) {
    switch (key) {
      case "domain": {
        const { includes, excludes } = splitDomains(String(value));
        if (includes.length) condition.initiatorDomains = includes;
        if (excludes.length) condition.excludedInitiatorDomains = excludes;
        break;
      }
      case "third-party":
        condition.domainType = value === false ? "firstParty" : "thirdParty";
        break;
      case "first-party":
        condition.domainType = value === false ? "thirdParty" : "firstParty";
        break;
      case "script":
      case "stylesheet":
      case "image":
      case "font":
      case "media":
      case "object":
      case "subdocument":
      case "document":
      case "xmlhttprequest":
      case "websocket":
      case "ping":
      case "other": {
        const mapped = RESOURCE_TYPE_MAP[key];
        if (value === false) {
          if (resourceMode === "include")
            throw new Error(`Mixed resource includes/excludes in: ${line}`);
          resourceMode = "exclude";
          excludedResourceTypes.add(mapped);
        } else {
          if (resourceMode === "exclude")
            throw new Error(`Mixed resource includes/excludes in: ${line}`);
          resourceMode = "include";
          resourceTypes.add(mapped);
        }
        break;
      }
      case "popup":
      case "generichide":
      case "genericblock":
      case "elemhide":
        // No DNR analog; drop the rule rather than silently mis-translate.
        return null;
      case "important":
      case "match-case":
        // Ignore — DNR has no equivalent and behavior is close enough.
        break;
      default:
        // Unknown option (csp=, redirect=, removeparam=, etc.) — drop.
        return null;
    }
  }

  if (resourceTypes.size) condition.resourceTypes = [...resourceTypes];
  else if (excludedResourceTypes.size)
    condition.excludedResourceTypes = [...excludedResourceTypes];

  condition.urlFilter = pattern;

  return {
    action: { type: exception ? "allow" : "block" },
    condition,
  };
};

const parseElementHide = (line) => {
  const isException = isElementHideException(line);
  const sep = isException
    ? ELEMENT_HIDE_EXCEPTION_SEPARATOR
    : ELEMENT_HIDE_SEPARATOR;
  const idx = line.indexOf(sep);
  const domainPart = line.slice(0, idx);
  const selector = line.slice(idx + sep.length).trim();
  if (!selector) return null;

  const domains = domainPart
    ? domainPart.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)
    : [];

  // Drop pure-exclusion rules (rare in cookie lists; we have no negative-domain CSS primitive).
  if (domains.length && domains.every((d) => d.startsWith("~"))) return null;

  const positiveDomains = domains.filter((d) => !d.startsWith("~"));

  return {
    kind: isException ? "hide-exception" : "hide",
    domains: positiveDomains,
    selector,
  };
};

export function parseLine(line) {
  if (!isRule(line)) return null;
  if (isExtended(line)) return null;

  if (isElementHide(line) || isElementHideException(line)) {
    return parseElementHide(line);
  }
  const net = parseNetworkRule(line);
  return net ? { kind: "network", ...net } : null;
}

export function parseAll(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .map(parseLine)
    .filter(Boolean);
}
