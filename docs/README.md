# Notes in docs/

The docs people read are at [gurtos.com/docs](https://gurtos.com/docs/) (source in `site/`), and each folder in the
repository has its own README. Start with the top-level [README](../README.md) and [core/README.md](../core/README.md).
This folder holds the design notes behind them.

## Design notes

These are kept current.

| Note | What |
|---|---|
| [self-host.md](self-host.md) | Run your own relay, push gateway and web app, and point boxes at them |
| [design/agent-setup.md](design/agent-setup.md) | Why setup from another computer works the way it does. The how-to is [AGENT-SETUP.md](../AGENT-SETUP.md) |
| [perf/filesystem.md](perf/filesystem.md) | The file path for agents on GurtOS Personal, measured, with the options for making it faster |
| [ux/words.md](ux/words.md) | One word for each thing, on every screen. When a screen and this list disagree, the screen changes |
| [ux/parity.md](ux/parity.md) | GurtOS Personal beside stock Ubuntu 24.04 Desktop for everyday use |
| [figma/system.md](figma/system.md) | The design system every screen is built from: the box's screen, the portal, the phone and Personal |
| [figma/tokens/](figma/tokens/) | The design tokens exported from Figma, and the check that the portal's CSS still matches them |
| [figma/compare/](figma/compare/README.md) | Each Figma frame beside a screenshot of the real app, with the pixels that differ |
| [figma/playbook.md](figma/playbook.md) | How GurtOS was designed with an agent driving Figma, step by step |
| [images/](images/) | Images the top-level README uses |

`figma/` also holds the approved Figma frames the screens are built from: `os-v2/` (Server and the portal),
`personal-os/` (Personal), `phone-app/` and `business/`.
