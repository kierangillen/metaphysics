import Bluebird from 'bluebird';
import newrelic from 'artsy-newrelic';
import OpticsAgent from 'optics-agent';
import xapp from 'artsy-xapp';
import cors from 'cors';
import morgan from 'morgan';
import express from 'express';
import forceSSL from 'express-force-ssl';
import graphqlHTTP from 'express-graphql';
import bodyParser from 'body-parser';
import schema from './schema';
import loaders from './lib/loaders';
import config from './config';
import { info, error } from './lib/loggers';
import auth from './lib/auth';
import graphqlErrorHandler from './lib/graphql-error-handler';

global.Promise = Bluebird;

const {
  PORT,
  NODE_ENV,
  GRAVITY_API_URL,
  GRAVITY_ID,
  GRAVITY_SECRET,
} = process.env;

const app = express();
const port = PORT || 3000;

app.use(newrelic);

OpticsAgent.instrumentSchema(schema);
app.use(OpticsAgent.middleware());

if (NODE_ENV === 'production') {
  app.set('forceSSLOptions', { trustXFPHeader: true }).use(forceSSL);
}

xapp.on('error', (err) => {
  error(err);
  process.exit();
});

xapp.init({
  url: GRAVITY_API_URL,
  id: GRAVITY_ID,
  secret: GRAVITY_SECRET,
}, () => config.GRAVITY_XAPP_TOKEN = xapp.token);

app.get('/favicon.ico', (req, res) => {
  res
    .status(200)
    .set({ 'Content-Type': 'image/x-icon' })
    .end();
});

app.all('/graphql', (req, res) => res.redirect('/'));
auth(app);

app.use(bodyParser.json());
app.use('/', cors(), morgan('combined'), graphqlHTTP(request => {
  info('----------');

  loaders.clearAll();

  const accessToken = request.headers['x-access-token'];
  const userID = request.headers['x-user-id'];

  return {
    schema,
    graphiql: true,
    rootValue: {
      accessToken,
      userID,
    },
    formatError: graphqlErrorHandler(request.body),
    context: {
      opticsContext: OpticsAgent.context(request),
    },
  };
}));

app.listen(port, () => info(`Listening on ${port}`));
