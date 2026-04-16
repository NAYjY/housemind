/**
 * qa/load/k6.js — HouseMind
 * Load test for the annotation read path.
 *
 * Thresholds (from QA Command Center perf criteria):
 *   - Annotation list p95 < 500 ms
 *   - Product detail   p95 < 500 ms
 *   - Error rate       < 1%
 *
 * Run:
 *   k6 run qa/load/k6.js \
 *     -e API_BASE=https://api-staging.housemind.app/v1 \
 *     -e JWT_TOKEN=<valid_token> \
 *     -e IMAGE_ID=<uuid> \
 *     -e PRODUCT_ID=<uuid>
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

// ── Custom metrics ───────────────────────────────────────────────────────────
const annotationListDuration = new Trend("annotation_list_duration", true);
const productDetailDuration  = new Trend("product_detail_duration", true);
const errorRate              = new Rate("error_rate");

// ── Config ───────────────────────────────────────────────────────────────────
const API_BASE   = __ENV.API_BASE   || "http://localhost:8000/v1";
const JWT_TOKEN  = __ENV.JWT_TOKEN  || "";
const IMAGE_ID   = __ENV.IMAGE_ID   || "";
const PRODUCT_ID = __ENV.PRODUCT_ID || "";

export const options = {
  stages: [
    { duration: "30s", target: 10  },  // ramp up
    { duration: "1m",  target: 50  },  // sustained load
    { duration: "30s", target: 100 },  // peak
    { duration: "30s", target: 0   },  // ramp down
  ],
  thresholds: {
    annotation_list_duration: ["p(95)<500"],
    product_detail_duration:  ["p(95)<500"],
    error_rate:               ["rate<0.01"],
    http_req_duration:        ["p(95)<1000"],
  },
};

const headers = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${JWT_TOKEN}`,
};

// ── Main scenario ─────────────────────────────────────────────────────────────
export default function () {
  // 1. Fetch annotation list (page load — most frequent call)
  const listRes = http.get(
    `${API_BASE}/annotations?image_id=${IMAGE_ID}`,
    { headers, tags: { name: "annotation_list" } }
  );
  annotationListDuration.add(listRes.timings.duration);
  const listOk = check(listRes, {
    "annotation list status 200": (r) => r.status === 200,
    "annotation list is array":   (r) => Array.isArray(r.json()),
  });
  errorRate.add(!listOk);

  sleep(0.5);

  // 2. Fetch product detail (on pin tap — less frequent)
  if (PRODUCT_ID) {
    const detailRes = http.get(
      `${API_BASE}/products/${PRODUCT_ID}`,
      { headers, tags: { name: "product_detail" } }
    );
    productDetailDuration.add(detailRes.timings.duration);
    const detailOk = check(detailRes, {
      "product detail status 200": (r) => r.status === 200,
      "product has name field":    (r) => r.json("name") !== undefined,
    });
    errorRate.add(!detailOk);
  }

  // 3. Health check (low frequency — simulates UptimeRobot)
  const healthRes = http.get(
    API_BASE.replace("/v1", "") + "/health",
    { tags: { name: "health" } }
  );
  check(healthRes, { "health status 200": (r) => r.status === 200 });

  sleep(1);
}
