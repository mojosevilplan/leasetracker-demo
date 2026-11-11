# Rules for Gemini and Antigravity

Read [AGENTS.md](AGENTS.md) before you change anything. It applies to you. This repo is public: never commit secrets or private information.

**Never commit or push directly to `main`.** For every task:

1. Create your own branch named `antigravity/<short-task>` from the latest `main`, in its own git worktree:

   ```bash
   git fetch origin
   git worktree add ../leasetracker-demo-antigravity-<task> -b antigravity/<task> origin/main
   ```

2. Commit there, and end every commit message with `Co-Authored-By: Antigravity <noreply@google.com>`.
3. Before you finish, rebase onto `origin/main`, push your branch, and open a pull request:

   ```bash
   gh pr create --base main --head antigravity/<task>
   ```

4. Do not merge it yourself. The owner reviews and merges.

If you are partway through a task on `main`, stop committing there. Move your uncommitted work to a new `antigravity/<task>` branch (`git switch -c antigravity/<task>`) and continue from step 2.
