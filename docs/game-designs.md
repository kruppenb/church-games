# Game Design Reference

Detailed design notes for each game. Reference this when modifying game behavior or balance.

## Survivors — Progressive Weapon System

Weapons are **permanent passive effects** that fire automatically on timers. Each correct answer lets you pick a weapon to add or upgrade (max Lv3).

| Weapon | Lv1 | Lv2 | Lv3 |
|--------|-----|-----|-----|
| Fire Ring | AoE every 5s, 80px radius | Every 4s, 110px | Every 3s, 150px |
| Lightning | Chain 2 enemies every 6s | 3 enemies / 4.5s | 5 enemies / 3s |
| Holy Shield | Regen 1 HP every 10s | Every 7s | Every 4s |

**Difficulty scaling**: Enemies get progressively harder each question wave (not just on wrong answers):
- Enemy count per spawn: `1 + wave * 0.3`
- Enemy speed: `base * speedMultiplier * (1 + wave * 0.08)`
- Enemy size grows slightly each wave
- Wrong answers ADDITIONALLY stack: speed × 1.2, spawn × 2

**Win condition**: All questions consumed → victory. **Lose condition**: HP reaches 0.

**Question pool**: Little Kids = ~12 easy questions (~3.6 min). Big Kids = ~23 medium+hard (~6.9 min). If you ace everything, weapons outscale enemies by wave 9 (all Lv3).

## Promised Land — Shared HP + Loot

**Shared Party HP**: Sum of all hero HPs. Damage from wrong answers hits the pool, not individual heroes. Individual hero HP bars are NOT shown (would be misleading).

**Loot drops**: 40% chance after each battle victory. Items from the Armor of God:
- Sword of Truth (+10 ATK), Shield of Faith (+30 HP), Helmet of Salvation (+20 HP, +5 ATK), Belt of Truth (+8 ATK), Boots of Peace (+15 HP)

**Random events**: 30% chance between battles. Heal, damage, or stat boost effects.

**Enemy names**: Random from pool (Shadow of Doubt, Whisper of Fear, Spirit of Lies, etc.) — NOT the scene title.

**Battle flow**: Questions cycle through heroes (Warrior → Mage → Healer → repeat). Correct = hero attacks enemy. Wrong = enemy attacks party HP pool. Battle ends when enemy HP = 0 (victory) or all questions used (auto-victory) or party HP = 0 (defeat).

## Jeopardy — Feedback System

After answering, the question overlay transitions to a full-screen feedback overlay:
- **Correct**: Green checkmark, "Correct!", "+$VALUE" in gold with pop animation
- **Wrong**: Red X, "Wrong!", "The answer was: [correct answer]"

Both are tap-to-dismiss. Score only increases on correct answers. Daily Double doubles the value.

**Categories**: 3 fixed (Recall, Understanding, Application) + 1 from lesson theme (truncated at first dash) + "Challenge"

**Star thresholds**: $3000 = 3 stars, $2000 = 2 stars, otherwise 1 star.

## Bible Brawler — Streak Power-ups

Streak resets on wrong answer. Power-up level based on current streak:
- 0 streak: no power-up (white slash)
- 3+ streak: Fire power-up (orange glow, fire particles)
- 5+ streak: Lightning power-up (blue glow, lightning bolts, screen flash)

Boss battle on final wave (last question) — bigger enemy, dramatic intro, 30 HP damage on wrong.

## Escape Room — Timed Rooms

5 themed rooms, countdown timer (180s little-kids / 120s big-kids). Wrong answers lose 10 seconds. Room types cycle: Decode → Timeline → Search → Code → Final.

Stars: 0-1 wrong = 3 stars, 2-3 wrong = 2 stars, 4+ wrong = 1 star.

## True/False Questions

Pipeline generates true/false format with 4 options (e.g., "True", "True, and it's easy", "False", "False, only love friends"). This is intentional — forces kids to read qualifiers instead of 50/50 guessing.
