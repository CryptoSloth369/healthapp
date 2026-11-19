# Session logs

One short file per AI chat session, so there's a record of what was done and why even after the chat itself is deleted. Git keeps every code change; these logs keep the reasons, the decisions and the things the owner did by hand (SQL run in Supabase, settings in Vercel or Plaid) that Git can't see.

## Protocol
- **When:** at the end of a session, and also after any step that was deployed, so a session that ends abruptly still left a record. Update the same file as the session goes on.
- **File name:** `YYYY-MM-DD-short-topic.md`, dated by the day the session started. One file per session.
- **Commit it** with the work (or on its own as a docs-only commit). It goes to `main` with the next push the owner approves.
- **Keep it short:** a page, not a transcript. Link commits by their short hash.
- **Never include secrets or personal data:** no keys, passwords, tokens, client IDs, emails, account numbers, balances or health numbers. Describe them instead ("set `PLAID_SECRET` to the production secret").
- **Raw transcripts are not saved** in the repo. They're large, mostly tool output, and contain personal details from screenshots.
- `docs/HANDOFF.md` stays the "current state" document; the logs are the history behind it.

## Template
```markdown
# YYYY-MM-DD: Topic

**Asked for:** one or two sentences in the owner's terms.

## Done
- Feature or fix, in plain words (commit `abc1234`).

## Decisions
- What was chosen, and why (link DECISIONS.md rows if added).

## Owner actions
- SQL run, settings changed, accounts created (no secret values).

## Problems and fixes
- What broke, the cause, the fix.

## Open / next
- Unfinished work, things to verify in real use, the next step.
```
