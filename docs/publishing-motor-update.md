# Publish the motor update to GitHub

The cumulative `motor-coil-shapes.patch` contains all motor feature commits,
terminal options and the README/gallery update. The installer ZIP is for KiCad;
use the patch to update the source repository.

## Apply the patch and push

Install Git and [GitHub CLI](https://cli.github.com/), then download the latest
patch into a folder. Open a terminal in that folder (Git Bash works on Windows).
The fresh clone below avoids duplicating commits in an existing checkout.

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
git clone https://github.com/jonahsaunders/planar-studio.git planar-studio-updated
cd planar-studio-updated
git switch -c feat/motor-families
git am ../motor-coil-shapes.patch
git push -u origin feat/motor-families
gh pr create --base main --head feat/motor-families --title "Add motor families, coil shapes and terminal options" --body "Adds four motor families, configurable coil shapes and terminal breakouts, validation, guides, and an updated README gallery."
```

Sign in as the GitHub account with write access to this repository. Complete
the browser sign-in on your computer; do not paste credentials into chat.
If Git asks for a commit identity, set your own name and email with
`git config user.name "Your Name"` and `git config user.email "YOUR_EMAIL"`,
then retry the failed `git am` command. Use your GitHub noreply address if you
want to keep your personal email private.

This patch was prepared against main commit
`b6fd0277cc987dc8ee32177711f36e99768949f7`. If main has changed and `git am`
reports a conflict, resolve it and run `git am --continue`, or run
`git am --abort` to return to the pre-application state. Do not force-push to
main. If you already applied an earlier cumulative patch, start with this fresh
clone instead of applying all the same commits a second time.

The push publishes the branch. Open the pull request URL printed by `gh`, review
the changes and CI results, and merge it into `main` when ready. The repository
homepage displays the updated README after that merge; until then the gallery
is visible on the feature branch. This does not publish a separate GitHub Pages
site or create a downloadable GitHub release.

## Capture actual application screenshots

The supplied README currently uses accurately labeled generated geometry
previews. Fresh UI screenshots could not be captured in the restricted cloud
browser. To capture them on your computer, run these commands inside the clone:

```sh
npm ci
npx playwright install chromium
npm run shots:motor
```

You also need Python 3 available as `python3` (macOS/Linux) or `python` (Windows).
If needed, set the `PYTHON` environment variable to your Python executable.
The script launches Planar Studio's local preview, captures the original rotary
motor and all four new families, and replaces the README gallery only after all
five captures succeed. It does not require a live KiCad board. Screenshots show
the browser application; they are not evidence of physical motor validation.

Review the images and README, then add them to the same branch:

```sh
git add README.md docs/screenshot-motor*.png
git commit -m "Refresh motor workspace screenshots"
git push
```

The existing pull request updates automatically. You can also run this capture
step before the first push and pull-request creation.

For the code checks use `npm test` and `npm run test:motor:dom`. To make an
installer from the checkout run `npm run build`; it writes
`dist/planar-studio-1.3.0.zip`.

Official references: [GitHub authentication](https://cli.github.com/manual/gh_auth_login),
[pushing commits](https://docs.github.com/en/get-started/using-git/pushing-commits-to-a-remote-repository),
and [creating a pull request](https://cli.github.com/manual/gh_pr_create).
