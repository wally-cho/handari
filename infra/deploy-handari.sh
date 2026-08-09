#!/bin/bash
# EC2의 /home/ubuntu/infra/deploy-handari.sh 로 둔다 (chmod +x).
# GitHub Actions가 SSH로 호출한다:
#   ./deploy-handari.sh chokyumin/handari:v0.0.0-abc1234
#
# tium 자원은 아무것도 건드리지 않는다.
#   - tium-network에 붙지 않는다 (handari-network를 따로 만든다)
#   - tium의 nginx 설정을 고치지 않는다
#   - /handari/prod/* SSM 파라미터만 읽는다
#
# 삭제 절차는 infra/TEARDOWN.md

set -euo pipefail

IMAGE="${1:?사용법: deploy-handari.sh <docker-image>}"
INFRA_DIR="/home/ubuntu/infra"
ENV_FILE="$INFRA_DIR/handari.env"
COMPOSE="$INFRA_DIR/docker-compose.handari.yml"
REGION="ap-northeast-2"

ssm() {
  aws ssm get-parameter --name "$1" --with-decryption --region "$REGION" \
    --query Parameter.Value --output text
}

echo "[1/4] handari-network 확인"
docker network inspect handari-network >/dev/null 2>&1 || docker network create handari-network

echo "[2/4] SSM에서 환경변수 수집 (/handari/prod/* 만)"
umask 077
cat > "$ENV_FILE" <<EOF
DATABASE_URL=$(ssm /handari/prod/DATABASE_URL)
AUTH_SECRET=$(ssm /handari/prod/AUTH_SECRET)
AUTH_KAKAO_ID=$(ssm /handari/prod/KAKAO_CLIENT_ID)
AUTH_KAKAO_SECRET=$(ssm /handari/prod/KAKAO_CLIENT_SECRET)
AUTH_URL=https://handari.tium-care.com
AUTH_TRUST_HOST=true
CRON_SECRET=$(ssm /handari/prod/CRON_SECRET)
ORIGIN_VERIFY_SECRET=$(ssm /handari/prod/ORIGIN_VERIFY_SECRET)
EOF

# 사진은 전용 버킷(handari-uploads)에 넣는다. tium 버킷을 쓰지 않는다.
# 액세스 키를 넣지 않는다 - SDK가 EC2 인스턴스 역할을 쓴다.
# 앱에 장기 크레덴셜을 심지 않으려는 것이다.
cat >> "$ENV_FILE" <<'EOF2'
S3_BUCKET=handari-uploads
S3_REGION=ap-northeast-2
S3_PREFIX=profiles/
EOF2

chmod 600 "$ENV_FILE"

echo "[3/4] 이미지 받고 컨테이너 교체: $IMAGE"
docker pull "$IMAGE"
DOCKER_IMAGE="$IMAGE" docker compose -f "$COMPOSE" up -d --force-recreate

echo "[4/4] 헬스체크"
for i in $(seq 1 30); do
  if docker exec handari node -e \
    "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "정상 기동 (${i}초)"
    # dangling 이미지만 지운다. tium 이미지는 태그가 붙어 있어 대상이 아니다
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 1
done

echo "헬스체크 실패. 최근 로그:"
docker logs --tail 50 handari
exit 1
