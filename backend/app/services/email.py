"""
app/services/email.py — HouseMind

REMOVED: send_magic_link() was the only function in this module.
It sent Resend emails containing magic-link tokens for the invite flow.

That flow has been replaced by the direct-invite mechanism:
  POST /invites  →  adds an existing user to project_members immediately
  No email, no token, no expiry.

If you need transactional email in future (password reset, notifications),
implement it here. The Resend integration pattern is in git history.

RESEND_API_KEY and FRONTEND_URL env vars can be removed from
infra/env-vars-reference.toml and Railway/Vercel dashboards.
"""