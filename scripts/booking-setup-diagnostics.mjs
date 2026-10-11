import { BOOKING_REPOSITORY } from "../assets/js/booking-access.mjs";

const repositoryURL = `https://api.github.com/repos/${BOOKING_REPOSITORY}`;
const databaseURL = `${repositoryURL}/contents/bookings.json`;
const stages = {
  "repository-check": "repository check",
  "database-read": "booking file read",
  "database-write": "booking file write",
};

function stageFor(url, options) {
  const method = options?.method ?? "GET";
  if (url === repositoryURL && method === "GET") return "repository-check";
  if (url === `${databaseURL}?ref=main` && method === "GET") return "database-read";
  if (url === databaseURL && method === "PUT") return "database-write";
  return null;
}

// Retain only a fixed stage and an HTTP status. Credentials, error bodies,
// headers and underlying exception messages never enter these diagnostics.
export function createSetupDiagnostics(fetchImpl = globalThis.fetch) {
  let failure = null;

  async function fetch(url, options) {
    const stage = stageFor(url, options);
    try {
      const response = await fetchImpl(url, options);
      if (stage) {
        const status = response?.status;
        failure = Number.isInteger(status) && status >= 100 && status <= 599 && (status < 200 || status >= 300)
          ? { stage, status }
          : null;
      }
      return response;
    } catch (error) {
      if (stage) failure = { stage, networkFailed: true };
      throw error;
    }
  }

  function explain() {
    if (!failure) return "";
    const stage = stages[failure.stage];
    if (failure.networkFailed) {
      return `The connection to GitHub failed during the ${stage}. Check your internet connection and whether Node.js can reach api.github.com. If you use a proxy or a managed network, ask its administrator to check the proxy and TLS configuration. Do not disable certificate verification.`;
    }
    const { status } = failure;
    const prefix = `GitHub returned HTTP ${status} during the ${stage}.`;
    if (status === 401) {
      return `${prefix} The token is invalid, expired or revoked. Create a new fine-grained token for CSDUlm/csd-room-reservations and paste it only into the hidden terminal prompt.`;
    }
    if (status === 404 && failure.stage === "repository-check") {
      return `${prefix} GitHub does not let this token see the private booking repository. Check Resource owner: CSDUlm and Only select repositories: csd-room-reservations in the token settings. A token awaiting organisation approval cannot access private repositories.`;
    }
    if (status === 404 && failure.stage === "database-read") {
      return `${prefix} Check that bookings.json exists on the main branch and that this token selects csd-room-reservations with Contents access. GitHub can report an inaccessible private file as missing.`;
    }
    if (status === 403 && failure.stage === "database-write") {
      return `${prefix} Set the token's Contents permission to Read and write. If it already has that permission, check organisation approval, token policies and rules protecting the main branch.`;
    }
    if (status === 403) {
      return `${prefix} Check that the token has been approved for the organisation, selects csd-room-reservations and has Contents: Read and write. Organisation token policies may also deny access.`;
    }
    if (status === 404) {
      return `${prefix} Check that the token selects csd-room-reservations with Contents: Read and write and that bookings.json exists on the main branch.`;
    }
    if (status === 429) return `${prefix} GitHub is limiting requests. Wait before trying again.`;
    if (status === 409) return `${prefix} Another update prevented write verification. Try setup again after the current update finishes.`;
    if (status === 422) return `${prefix} GitHub refused the requested file update. Check the repository configuration and any rules protecting the main branch.`;
    if (status >= 500) return `${prefix} GitHub may be temporarily unavailable. Try again later.`;
    return `${prefix} Check the dedicated repository's token permissions and try again.`;
  }

  return { fetch, explain };
}
