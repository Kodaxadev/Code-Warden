# Research and Fit

## Live Research Gate

Do not rely on model training data when a decision depends on current facts.
Run live research first when the task involves:
- Current package versions, APIs, pricing, licenses, limits, or deprecations.
- Framework, runtime, cloud, database, or platform recommendations.
- Security, legal, policy, compliance, or financial claims.
- Recently released tools, libraries, models, protocols, or standards.
- Anything the user describes as latest, current, modern, today, new, or changed.

Research standard:
- Prefer official docs, release notes, standards, or source repositories.
- Use registry metadata for package versions and license facts.
- Capture the date-sensitive fact, source, and date accessed in the response or decision log.
- If live research is unavailable, say so and treat the claim as unverified.

## Default-Pattern Challenge

Before choosing a stack, architecture, or product shape, challenge familiar defaults.
Do not pick Node, Next.js, React, a SaaS dashboard, CRUD admin, or auth-first app
unless the project context makes that choice fit.

Required fit check:
- User goal: what is the thing being built?
- Primary user: who uses it and under what constraints?
- Runtime/environment: browser, desktop, mobile, server, embedded, game engine, CLI, or hybrid.
- Data shape: static, local-first, collaborative, realtime, batch, transactional, analytical, or media-heavy.
- Interaction shape: workflow tool, creative tool, game, simulation, content site, dashboard, automation, API, or library.
- Operational constraints: deployment target, offline needs, privacy, performance, budget, and maintenance burden.

## Recommendation Discipline

When recommending an approach over alternatives:
- Name at least two viable alternatives unless the user already chose the stack.
- Explain why the chosen approach fits the project's constraints better.
- Identify the main tradeoff or downside.
- Do not optimize for what is easiest for the model to generate.

## Product-Shape Guardrail

Do not assume every app is a SaaS dashboard.
Match the first screen and navigation to the domain:
- Operational tools can be dense and workflow-first.
- Creative tools should put the canvas or creation surface first.
- Games should open on the playable loop, not a marketing page.
- Content sites should prioritize the content object or story.
- Developer tools should expose the core command, API, or artifact early.

If the shape is unclear, make a small fit assessment before designing or coding.
