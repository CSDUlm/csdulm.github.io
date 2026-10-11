#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { emitKeypressEvents } from "node:readline";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { BOOKING_REPOSITORY, sealBookingAccess, openBookingSession } from "../assets/js/booking-access.mjs";

const destination = new URL("../data/booking-access.json", import.meta.url);
const temporary = new URL(`../data/.booking-access.${randomBytes(8).toString("hex")}.encrypted.tmp`, import.meta.url);
if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY) {
  process.stderr.write("Run node scripts/setup-bookings.mjs in your own interactive terminal. Do not pass credentials as arguments or environment variables.\n");
  process.exit(1);
}

emitKeypressEvents(process.stdin);
function prompt(label, hidden = false) {
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise(resolve => {
    let value = "";
    function listener(character, key) {
      if (key?.ctrl && ["c", "d"].includes(key.name)) { process.stdin.setRawMode(false); process.stdout.write("\n"); process.exit(130); }
      if (["return", "enter"].includes(key?.name)) {
        process.stdin.off("keypress", listener);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(value);
      } else if (key?.name === "backspace") {
        if (value && !hidden) process.stdout.write("\b \b");
        value = [...value].slice(0, -1).join("");
      } else if (character && !key?.ctrl && !/[\u0000-\u001f\u007f]/.test(character) && value.length < 512) {
        value += character;
        if (!hidden) process.stdout.write(character);
      }
    }
    process.stdin.on("keypress", listener);
  });
}

let token = "", password = "", client;
try {
  process.stdout.write(`This tool publishes an encrypted credential for ${BOOKING_REPOSITORY} only.\nCreate a fine-grained GitHub token with ONLY that selected private repository,\nContents: read and write, and no other optional permissions. Set a bounded expiry.\nEvery shared-password holder can recover this repository credential.\nNever use your normal GitHub credential or a token that can modify the website.\n\n`);
  process.stdout.write("Setup will verify write permission by committing the existing file unchanged.\nNo reservations will be added, removed, or modified.\n\n");
  const confirm = await prompt('Type "ONLY booking repository" to confirm those token permissions: ');
  if (confirm !== "ONLY booking repository") throw new Error("permission-confirmation");
  const previous = JSON.parse(await readFile(destination, "utf8"));
  if (previous.configured === true) {
    process.stdout.write("Changing the password alone does not revoke tokens extracted earlier or old encrypted files in Git history.\n");
    if (await prompt('Revoke the previous GitHub token first, then type "PREVIOUS token revoked": ') !== "PREVIOUS token revoked") throw new Error("rotation-confirmation");
  }
  const date = await prompt("Token expiry date as set in GitHub (YYYY-MM-DD): ");
  const expiresAt = `${date}T00:00:00.000Z`, expiry = Date.parse(expiresAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(expiry) || new Date(expiry).toISOString() !== expiresAt || expiry <= Date.now() || expiry - Date.now() > 90 * 86400000) throw new Error("expiry");
  token = await prompt("Fine-grained token (hidden): ", true);
  password = randomBytes(24).toString("base64url");
  const envelope = await sealBookingAccess({ repository: BOOKING_REPOSITORY, branch: "main", path: "bookings.json", token, expiresAt }, password);
  token = "";
  client = await openBookingSession(envelope, password);
  await client.verifyWriteAccess(); // Preserve exact file bytes while proving read/write permission.
  client.close();
  client = null;
  await writeFile(temporary, `${JSON.stringify(envelope, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporary, destination);
  process.stdout.write(`\nSave this shared password in your password manager now. It is displayed only here:\n\n${password}\n\n`);
  password = "";
  process.stdout.write("Only the encrypted credential was saved in data/booking-access.json.\nCommit and push that file to activate /reservations/. No visitor needs a GitHub account.\nAccess stops at 00:00 UTC on the entered expiry date; renew before then.\nTo change access later, revoke this token and rerun this tool with a new token.\n");
} catch (error) {
  const explanations = {
    "permission-confirmation": "The repository-only permission confirmation is required.",
    "rotation-confirmation": "Revoke the previous token before publishing a replacement.",
    expiry: "Enter a valid future expiry date no more than 90 days away.",
    unconfigured: "Use a fine-grained github_pat_ token for the dedicated booking repository.",
    unavailable: "Could not verify access to the dedicated private booking repository. Check the token and connection.",
    "rate-limited": "GitHub temporarily limited requests. Try again later.",
    "invalid-data": "The private bookings.json file is missing, malformed, or too large. No credential was published.",
    expired: "The credential has expired. Create a replacement token.",
  };
  process.stderr.write(`${explanations[error.code || error.message] || "Setup could not finish. No secret was printed. Check the private repository and try again."}\n`);
  process.exitCode = 1;
} finally {
  token = "";
  password = "";
  client?.close();
  process.stdin.setRawMode(false);
  process.stdin.pause();
  await unlink(temporary).catch(() => {});
}
