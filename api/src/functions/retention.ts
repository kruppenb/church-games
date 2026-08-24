import { app } from '@azure/functions';
import { getRuntimeHandlers } from '../lib/config';

// Monday 10:00 UTC ~ Monday 03:00 Pacific — well clear of the Sunday rollover.
app.timer('leaderboardRetention', {
  schedule: '0 0 10 * * 1',
  runOnStartup: false,
  handler: async (_timer, context) => {
    await getRuntimeHandlers().retention(context);
  },
});
