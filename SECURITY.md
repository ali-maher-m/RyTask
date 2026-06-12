# Security Policy

## Supported versions

RyTask has not yet cut a tagged release — `main` is the supported version, and security
fixes land there. Once versioned releases begin, this table will track which lines receive
fixes.

| Version | Supported |
| ------- | --------- |
| `main` (latest) | ✅ |

## Reporting a vulnerability

We take security seriously — RyTask is self-hosted and multi-tenant, so isolation and auth
bugs matter a lot to us.

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, [open a private security advisory](https://github.com/ali-maher-m/RyTask/security/advisories/new)
on GitHub. Only the maintainers can see it.

When reporting, please include what you can of:

- A description of the vulnerability and where it lives.
- Steps to reproduce (a proof of concept helps enormously).
- The potential impact — especially anything that crosses a tenant boundary.

You'll get an acknowledgement within a few days, and updates as we work on a fix. Please
give us reasonable time to ship a fix before disclosing publicly — we'll credit you in the
advisory unless you'd rather we didn't.

## Hardening your own deployment

Secure self-hosting guidance (TLS, secrets, backups, what to never expose) lives in the
[self-hosting guide](https://docs.rytask.app/docs/guides/self-hosting).
