# Releasing

Publishing is automated: **pushing a `vX.Y.Z` git tag** triggers the
[`Release`](.github/workflows/release.yml) workflow, which builds, tests, and
publishes every public `@ai-gui/*` package to npm.

## One-time setup

1. **Create the GitHub repo** and add it as the remote (update the `repository`
   URL in each `package.json` if it differs from `github.com/liliang-cn/aigui`):
   ```bash
   git remote add origin git@github.com:<owner>/aigui.git
   git push -u origin main
   ```
2. **Own the `@ai-gui` npm scope** (or rename the packages to a scope you own),
   and be a member able to publish to it.
3. **Add the npm token as a repository secret** named `NPM_TOKEN`
   (Settings → Secrets and variables → Actions → New repository secret), or:
   ```bash
   gh secret set NPM_TOKEN
   ```
   Use an **Automation** token (npmjs.com → Access Tokens). Never commit it.

## Cutting a release

1. Record changes and bump versions with changesets:
   ```bash
   pnpm changeset            # describe the change, pick bump levels
   pnpm changeset version    # applies bumps to package.json + writes CHANGELOGs
   git commit -am "release: vX.Y.Z"
   ```
   For the initial `0.1.0` publish, the package versions are already correct, so
   do not run `changeset version`. Start recording changesets after that release.
2. Tag and push — this is what triggers publishing:
   ```bash
   git tag vX.Y.Z            # match the version in package.json
   git push origin main --tags
   ```

The `Release` workflow then publishes to npm using the `NPM_TOKEN` secret.
`pnpm -r publish` skips any package already at its current version, so
re-running a tag is safe.

## Notes

- The tag only **triggers** the release; the actual published versions come from
  each `package.json`. The workflow rejects non-semver tags and tags that do not
  match the single version shared by all public packages.
- `--provenance` is enabled; it requires a public repo + the `id-token: write`
  permission (already set in the workflow).
- Before publishing, the workflow builds, typechecks, tests, runs `publint`, and
  verifies each packed tarball contains working ESM, CommonJS, and type exports.
