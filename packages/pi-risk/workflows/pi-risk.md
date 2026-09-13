---
name: pi-risk
description: Validate series before computing any portfolio risk metric.
---

phases: validate → compute → classify → cite

Validate the input series (non-empty, finite numbers, observation count) before invoking calculate_var, calculate_sharpe, calculate_sortino, or calculate_max_drawdown. Classify the rating band and cite evidence metadata before recommending any action.
