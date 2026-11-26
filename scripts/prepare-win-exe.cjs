const path = require("node:path");
const { rcedit } = require("rcedit");

module.exports = async ({ appOutDir, electronPlatformName, packager }) => {
  if (electronPlatformName !== "win32") return;

  const executable = path.join(appOutDir, `${packager.appInfo.productFilename}.exe`);
  const icon = path.join(packager.projectDir, "build", "icon.ico");
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rcedit(executable, { icon });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
};
