#!/usr/bin/env node
import { randomBytes, pbkdf2 } from 'node:crypto';
import { promisify } from 'node:util';
import { emitKeypressEvents } from 'node:readline';

if (!process.stdin.isTTY) {
  process.stderr.write('Run this tool in an interactive terminal. Passwords must not be passed as arguments or saved in a file.\n');
  process.exit(1);
}

function hiddenPrompt(label) {
  process.stdout.write(label);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    let password = '';
    function listener(character, key) {
      if (key?.ctrl && ['c', 'd'].includes(key.name)) {
        process.stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      }
      if (key?.name === 'return' || key?.name === 'enter') {
        process.stdin.off('keypress', listener);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(password);
      } else if (key?.name === 'backspace') {
        password = [...password].slice(0, -1).join('');
      } else if (character && !key?.ctrl && !/[\u0000-\u001f\u007f]/.test(character)) {
        password += character;
      }
    }
    process.stdin.on('keypress', listener);
  });
}

let password = await hiddenPrompt('New password (20–256 characters; input is hidden): ');
let confirmation = await hiddenPrompt('Repeat password: ');
if (password.length < 20 || password.length > 256 || confirmation !== password) {
  process.stderr.write('Use at least 20 characters and enter the same password twice.\n');
  process.exit(1);
}
const salt = randomBytes(16);
const digest = await promisify(pbkdf2)(password, salt, 100000, 32, 'sha256');
password = '';
confirmation = '';
process.stdout.write(`pbkdf2-sha256$100000$${salt.toString('base64url')}$${digest.toString('base64url')}\n`);
