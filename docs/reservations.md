# GitHub-only room agenda

The hidden agenda is at <https://csdulm.github.io/reservations/> (French: append `?lang=fr`). It supports week, day, month, room and list views, room filters, search, work hours or the full day, and creation, editing and deletion of reservations. Times are interpreted in Europe/Paris, including daylight-saving changes. A reservation lasts between one minute and seven days. Two reservations in the same room cannot overlap; consecutive reservations can meet at their boundary.

The four rooms are Salle réunion, Salle réunion bis, Salle visio café and Salle visio couloir. The page is excluded from the navigation and sitemap and has a no-index directive. Its URL is not an access control: the encrypted access credential and private GitHub repository provide the protection. To avoid ambiguous calendar entries, booking endpoints in the repeated autumn hour (02:00–02:59) are rejected; reservations may span the time change with unambiguous endpoints.

## Deployment

The separate **private** repository [CSDUlm/csd-room-reservations](https://github.com/CSDUlm/csd-room-reservations) has been created with an empty `bookings.json` database on `main`. Booking names and times are never put in the public website repository or Pages output. Do not make the booking repository public.

An administrator must perform one final local credential setup. Agenda users only need the resulting shared password; they do not need a GitHub account.

1. In [GitHub's fine-grained token settings](https://github.com/settings/personal-access-tokens/new), create a dedicated token with resource owner **CSDUlm**. Select **Only select repositories → csd-room-reservations**. Give **Contents: Read and write** and the automatically required **Metadata: Read**; no other permissions. Set an expiry of 90 days or less and obtain organisation approval if requested. Never select the public website repository, all repositories, or a classic token. GitHub may require organisational approval before the token works.
2. In a private local terminal, run `node scripts/setup-bookings.mjs`. Follow its prompts and paste the dedicated token into its hidden input. Do not paste tokens or the generated shared password into chat, command-line arguments, Actions logs, tickets or documentation. The setup script checks that the repository is private and the existing database is valid; GitHub does not expose the token's complete repository selection, so the permission confirmation is essential.
3. Save the randomly generated shared password in a password manager when the setup script displays it. The script writes only the encrypted envelope to `data/booking-access.json`; it never writes the plaintext token or password to disk.
4. Run `npm run check`, commit the changed `data/booking-access.json`, and push to `main`. GitHub Actions publishes the envelope with the page. Test unlocking and creating/removing a short test reservation, then share the password privately with the intended users.

Until that setup is completed, the page explicitly says access is not configured and disables its password form. No demonstration data or simulated saves are presented to users.

## Security model

**The password is not stored on GitHub, even encrypted.** A randomly generated password with 192 bits of entropy derives an AES-256-GCM key using PBKDF2-HMAC-SHA256 with 600,000 iterations and a fresh salt. The resulting encrypted envelope contains only the dedicated booking credential and its repository details. Authentication of the ciphertext detects tampering. Changing the encryption algorithm or cost requires a new envelope format.

The public encrypted file permits offline password guessing. The randomly generated high-entropy password is therefore mandatory; a short memorable password is unsafe for this design. HTTPS protects transport. The password and decrypted credential stay in page memory, are never put into browser storage, and are discarded when the user locks the agenda, reloads, or the 30-minute session expires. Password field contents are cleared immediately after submission. Browser extensions, compromised devices or malicious site code could still read secrets while the agenda is open; keep the repository and administrator accounts protected with strong authentication.

All holders of the shared password have the **same authority** to read, create, change and delete every booking. “Reserved by” is a label supplied by users, not an authenticated identity. A holder can recover the decrypted GitHub credential and use the GitHub API directly; browser validation is consequently not server-enforced. Restricting the token to this single private booking repository limits that authority and prevents it from changing the public site or seminar archive. This is a shared cryptographic capability, not a server-side password login. GitHub's own API rate limits apply, but there is no password-attempt throttle on a static website.

The client validates the complete database before displaying it, renders supplied text as text, and rejects overlapping bookings. Saves read the latest GitHub file revision and use conditional writes, retrying a conflicting commit only after fetching and validating again. Individual booking revisions prevent an edit or deletion from overwriting someone else's concurrent change. Refresh runs only while the page is visible. Failed network requests do not claim that a booking was saved.

## Rotation, revocation and backups

To revoke access, **revoke the old GitHub token first** in the administrator's token settings, create a new restricted token, and rerun local setup to generate a new shared password and encrypted envelope. Commit and publish the new envelope, then distribute the new password privately. Merely changing the password does not invalidate credentials already recovered by previous users. Old ciphertext remains in public Git history, so the corresponding old token must be revoked. An expired or revoked token stops reads and writes until a replacement is published.

Git history in the private booking repository preserves deleted and edited reservations. Administrators and anyone holding the shared booking credential can inspect that history, including deleted bookings. Treat names as personal information and apply the centre's retention policy to this private repository. Archive old entries before the file exceeds 5,000 reservations or 950 KiB. Do not copy a real booking database into public tests or screenshots.

## References

- [GitHub Pages serves static files](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
- [GitHub's REST API supports browser requests](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests).
- [Contents API permissions and conditional file updates](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents).
- [Keep API credentials secure](https://docs.github.com/en/rest/authentication/keeping-your-api-credentials-secure); GitHub recommends against sharing personal tokens. The encrypted shared capability here is an explicit tradeoff of the requested GitHub-only, account-free workflow.
- [Token expiration and revocation](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation).
