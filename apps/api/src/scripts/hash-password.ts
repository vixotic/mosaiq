import { argon2id, hash } from "argon2";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Writable } from "node:stream";

let muted = false;
const hiddenOutput = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) stdout.write(chunk);
    callback();
  },
});
const terminal = createInterface({ input: stdin, output: hiddenOutput, terminal: true });

async function secretQuestion(prompt: string): Promise<string> {
  stdout.write(prompt);
  muted = true;
  const answer = await terminal.question("");
  muted = false;
  stdout.write("\n");
  return answer;
}

try {
  if (!stdin.isTTY) throw new Error("Run this command in an interactive terminal.");
  const password = await secretQuestion("Password: ");
  const confirmation = await secretQuestion("Confirm password: ");
  if (password.length < 12) throw new Error("Use a password of at least 12 characters.");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  stdout.write(`${await hash(password, { type: argon2id })}\n`);
} finally {
  terminal.close();
}
