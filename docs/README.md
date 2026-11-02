# Notes in docs/

The docs people read are at [gurtos.com/docs](https://gurtos.com/docs/) (source in `site/`), and each folder in the
repository has its own README. Start with the top-level [README](../README.md) and [core/README.md](../core/README.md).
This folder holds the design notes behind them, and a few records from the Cal Hacks 13.0 weekend where GurtOS began.

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
| [drill.md](drill.md) | GurtOS Business: stop every agent, undo the damage and carry on, with measured times |
| [pilot.md](pilot.md) | GurtOS Business: a one-week pilot plan using shadow mode |
| [images/](images/) | Images the top-level README uses |

`figma/` also holds the approved Figma frames the screens are built from: `os-v2/` (Server and the portal),
`personal-os/` (Personal), `phone-app/` and `business/`.

## Hackathon records

GurtOS was built at Cal Hacks 13.0 on Oct 24 and 25, 2026. The showcase at
[calhacks.gurtos.com](https://calhacks.gurtos.com) tells that story. These notes are kept as they were written, so their
deadlines and status lines describe that weekend, not `main` today.

| Note | What |
|---|---|
| [tracks.md](tracks.md) | The sponsor prize tracks entered and what each asked for |
| [figma.md](figma.md) | The Figma handoff to the portal work |
| [stagelog.md](stagelog.md) | The Figma stage log kept for the Figma track |

The weekend's other working notes (the UX and QA audits with their screenshots, the video project, the pitch script and
the design explorations) were removed from `main` afterwards. They are in the
[v0.2.0-preview tag](https://github.com/benz16107/gurtos/tree/v0.2.0-preview/docs).

Most apps in `tracks/` came from the same weekend, built for sponsor prizes. They stay in the repository and are off
until an owner turns them on.

### Videos

| Video | Link |
|---|---|
| GurtOS: operating systems built for AI agents | https://youtu.be/rREjU2ddIyo |
| Fetch.ai: ASI:One Agent Challenge | https://youtu.be/tcNbHb6XZuc |
| Figma: Best Workflow, Stage Log, Best Design and Most Creative | https://youtu.be/JI8PBEVwaCw |
| Hyphenate: Autonomous Systems for Finance | https://youtu.be/90iEnbJtJoU |
| Armadin: Best Security Hack | https://youtu.be/3hDnLuUqmjM |
| Anthropic: Claude used well for a specific group of people | https://youtu.be/a2nhBj9DhbI |
| Microsoft: Built for the Real World | https://youtu.be/gGdqKNtvopw |
| CRS: Best Identity/Fraud | https://youtu.be/691r_JcBD0c |
| Visa: Reimagining Shopping | https://youtu.be/iYQ-_am3c2g |
| Coinbase and Solana: x402 Payment Agents, Best use of Solana | https://youtu.be/DnD78KAapMo |
| Factory: Droid SDK | https://youtu.be/xH2J2BOVlK8 |
| Elastic: Agent Builder on Serverless | https://youtu.be/riaswviHD50 |
| Moss: Agents that remember you | https://youtu.be/hRFm65ZLO-g |
| Apify: Best Use of Apify | https://youtu.be/j6_SIkMPQYw |
| Atlassian, Track 1: agents that do the work | https://youtu.be/VEFBW-LRM94 |
| Atlassian, Track 2: security for agents acting for a user | https://youtu.be/VRVofDW0668 |
| Mana: Building with Mana | https://youtu.be/BrA67CzIOYg |
| SpacetimeDB: The core real-time backend | https://youtu.be/Jypa31_HdrM |
| Vultr: MLH, Best use of Vultr | https://youtu.be/EH7kyUofUOs |
