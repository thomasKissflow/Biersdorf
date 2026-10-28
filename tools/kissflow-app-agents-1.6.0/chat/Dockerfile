# Cloud Run image for AI Builder — ONE service: the control plane (auth, apps, users, versions) with
# the chat mounted inside it. The conductor is a real Claude Code CLI process, so the image needs Node,
# git (some engine scripts shell out to it) and the CLI itself; the repo is baked in so the conductor
# can read/write plugins/app-agents and runs/ without a separate checkout. Built from the repo ROOT
# because the server imports across control-plane/ and plugins/.
#
#   docker build -f plugins/app-agents/chat/Dockerfile -t ai-builder .
#
# Auth: ANTHROPIC_API_KEY arrives via Cloud Run's --set-secrets (Secret Manager), never baked into the
# image. KF_CHAT_USE_API_KEY=1 tells the server to use it instead of an interactive login, which
# doesn't exist in a container. Users sign in with Google SSO against the control plane's own routes.
#
# Storage: runs/ lives on the container's local disk, which is EPHEMERAL — a redeploy or a
# scale-to-zero cycle loses every in-flight app. Fine for a first deploy under IAP with a small
# trusted group; syncing runs/ to GCS is the fast-follow before this is depended on for real work.
FROM node:20-slim

# chromium + fonts: the React runtime smoke (proto-react.mjs smokeStagedReact) mounts the staged build
# headless to catch blank mounts and runtime exceptions the static verify can't. Without a browser in the
# image it silently degraded to a no-op in prod (it only worked on a dev Mac). CHROME points the locator
# straight at it. Paired with KF_REACT_SMOKE_REQUIRED=1 in the deploy, a missing browser fails the build.
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates chromium fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g @anthropic-ai/claude-code@latest \
  && corepack enable
ENV CHROME=/usr/bin/chromium

WORKDIR /repo
COPY . .
# The chat server itself has zero npm dependencies; this installs the workspace prod deps the generated
# custom-UI projects and — critically — the PROTOTYPE PRECOMPILER need: starter's tailwindcss. This must
# FAIL the build if it fails: the old `|| echo "…non-fatal"` let an image ship without tailwindcss, so
# precompile found no compiler and every prototype went out with the raw CDN head (the P0 unstyled-
# preview bug). tailwindcss is a prod dependency of starter, so --prod keeps it.
RUN pnpm install --frozen-lockfile --prod

RUN npm --prefix control-plane install --omit=dev --no-audit --no-fund

# SMOKE-TEST the Tailwind compiler at BUILD time — resolve it and run a tiny compile. If it can't, the
# image is broken for prototype publishing (which now fails CLOSED), so fail here, loudly, not in prod.
RUN node plugins/app-agents/engine/tw-smoke.mjs

# NOT root. The conductor runs the CLI with permissions bypassed (there is no one to answer a prompt
# in a container), and the CLI refuses --dangerously-skip-permissions as root on purpose:
#   "--dangerously-skip-permissions cannot be used with root/sudo privileges for security reasons"
# As root every build exits code 1 the moment it starts. The base image already ships a `node` user;
# it needs to own the tree it writes builds into, and a HOME for the CLI's own config.
RUN mkdir -p /repo/runs /home/node/.claude && chown -R node:node /repo /home/node
USER node
ENV HOME=/home/node

ENV PORT=8080
ENV KF_CHAT_USE_API_KEY=1
ENV KF_CHAT_PERMISSION_MODE=bypassPermissions
EXPOSE 8080
CMD ["node", "control-plane/src/server.mjs"]
