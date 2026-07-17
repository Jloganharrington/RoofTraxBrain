// Print an argon2 hash for the admin password, so the plaintext never touches
// the repo or a commit. Usage:
//   pnpm exec tsx scripts/hash-password.ts 'the-password'
// Paste the printed hash into the ADMIN_PASSWORD_HASH Replit Secret.
import argon2 from 'argon2';

const password = process.argv[2];
if (!password) {
  console.error("usage: tsx scripts/hash-password.ts '<password>'");
  process.exit(1);
}

const hash = await argon2.hash(password, { type: argon2.argon2id });
console.log(hash);
