#!/bin/bash
# 하루 한 번 도는 배치. EC2 crontab이 호출한다.
#
#   0 4 * * *  /home/ubuntu/infra/cron-handari.sh >> /home/ubuntu/logs/handari-cron.log 2>&1
#
# CloudFront를 거치지 않고 컨테이너에 직접 붙는다.
#   - DNS/CloudFront가 없어도 돈다
#   - 외부 왕복이 없다
# 다만 proxy.ts가 오리진 검증을 하므로 x-origin-verify 헤더도 같이 보낸다.
#
# 시크릿은 crontab에 박지 않고 매번 SSM에서 읽는다.

set -euo pipefail

REGION="ap-northeast-2"

ssm() {
  aws ssm get-parameter --name "$1" --with-decryption --region "$REGION" \
    --query Parameter.Value --output text
}

CRON_SECRET=$(ssm /handari/prod/CRON_SECRET)
ORIGIN_VERIFY=$(ssm /handari/prod/ORIGIN_VERIFY_SECRET)

echo "[$(date '+%Y-%m-%d %H:%M:%S')] 배치 시작"

RESPONSE=$(curl -fsS -X POST http://127.0.0.1:3000/api/cron/daily \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "x-origin-verify: $ORIGIN_VERIFY" \
  --max-time 120) || {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 실패 - 컨테이너가 떠 있나요?"
  exit 1
}

echo "[$(date '+%Y-%m-%d %H:%M:%S')] $RESPONSE"
