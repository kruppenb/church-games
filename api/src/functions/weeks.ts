import { app } from '@azure/functions';
import { getRuntimeHandlers } from '../lib/config';

app.http('leaderboardWeeks', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'weeks',
  handler: (request, context) => getRuntimeHandlers().weeks(request, context),
});
