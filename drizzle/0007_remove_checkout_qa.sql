DELETE FROM `usage_events`
WHERE `event_name` = 'checkout_selected'
  AND `path` = '/api/checkout'
  AND json_extract(`metadata_json`, '$.protocol') = 'rest'
  AND json_extract(`metadata_json`, '$.product') = 'wallet-risk'
  AND json_extract(`metadata_json`, '$.traffic_kind') = 'browser'
  AND json_extract(`metadata_json`, '$.client_family') = 'web-browser'
  AND (
    SELECT count(*)
    FROM `usage_events`
    WHERE `event_name` = 'checkout_selected'
  ) = 1;
