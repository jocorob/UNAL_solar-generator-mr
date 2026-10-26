# Solar Generator

A responsive, Spanish-language static landing page for the portable solar-generator concept. The autonomy estimator runs entirely in the browser; no build step, backend, or package install is required.

## Run locally

From the repository root, start any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Publish on GitHub Pages

The workflow at `.github/workflows/pages.yml` publishes the repository root whenever a commit reaches `main`, or when manually started from the **Actions** tab.

1. In the repository, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Merge/push the site to `main` (or run **Deploy static site to GitHub Pages** from **Actions**).
4. Find the published URL in the workflow run or under **Settings → Pages**.

The site uses relative asset paths, so it works both at a user/organization Pages root and at a project Pages subpath. `.nojekyll` disables Jekyll processing.

> The calculator uses editable example capacity and load values for illustration. It does not represent verified product specifications.
