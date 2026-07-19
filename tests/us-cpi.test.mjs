import assert from "node:assert/strict";
import test from "node:test";

import {
  getUsCpi,
  US_CPI_SERIES,
  UsCpiUpstreamError,
  validateUsCpiInput,
} from "../lib/us-cpi.ts";

function payload(seriesID, values) {
  return {
    status: "REQUEST_SUCCEEDED",
    Results: {
      series: [{
        seriesID,
        data: values.map(([year, month, value]) => ({
          year,
          period: `M${month}`,
          periodName: month === "06" ? "June" : "May",
          value,
        })),
      }],
    },
  };
}

const months = [
  ["2026", "06", "333.952"],
  ["2026", "05", "335.123"],
  ["2025", "06", "322.561"],
  ["2025", "05", "321.465"],
  ["2025", "04", "320.795"],
  ["2025", "03", "319.799"],
  ["2025", "02", "319.082"],
  ["2025", "01", "317.671"],
  ["2024", "12", "315.605"],
  ["2024", "11", "315.493"],
  ["2024", "10", "315.664"],
  ["2024", "09", "315.301"],
  ["2024", "08", "314.796"],
];

test("validates optional CPI month input", () => {
  assert.deepEqual(validateUsCpiInput({}), {});
  assert.deepEqual(validateUsCpiInput({ month: "2026-06" }), { month: "2026-06" });
  assert.throws(() => validateUsCpiInput({ month: "June 2026" }), /YYYY-MM/u);
});

test("computes official headline and core year-over-year CPI", async () => {
  const fetchImpl = async (url) => Response.json(
    String(url).endsWith(US_CPI_SERIES.headline)
      ? payload(US_CPI_SERIES.headline, months)
      : payload(US_CPI_SERIES.core, months.map((point) => [point[0], point[1], String(Number(point[2]) + 3)])),
  );
  const result = await getUsCpi({}, {
    fetchImpl,
    cache: null,
    now: new Date("2026-07-19T00:00:00.000Z"),
  });

  assert.equal(result.period.month, "2026-06");
  assert.equal(result.cpi.headline_index, 333.952);
  assert.equal(result.cpi.headline_yoy_percent, 3.531);
  assert.equal(result.status, "verified");
  assert.equal(result.receipt.assurance, "official-source-data");
});

test("fails closed when BLS returns incomplete data", async () => {
  const fetchImpl = async () => Response.json({ status: "REQUEST_FAILED", Results: null });
  await assert.rejects(
    getUsCpi({}, { fetchImpl, cache: null }),
    UsCpiUpstreamError,
  );
});
