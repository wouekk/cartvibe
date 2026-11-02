# Contributing to CartVibe

CartVibe is a personal project maintained for one household and shared under the AGPL-3.0. Issues and pull requests are
welcome; replies come when time allows.

## Asking for a feature

Open an [issue](https://github.com/wouekk/cartvibe/issues/new/choose) with the feature request form. Describe what you
want to do, not how to build it. Feature requests land on the web app first: it is the reference product, and
[docs/FEATURES.md](docs/FEATURES.md) is the list of what it does. The form has an optional question, "Should the
iPhone app follow?", for features that would make sense in a pocket app too; it is a hint, not a promise.

## Sending code

- Work on a `feature/<name>` branch from `main` and open a pull request. [CLAUDE.md](CLAUDE.md) and the component guides
  (`api/CLAUDE.md`, `desktop/CLAUDE.md`) say how the code is organised and what is easy to break; [DESIGN.md](DESIGN.md)
  describes the look, and [docs/dev-setup.md](docs/dev-setup.md) the local toolchain.
- Write tests with the change. CI must be green.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- **A user-visible change updates two things in the same branch:**
  1. [docs/FEATURES.md](docs/FEATURES.md): add or edit the rows it touches, in plain words about what a person sees and
     can do (see the rules at the top of that file: no code, field or endpoint names, no screenshots, no prompt text).
  2. [CHANGELOG.md](CHANGELOG.md): the entry names the feature IDs it touches, for example *(LIST-16)*.

## Licence of contributions

Contributed code is licensed AGPL-3.0, like the rest of the web app, and stays in this repository. CartVibe for iPhone is
a separate app with its own code: nothing from this repository is copied into it, and it re-implements the behaviour
listed in [docs/FEATURES.md](docs/FEATURES.md) on its own. By sending a pull request you agree that your contribution is
licensed under the AGPL-3.0.
