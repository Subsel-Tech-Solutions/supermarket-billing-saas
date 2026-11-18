const assert = require("assert");
const { sequelize } = require("../config/database");
const { app } = require("../server");

(async () => {
  const originalQuery = sequelize.query;
  const originalConsoleError = console.error;
  const details = "ER_ACCESS_DENIED_ERROR: password rejected for db-user at db.internal";
  let loggedError;
  let server;

  try {
    sequelize.query = async () => {
      throw new Error(details);
    };
    console.error = (...args) => {
      loggedError = args;
    };

    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/health`);
    const body = await response.json();

    assert.strictEqual(response.status, 503);
    assert.deepStrictEqual(body, { status: "DEGRADED", database: "down", message: "Health check failed" });
    assert.strictEqual(JSON.stringify(body).includes(details), false);
    assert.strictEqual(loggedError[0], "Health check database query failed:");
    assert.strictEqual(loggedError[1].message, details);
    console.log("✓ Public health endpoint hides raw database errors and logs diagnostics");
  } catch (err) {
    console.error("✗ Public health endpoint error handling\n", err);
    process.exitCode = 1;
  } finally {
    sequelize.query = originalQuery;
    console.error = originalConsoleError;
    if (server) await new Promise((resolve) => server.close(resolve));
  }
})();
