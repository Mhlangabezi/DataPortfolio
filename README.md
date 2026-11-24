# Portfolio site

A plain HTML, CSS and JavaScript site for GitHub Pages. No build step.

| File | What it is |
| --- | --- |
| `index.html` | Your page: hero, results, experience, skills, tools, education, blog, contact. Edit the text here. |
| `style.css` | Colours, fonts and layout. |
| `app.js` | Blog, owner sign-in and the post composer. |
| `posts.json` | Your blog posts. The composer edits this file for you. |
| `images/` | Appears by itself the first time you publish a post with a picture. |

## 1. Put it on GitHub Pages

1. On GitHub, create a new repository. Naming it `your-username.github.io` gives you the shortest address, `https://your-username.github.io`.
2. Choose Add file, then Upload files, drag in `index.html`, `style.css`, `app.js` and `posts.json`, and commit.
3. Open Settings, then Pages. Under Build and deployment choose Deploy from a branch, pick `main` and `/ (root)`, and save.
4. After a minute or two the site is live at the address Pages shows you.

## 2. Make a token so only you can post

1. On GitHub open Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens.
2. Choose Generate new token and name it `Portfolio posting`.
3. Under Repository access choose Only select repositories and pick your site's repository.
4. Under Permissions open Repository permissions and set Contents to Read and write.
5. Generate the token and copy it. GitHub shows it once.

## 3. Post from the live site

1. At the bottom of your site, choose Owner sign-in.
2. Enter your repository as `your-username/your-repository` and paste the token.
3. Choose New post. Add a title (optional), the text, links and pictures, then Publish.

Everything is saved to your repository as one commit. The public site shows it after GitHub Pages rebuilds, usually within a minute. You see it straight away while signed in.

Each post has Edit and Delete. Deleting a post also deletes its pictures from the repository.

## Writing a post

- A blank line starts a new paragraph.
- `## Heading` makes a heading and `- item` makes a bullet.
- `[text](https://address)` makes a link. A bare web address also becomes a link.
- `` `code` `` makes inline code. Three backticks on their own line, before and after, make a code block.
- Pictures can be JPEG, PNG, WebP or GIF. Big ones are shrunk to 1600 pixels on the longest side first.
- Leave the title empty for a quick update.

## Who can post

Anyone can open the Owner sign-in screen, but nothing happens without a token that GitHub accepts for your repository, so nobody else can add, change or delete posts. The token stays in the browser you signed in with and is sent only to GitHub.

- Sign in only on your own devices, and sign out on any shared one.
- The token reaches one repository only. You can revoke it any time under Settings, Developer settings.
- Tokens expire. When publishing says GitHub did not accept the token, make a new one and sign in again.

## If something goes wrong

| Message | What to do |
| --- | --- |
| GitHub did not accept the token | The token expired or was copied wrongly. Make a new one. |
| The token cannot write to this repository | Edit the token and set Contents to Read and write for this repository. |
| The posts could not be loaded | You opened `index.html` straight from a folder. View the site on GitHub Pages, or run `python3 -m http.server` in the folder and open `http://localhost:8000`. |
| posts.json is not valid JSON | Open `posts.json` on GitHub and fix or restore it. |

## Editing the rest of the page

Open `index.html` on GitHub and choose the pencil icon. Change the text and commit. The same goes for `style.css`.

## Projects page

The **Projects** link in the menu opens a dedicated page with one card per project. Each project has a short summary, the business case, the tech stack, the findings, links and pictures.

To add one: sign in with **Owner sign-in** (same token as for the blog), open **Projects**, choose **New project** and fill in:

- **Business case**: who needed it and what problem or decision it was for.
- **Tech stack**: tools separated by commas. They show as chips.
- **Findings**: what you found or delivered.
- **Links**: for example source code or a live dashboard.
- **Pictures**: screenshots. For each one choose where it appears: under the business case, under the findings, or in a screenshots gallery.

The writing syntax is the same as for blog posts (blank line = new paragraph, `## ` heading, `- ` bullet, `[text](https://address)`).

Publishing saves `projects.json` (and any pictures in `images/`) to your repository in one commit; the public site updates in about a minute. You can edit or delete a project from its card or its page.

Upload the new `projects.json` along with the other files. It contains one clearly marked **Sample** project; delete it once you have added your own.
