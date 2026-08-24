import { app } from '@azure/functions';
import { getRuntimeHandlers } from '../lib/config';

app.http('leaderboardEntry', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'entry/{weekKey}/{gameId}/{rowKey}',
  handler: (request, context) => getRuntimeHandlers().entry(request, context),
});
