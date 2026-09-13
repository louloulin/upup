# Notification policy

- External webhook and PR subscription actions are state-changing side effects.
- Reject local/private webhook targets.
- Mask webhook URLs in all tool output.
- Subscription state is scoped to the current Pi Session.
