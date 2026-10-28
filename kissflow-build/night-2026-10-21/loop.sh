#!/bin/zsh
# Runs run.mjs until it finishes; on a rate limit (exit 75) both sessions pause 20 minutes, then it resumes.
cd "${0:A:h}"
for i in {1..8}; do
  node run.mjs "$@"; rc=$?
  [[ $rc -ne 75 ]] && exit $rc
  echo "paused 20 min after a rate limit ($(date))"; sleep 1200
done
