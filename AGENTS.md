# Agent guide

- Inspect the existing SkyOffice architecture before changing it.
- Keep React workspace UI and Phaser world logic separated.
- Put work-management and gamification rules in `server/studio` or shared types, not in Phaser scenes.
- Use shared types from `types/`; do not duplicate task, quest, boss or presence shapes.
- Keep XP, boss damage, level thresholds and unlocks config-driven.
- Complete task rewards through the idempotent domain transaction in `StudioStore.completeTask`.
- Prefer team/studio progression over employee productivity ranking or surveillance.
- Run the client build, server typecheck and domain tests after major changes.
- Update the concise docs when architecture or API behavior changes.
