#!/usr/bin/env node
/**
 * Post-install check: verify bun is available.
 * bun is required to run TypeScript files in this package.
 */

const { spawn } = require("child_process");

function checkBun() {
  return new Promise((resolve) => {
    const proc = spawn("bun", ["--version"], { stdio: "pipe" });
    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        console.log(`✓ bun ${output.trim()} detected`);
        resolve(true);
      } else {
        console.error(
          "✗ bun is not installed. This package requires bun to run.\n" +
            "  Install: https://bun.sh\n" +
            "  Or use:  npm install -g bun"
        );
        resolve(false);
      }
    });
    proc.on("error", () => {
      console.error(
        "✗ bun is not installed. This package requires bun to run.\n" +
          "  Install: https://bun.sh\n" +
          "  Or use:  npm install -g bun"
      );
      resolve(false);
    });
  });
}

checkBun().then((ok) => {
  if (!ok) {
    process.exit(1);
  }
});
