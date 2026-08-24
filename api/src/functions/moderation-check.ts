import { app } from '@azure/functions';
import { getRuntimeHandlers } from '../lib/config';

app.http('leaderboardModerationCheck', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'moderation/check',
  handler: (request, context) => getRuntimeHandlers().check(request, context),
});
