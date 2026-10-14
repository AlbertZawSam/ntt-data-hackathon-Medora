# Put Medora on GitHub

1. **Create an empty private repository** on GitHub named `medora` (no README, no .gitignore: the starter has them).
2. **Push the starter** from the unzipped folder:
   ```bash
   cd medora
   git remote add origin https://github.com/<your-account>/medora.git
   git push -u origin main
   ```
3. **Set the code owner:** in `.github/CODEOWNERS`, replace `@TEAM-LEAD` with the team lead's GitHub username; commit and push.
4. **Protect `main`** (Settings → Branches → Add rule, or Rulesets):
   - Require a pull request before merging, with 1 approval.
   - Require review from Code Owners.
   - Require status checks to pass: **Cost and safety rules** and **Type-check and tests** (they appear after the first workflow run).
   - Block force pushes.
5. **Add teammates** as collaborators (Settings → Collaborators).
6. **Work in branches:** one branch and one pull request per task; the guardrails run on each pull request and the template asks for cost and safety confirmation.

Never commit `amplify_outputs.json`, `.env`, `google-services.json` or AWS keys; `.gitignore` excludes them and the guardrails check for keys.
