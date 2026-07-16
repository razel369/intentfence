DELETE FROM `leads`
WHERE lower(`email`) LIKE '%@agentpass.invalid';
