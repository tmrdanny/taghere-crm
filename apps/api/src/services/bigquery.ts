/**
 * BigQuery 조회 어댑터 — 내부 admin 인사이트 대시보드 전용 (읽기 전용).
 *
 * GA4 → BigQuery export(`taghere-data-analytics.analytics_339879288.events_*`)에서
 * prod CRM 트래픽(stream_id + prod hostname)만 골라 집계한다.
 * 비용 절감: _TABLE_SUFFIX(YYYYMMDD)로 날짜 파티션 프루닝.
 *
 * 자격증명: 운영은 BIGQUERY_CREDENTIALS(서비스계정 JSON 문자열),
 * 로컬은 동일 env 또는 ADC(gcloud) 폴백.
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.BIGQUERY_PROJECT_ID || 'taghere-data-analytics';
const DATASET = process.env.BIGQUERY_DATASET || 'analytics_339879288';
const LOCATION = process.env.BIGQUERY_LOCATION || 'asia-northeast3';
const PROD_HOST = process.env.BIGQUERY_PROD_HOST || 'taghere-crm-web-g96p.onrender.com';
const CRM_STREAM_ID = '13214625898';

const TABLE = `\`${PROJECT_ID}.${DATASET}.events_*\``;

// prod CRM 필터 + 날짜 파티션 프루닝(@from/@to: 'YYYYMMDD'). stream_id·host는 상수(주입 아님).
const PROD_WHERE = `_TABLE_SUFFIX BETWEEN @from AND @to
  AND stream_id = '${CRM_STREAM_ID}'
  AND NET.HOST((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location')) = '${PROD_HOST}'`;
const FLOW_TYPE = `(SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'flow_type')`;
const STORE_SLUG = `(SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'store_slug')`;

let client: BigQuery | null = null;

function getClient(): BigQuery {
  if (client) return client;
  const credsRaw = process.env.BIGQUERY_CREDENTIALS;
  client = credsRaw
    ? new BigQuery({ projectId: PROJECT_ID, credentials: JSON.parse(credsRaw) })
    : new BigQuery({ projectId: PROJECT_ID }); // ADC 폴백(로컬)
  return client;
}

export function isBigQueryConfigured(): boolean {
  return !!(process.env.BIGQUERY_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

async function runQuery<T = any>(query: string, params: Record<string, unknown>): Promise<T[]> {
  const [rows] = await getClient().query({ query, params, location: LOCATION });
  return rows as T[];
}

/** 적립 퍼널 단계별 카운트(flowType 지정 시 해당 적립방식만) */
export async function getFunnel(from: string, to: string, flowType?: string) {
  const flowFilter = flowType ? `AND ${FLOW_TYPE} = @flowType` : '';
  const query = `
    SELECT
      COUNTIF(event_name = 'earn_flow_start') AS flow_start,
      COUNTIF(event_name = 'earn_cta_click') AS cta_click,
      COUNTIF(event_name = 'kakao_auth_start') AS kakao_auth,
      COUNTIF(event_name = 'earn_success') AS success,
      COUNTIF(event_name = 'earn_fail') AS fail
    FROM ${TABLE}
    WHERE ${PROD_WHERE}
      AND event_name IN ('earn_flow_start','earn_cta_click','kakao_auth_start','earn_success','earn_fail')
      ${flowFilter}`;
  const params: Record<string, unknown> = { from, to };
  if (flowType) params.flowType = flowType;
  const rows = await runQuery<Record<string, number>>(query, params);
  return rows[0] ?? { flow_start: 0, cta_click: 0, kakao_auth: 0, success: 0, fail: 0 };
}

/** 적립방식(flow_type)별 시작/완주 + 핵심 액션 카운트 */
export async function getFeatureUsage(from: string, to: string) {
  const flowQuery = `
    SELECT ${FLOW_TYPE} AS flow_type,
      COUNTIF(event_name = 'earn_flow_start') AS starts,
      COUNTIF(event_name = 'earn_success') AS success
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND event_name IN ('earn_flow_start','earn_success')
    GROUP BY flow_type HAVING flow_type IS NOT NULL ORDER BY starts DESC`;
  const actionQuery = `
    SELECT event_name, COUNT(*) AS cnt
    FROM ${TABLE}
    WHERE ${PROD_WHERE}
      AND event_name IN ('coupon_download','coupon_used','table_link_confirm','feedback_submit','survey_submit','visit_source_select')
    GROUP BY event_name`;
  const [flows, actionRows] = await Promise.all([
    runQuery(flowQuery, { from, to }),
    runQuery<{ event_name: string; cnt: number }>(actionQuery, { from, to }),
  ]);
  const actions: Record<string, number> = {};
  for (const r of actionRows) actions[r.event_name] = Number(r.cnt);
  return { flows, actions };
}

/** 일별 시작/완주 추이 */
export async function getDailyTrend(from: string, to: string) {
  const query = `
    SELECT event_date,
      COUNTIF(event_name = 'earn_flow_start') AS starts,
      COUNTIF(event_name = 'earn_success') AS success
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND event_name IN ('earn_flow_start','earn_success')
    GROUP BY event_date ORDER BY event_date`;
  return runQuery(query, { from, to });
}

/** 매장(store_slug)별 시작/완주 — 개선 타겟 식별용(시작 20건 이상만) */
export async function getStoreConversion(from: string, to: string) {
  const query = `
    SELECT ${STORE_SLUG} AS store_slug,
      COUNTIF(event_name = 'earn_flow_start') AS starts,
      COUNTIF(event_name = 'earn_success') AS success
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND event_name IN ('earn_flow_start','earn_success')
    GROUP BY store_slug HAVING store_slug IS NOT NULL AND starts >= 20
    ORDER BY starts DESC`;
  return runQuery(query, { from, to });
}
