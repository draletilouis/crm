const config = require('./src/config');
const { migrate } = require('./src/migrate');
const { bootstrapManager } = require('./src/routes/auth');
const { createApp } = require('./src/app');

async function main() {
  await migrate();
  await bootstrapManager();
  const app = createApp();
  app.listen(config.port, () => console.log(`Lefori Sales listening on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
