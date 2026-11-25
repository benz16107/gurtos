// The Anthropic track: Claude used well for solo developers who leave agents running at home.
// Its code lives in the core (models, the second look) and in demo.ts (the measured attack test); the track itself
// has no slots. See README.md.
import type { Track } from '../../core/contract.ts';

export default {
  name: 'anthropic',
  title: 'Claude',
  description: 'The AI models your agents use. Pick the agent (Claude Code, Codex, opencode or Droid) and add a model key, which stays in the vault.',
} satisfies Track;
