import { app } from '@azure/functions';
import { getRuntimeHandlers } from '../lib/config';

app.http('leaderboardScore', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'score/{gameId}',
  handler: (request, context) => getRuntimeHandlers().score(request, context),
});
