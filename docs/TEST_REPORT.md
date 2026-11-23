# Verification report

Verified on 21 November 2026 in the build workspace.

- npm run check and 7 Node integration tests: PASS.
- Failed tests: 0; skipped tests: 0.
- Node.js 24.19.0 and a real ephemeral MongoDB 7.0.24 process used for local verification.
- Login and student dashboard opened in a browser.
- Event registration and support-request creation also exercised through the browser.
- Responsive CSS reviewed in desktop and mobile previews.
- Authentication, roles, CSRF, pagination, concurrent capacity, complaint privacy, assignment deadlines, duplicates and PDF permissions tested.
- npm audit --omit=dev: zero vulnerabilities at verification time.

## Verification limits

Docker CLI is installed, but the Docker engine was not running on the build machine. Compose/container deployment was not executed. CI on Linux/JDK 17 or Node 22 is configured but was not run on a remote CI service. No public host/domain was configured and no real HTTPS certificate was issued. These are local development projects with deployment configuration, not hosted production services.

Accessibility and responsive layouts were manually sampled, not exhaustively audited across all browsers. Upload validation checks size, MIME, extension and PDF signature; it does not scan for malware.
