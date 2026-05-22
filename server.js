const { server, connectDatabase } = require('./app');

connectDatabase()
  .then(() => {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      const logger = require('./utils/logger');
      logger.info({ event: 'server_started', url: `http://localhost:${PORT}` });
    });
  })
  .catch(() => {
    process.exit(1);
  });