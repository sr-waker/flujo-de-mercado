const { onRequest } = require('firebase-functions/v2/https');
  const server = import('firebase-frameworks');
  exports.ssrstudio20124615222739 = onRequest({}, (req, res) => server.then(it => it.handle(req, res)));
  