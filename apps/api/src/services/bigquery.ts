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
      COUNTIF(event_name = 'earn_success' AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'is_auto_earned') = 'false') AS success_manual,
      COUNTIF(event_name = 'earn_success' AND (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'is_auto_earned') = 'true') AS success_auto,
      COUNTIF(event_name = 'earn_fail') AS fail
    FROM ${TABLE}
    WHERE ${PROD_WHERE}
      AND event_name IN ('earn_flow_start','earn_cta_click','kakao_auth_start','earn_success','earn_fail')
      ${flowFilter}`;
  const params: Record<string, unknown> = { from, to };
  if (flowType) params.flowType = flowType;
  const rows = await runQuery<Record<string, number>>(query, params);
  return rows[0] ?? { flow_start: 0, cta_click: 0, kakao_auth: 0, success: 0, success_manual: 0, success_auto: 0, fail: 0 };
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

/** 신규/재방문 + 재적립(user_id 기반 충성도) */
export async function getRetention(from: string, to: string) {
  const earnerQuery = `
    WITH earners AS (
      SELECT user_id, COUNT(*) AS earns
      FROM ${TABLE}
      WHERE ${PROD_WHERE} AND event_name = 'earn_success' AND user_id IS NOT NULL
      GROUP BY user_id
    )
    SELECT COUNTIF(earns = 1) AS once, COUNTIF(earns = 2) AS twice,
           COUNTIF(earns >= 3) AS three_plus, COUNT(*) AS total
    FROM earners`;
  const visitorQuery = `
    SELECT COUNTIF(event_name = 'first_visit') AS new_visitors,
           COUNT(DISTINCT user_pseudo_id) AS total_visitors
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND event_name IN ('first_visit','session_start')`;
  const [earnRows, visRows] = await Promise.all([
    runQuery<Record<string, number>>(earnerQuery, { from, to }),
    runQuery<Record<string, number>>(visitorQuery, { from, to }),
  ]);
  return {
    earners: earnRows[0] ?? { once: 0, twice: 0, three_plus: 0, total: 0 },
    visitors: visRows[0] ?? { new_visitors: 0, total_visitors: 0 },
  };
}

/** 퍼널 이탈 상세 — 동의 이탈(cta_click.agreed) + 실패 사유(earn_fail.reason) */
export async function getDropoff(from: string, to: string) {
  const consentQuery = `
    SELECT
      COUNTIF((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'agreed') = 'true') AS agreed,
      COUNTIF((SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'agreed') = 'false') AS not_agreed
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name = 'earn_cta_click'`;
  const failQuery = `
    SELECT (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'reason') AS reason, COUNT(*) AS cnt
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name = 'earn_fail'
    GROUP BY reason ORDER BY cnt DESC`;
  const [consentRows, failRows] = await Promise.all([
    runQuery<Record<string, number>>(consentQuery, { from, to }),
    runQuery<{ reason: string; cnt: number }>(failQuery, { from, to }),
  ]);
  return {
    consent: consentRows[0] ?? { agreed: 0, not_agreed: 0 },
    failReasons: failRows,
  };
}

/** 시간대(0~23 KST) × 요일(1=일~7=토) 진입 히트맵 */
export async function getHeatmap(from: string, to: string) {
  const query = `
    SELECT
      EXTRACT(DAYOFWEEK FROM DATETIME(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul')) AS dow,
      EXTRACT(HOUR FROM DATETIME(TIMESTAMP_MICROS(event_timestamp), 'Asia/Seoul')) AS hour,
      COUNT(*) AS cnt
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name = 'earn_flow_start'
    GROUP BY dow, hour`;
  return runQuery<{ dow: number; hour: number; cnt: number }>(query, { from, to });
}

/** 특정 매장(slug)의 퍼널·핵심액션 — 드릴다운용 */
export async function getStoreDetail(from: string, to: string, slug: string) {
  const query = `
    SELECT
      COUNTIF(event_name = 'earn_flow_start') AS flow_start,
      COUNTIF(event_name = 'earn_cta_click') AS cta_click,
      COUNTIF(event_name = 'kakao_auth_start') AS kakao_auth,
      COUNTIF(event_name = 'earn_success') AS success,
      COUNTIF(event_name = 'earn_fail') AS fail,
      COUNTIF(event_name = 'coupon_download') AS coupon_download,
      COUNTIF(event_name = 'feedback_submit') AS feedback_submit
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND ${STORE_SLUG} = @slug
      AND event_name IN ('earn_flow_start','earn_cta_click','kakao_auth_start','earn_success','earn_fail','coupon_download','feedback_submit')`;
  const rows = await runQuery<Record<string, number>>(query, { from, to, slug });
  return rows[0] ?? { flow_start: 0, cta_click: 0, kakao_auth: 0, success: 0, fail: 0, coupon_download: 0, feedback_submit: 0 };
}

/** 사장님 기능별 사용 건수 + 활성 사장님수(distinct user_id) */
export async function getOwnerUsage(from: string, to: string) {
  const query = `
    SELECT event_name, COUNT(*) AS cnt, COUNT(DISTINCT user_id) AS owners
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND event_name LIKE 'owner_%'
    GROUP BY event_name ORDER BY cnt DESC`;
  return runQuery<{ event_name: string; cnt: number; owners: number }>(query, { from, to });
}

/** 사장님(user_id)별 owner 이벤트 수 — route에서 매장 매핑·합산 */
export async function getOwnerActiveStores(from: string, to: string) {
  const query = `
    SELECT user_id, COUNT(*) AS cnt
    FROM ${TABLE}
    WHERE ${PROD_WHERE} AND event_name LIKE 'owner_%' AND user_id IS NOT NULL
    GROUP BY user_id ORDER BY cnt DESC LIMIT 100`;
  return runQuery<{ user_id: string; cnt: number }>(query, { from, to });
}

/** 쿠폰 다운→사용 (전체 + 일별) */
export async function getCouponEffect(from: string, to: string) {
  const totalQuery = `
    SELECT COUNTIF(event_name = 'coupon_download') AS download, COUNTIF(event_name = 'coupon_used') AS used
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name IN ('coupon_download','coupon_used')`;
  const dailyQuery = `
    SELECT event_date, COUNTIF(event_name = 'coupon_download') AS download, COUNTIF(event_name = 'coupon_used') AS used
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name IN ('coupon_download','coupon_used')
    GROUP BY event_date ORDER BY event_date`;
  const [tot, daily] = await Promise.all([
    runQuery<Record<string, number>>(totalQuery, { from, to }),
    runQuery(dailyQuery, { from, to }),
  ]);
  return { total: tot[0] ?? { download: 0, used: 0 }, daily };
}

/** 기기·유입경로별 적립 전환 */
export async function getSegmentConversion(from: string, to: string) {
  const deviceQuery = `
    SELECT device.category AS segment,
      COUNTIF(event_name = 'earn_flow_start') AS starts,
      COUNTIF(event_name = 'earn_success') AS success
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name IN ('earn_flow_start','earn_success')
    GROUP BY segment HAVING segment IS NOT NULL AND starts > 0 ORDER BY starts DESC`;
  const sourceQuery = `
    SELECT
      CONCAT(IFNULL(collected_traffic_source.manual_source, '(direct)'), ' / ', IFNULL(collected_traffic_source.manual_medium, '(none)')) AS segment,
      COUNTIF(event_name = 'earn_flow_start') AS starts,
      COUNTIF(event_name = 'earn_success') AS success
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name IN ('earn_flow_start','earn_success')
    GROUP BY segment HAVING starts >= 20 ORDER BY starts DESC LIMIT 12`;
  const [byDevice, bySource] = await Promise.all([
    runQuery(deviceQuery, { from, to }),
    runQuery(sourceQuery, { from, to }),
  ]);
  return { byDevice, bySource };
}

/** 별점(rating) 분포 */
export async function getRatingDistribution(from: string, to: string) {
  const query = `
    SELECT (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'rating') AS rating, COUNT(*) AS cnt
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name = 'feedback_submit'
    GROUP BY rating HAVING rating IS NOT NULL ORDER BY rating`;
  return runQuery<{ rating: number; cnt: number }>(query, { from, to });
}

/** 일별 신규 고객(first_visit) 수 */
export async function getNewCustomers(from: string, to: string) {
  const query = `
    SELECT event_date, COUNT(*) AS cnt
    FROM ${TABLE} WHERE ${PROD_WHERE} AND event_name = 'first_visit'
    GROUP BY event_date ORDER BY event_date`;
  return runQuery<{ event_date: string; cnt: number }>(query, { from, to });
}
