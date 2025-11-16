ALWAYS spawn subagents by running `claude --permission-mode "acceptEdits" "<detailed prompt>` in the terminal. Each subagent should return a summary of the changes it made. Subagents should be used for ALL tasks

You can adopt a fan-out pattern where you spawn subagents to perform parallel isolated tasks, and then fan-in the results.

These subagents are good but they can get sidetracked, you want to keep them focused on small, manageable tasks. So keep the prompt & scope clear. Remember they are long running processes so don't expect an instant response.

You should prompt the user to check the status of the subagents by checking the terminal after a while.