import { app } from '@azure/functions';
import { getRuntimeHandlers } from '../lib/config';

app.http('leaderboardBoard', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'board/{weekKey}',
  handler: (request, context) => getRuntimeHandlers().board(request, context),
});
