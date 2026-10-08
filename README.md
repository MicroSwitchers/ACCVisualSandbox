# AAC Visual Sandbox

A browser-based workspace for arranging AAC images, symbols, text, and folders into communication grids. Includes clinician editing, client play mode, Find-It, and Pop-Up Finder.

**[Open the app](https://microswitchers.github.io/ACCVisualSandbox/)**

## Getting started

1. Open the app and choose a configuration.
2. Add pictures, symbols, or text to the grid.
3. Use **Folders → New folder** to group related items. Choose a name and picture, then **Create & open**.
4. Adjust the layout and interaction settings, then switch to **Play** for the client view.
5. Hold the menu button for 1.5 seconds to return to editing.

Tap a populated card in either view to test its speech and selection behavior. With touch magnification enabled, hold and slide across cards, then release to select. The outline defaults to blue; its colour and an optional no-outline setting are available under Interaction.

Raise the **Cooldown** slider to ignore further presses for the chosen interval after a selection. The first selection behaves normally; ignored presses cannot start magnification, dwell, animation, or additional speech. They do not extend the interval or queue a selection. **Off** keeps normal repeated selection.

In the editor, drag the grip at a card's bottom-right corner to reposition it. Dropping onto another populated card swaps their positions. Use the move button to transfer an item to another folder.

Boards and settings are saved in the current browser using IndexedDB and localStorage. Use the app's import/export controls to transfer configurations between devices. Symbol searches use external services and require an internet connection.

## Local development

Use Node.js 22.12 or newer to install the development dependencies, run tests, and package the site:

```sh
npm ci
npm test
npm run build
```

To preview the app with Python installed:

```sh
python -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Open `http://127.0.0.1:5173/`. The app itself runs as a static website; Node.js is used for testing and packaging.

## Deployment

Push changes to `main`. GitHub Actions runs the regression tests, validates the JavaScript, packages the runtime files, and deploys to GitHub Pages. Pull requests run validation without publishing.

The Pages publishing source is **GitHub Actions**. Only the files packaged into `dist/` are published; development dependencies, scripts, and tests stay out of the deployed site.

For a manual deployment, open **Actions → Test and deploy → Run workflow**. When changing cached runtime assets, update `CACHE_NAME` in `sw.js` so existing installations receive the update.

## Project files

- `index.html`: main application, dialogs, board behavior, and games.
- `folder-system.js` / `folder-system.css`: folder creation, appearance, navigation, and moving items.
- `ui-polish.js` / `ui-polish.css`: interface styling, keyboard navigation, and dialog accessibility.
- `sw.js`, `manifest.json`, `icon.svg`: installable app and browser caching.
- `tests/`: automated regression tests.
- `scripts/build.cjs`: validated static-site packaging.
- `.github/workflows/pages.yml`: testing and deployment.

## Symbols and attribution

The app includes attribution for ARASAAC, Mulberry Symbols, Jellow, OpenMoji, and PiCom. These libraries have their own licenses; see the attribution links inside the app for each provider's terms.
