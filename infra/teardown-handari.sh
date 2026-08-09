#!/bin/bash
# 한다리를 EC2와 AWS에서 완전히 지운다.
#
#   ./teardown-handari.sh --dry-run   지울 것만 보여준다 (기본값)
#   ./teardown-handari.sh --yes       실제로 지운다
#
# tium 자원은 절대 건드리지 않는다. 이름에 tium이 들어간 대상은 전부 건너뛴다.
# 지운 뒤 남는 수동 작업은 마지막에 출력한다.

set -uo pipefail

REGION="ap-northeast-2"
INFRA_DIR="/home/ubuntu/infra"
DRY=1
[[ "${1:-}" == "--yes" ]] && DRY=0

run() {
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] $*"
  else
    echo "  실행: $*"
    "$@" 2>&1 | sed 's/^/    /'
  fi
}

# 안전장치: tium 자원을 실수로 지우지 않도록 이름을 검사한다
assert_not_tium() {
  case "$1" in
    *tium*) echo "  !! '$1' 은 tium 자원입니다. 건너뜁니다."; return 1 ;;
  esac
  return 0
}

echo "════════════════════════════════════════════"
if [ "$DRY" = "1" ]; then
  echo " DRY RUN - 실제로 지우지 않습니다"
  echo " 진짜 지우려면: $0 --yes"
else
  echo " 한다리를 완전히 삭제합니다"
  read -rp " 확인을 위해 handari 를 입력하세요: " confirm
  [ "$confirm" = "handari" ] || { echo " 취소했습니다."; exit 1; }
fi
echo "════════════════════════════════════════════"

echo
echo "[1] 컨테이너"
if docker ps -a --format '{{.Names}}' | grep -qx handari; then
  assert_not_tium handari && { run docker stop handari; run docker rm handari; }
else
  echo "  없음"
fi

echo
echo "[2] 이미지"
IMAGES=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep '/handari:' || true)
if [ -n "$IMAGES" ]; then
  for img in $IMAGES; do
    assert_not_tium "$img" && run docker rmi -f "$img"
  done
else
  echo "  없음"
fi

echo
echo "[3] 네트워크 (handari-network)"
if docker network inspect handari-network >/dev/null 2>&1; then
  run docker network rm handari-network
else
  echo "  없음"
fi
echo "  ※ tium-network 는 건드리지 않습니다"

echo
echo "[4] EC2 파일"
for f in "$INFRA_DIR/handari.env" "$INFRA_DIR/docker-compose.handari.yml" "$INFRA_DIR/deploy-handari.sh"; do
  [ -f "$f" ] && run rm -f "$f" || echo "  없음: $f"
done

echo
echo "[5] crontab에서 한다리 배치 제거"
if crontab -l 2>/dev/null | grep -q 'handari'; then
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] crontab에서 handari 줄 제거"
    crontab -l 2>/dev/null | grep 'handari' | sed 's/^/    /'
  else
    crontab -l 2>/dev/null | grep -v 'handari' | crontab -
    echo "  제거 완료"
  fi
else
  echo "  없음"
fi

echo
echo "[6] SSM 파라미터 (/handari/prod/*)"
PARAMS=$(aws ssm get-parameters-by-path --path /handari/prod/ --region "$REGION" \
  --query 'Parameters[].Name' --output text 2>/dev/null | tr '\t' '\n' || true)
if [ -n "$PARAMS" ]; then
  for p in $PARAMS; do
    case "$p" in
      /handari/prod/*) run aws ssm delete-parameter --name "$p" --region "$REGION" ;;
      *) echo "  !! '$p' 은 /handari/prod/ 밖입니다. 건너뜁니다." ;;
    esac
  done
else
  echo "  없음"
fi

echo
echo "[7] S3 버킷 (handari-uploads)"
if aws s3api head-bucket --bucket handari-uploads --region "$REGION" 2>/dev/null; then
  if assert_not_tium handari-uploads; then
    run aws s3 rm s3://handari-uploads --recursive
    run aws s3api delete-bucket --bucket handari-uploads --region "$REGION"
  fi
else
  echo "  없음"
fi
echo "  ※ tium-bucket 등 tium 버킷은 건드리지 않습니다"

echo
echo "[8] 데이터베이스 (handari DB + handari 계정)"
echo "  RDS 인스턴스는 tium과 공유하므로 인스턴스는 건드리지 않습니다."
echo "  DB와 계정만 지웁니다."
if [ "$DRY" = "1" ]; then
  echo "  [dry-run] DROP DATABASE handari; DROP USER 'handari'@'%';"
else
  H=$(aws ssm get-parameter --name /tium/prod/MYSQL_JDBC_URL --with-decryption --region "$REGION" \
       --query Parameter.Value --output text | sed -E "s#jdbc:mysql://([^:]+):.*#\1#")
  U=$(aws ssm get-parameter --name /tium/prod/MYSQL_USERNAME --with-decryption --region "$REGION" \
       --query Parameter.Value --output text)
  P=$(aws ssm get-parameter --name /tium/prod/MYSQL_PASSWORD --with-decryption --region "$REGION" \
       --query Parameter.Value --output text)
  mysql -h "$H" -u "$U" -p"$P" -e \
    "DROP DATABASE IF EXISTS handari; DROP USER IF EXISTS 'handari'@'%';" 2>&1 \
    | grep -v "Using a password" | sed 's/^/    /'
  echo "    완료 (tium DB는 그대로입니다)"
fi

echo
echo "[9] 보안그룹 3000 포트 규칙"
# tium이 쓰는 22/80/443은 건드리지 않는다. 3000만 지운다
RULE=$(aws ec2 describe-security-group-rules --region "$REGION" \
  --filters Name=group-id,Values=sg-05d78c3cfeb18ea4c \
  --query "SecurityGroupRules[?FromPort==\`3000\`].SecurityGroupRuleId" --output text 2>/dev/null || true)
if [ -n "$RULE" ]; then
  run aws ec2 revoke-security-group-ingress --region "$REGION" \
    --group-id sg-05d78c3cfeb18ea4c --security-group-rule-ids $RULE
else
  echo "  없음"
fi

echo
echo "[10] Route 53 A 레코드 (handari.tium-care.com)"
ZONE=$(aws route53 list-hosted-zones-by-name --dns-name tium-care.com \
  --query "HostedZones[0].Id" --output text 2>/dev/null | sed 's|/hostedzone/||' || true)
REC=$(aws route53 list-resource-record-sets --hosted-zone-id "$ZONE" \
  --query "ResourceRecordSets[?starts_with(Name,'handari.') || starts_with(Name,'_')&&contains(Name,'handari')]" \
  --output json 2>/dev/null || echo '[]')
if [ "$REC" != "[]" ] && [ -n "$REC" ]; then
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] 아래 레코드 삭제"
    echo "$REC" | grep '"Name"' | sed 's/^/    /'
  else
    echo "$REC" | python3 -c "
import json,sys,subprocess
recs=json.load(sys.stdin)
for r in recs:
    batch={'Changes':[{'Action':'DELETE','ResourceRecordSet':r}]}
    subprocess.run(['aws','route53','change-resource-record-sets','--hosted-zone-id','$ZONE',
                    '--change-batch',json.dumps(batch)],capture_output=True)
    print('    삭제:',r['Name'])
"
  fi
else
  echo "  없음"
fi
echo "  ※ tium-care.com 의 다른 레코드는 건드리지 않습니다"

echo
echo "[11] CloudFront 배포 (handari.tium-care.com)"
DIST=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items[0] || '', 'handari')].Id" --output text 2>/dev/null || true)
if [ -n "$DIST" ]; then
  echo "  배포 ID: $DIST"
  if [ "$DRY" = "1" ]; then
    echo "  [dry-run] Disable 후 Delete (전파에 15분 정도 걸립니다)"
  else
    ETAG=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
    aws cloudfront get-distribution-config --id "$DIST" --query DistributionConfig > /tmp/cf-off.json
    python3 -c "
import json; d=json.load(open('/tmp/cf-off.json')); d['Enabled']=False
json.dump(d,open('/tmp/cf-off.json','w'))"
    aws cloudfront update-distribution --id "$DIST" --distribution-config file:///tmp/cf-off.json --if-match "$ETAG" >/dev/null
    echo "    비활성화함. 전파를 기다립니다 (최대 20분)..."
    aws cloudfront wait distribution-deployed --id "$DIST" 2>/dev/null || true
    ETAG2=$(aws cloudfront get-distribution-config --id "$DIST" --query ETag --output text)
    aws cloudfront delete-distribution --id "$DIST" --if-match "$ETAG2" && echo "    삭제 완료"
    rm -f /tmp/cf-off.json
  fi
else
  echo "  없음"
fi

echo
echo "[12] ACM 인증서 (handari.tium-care.com)"
CERT=$(aws acm list-certificates --region us-east-1 \
  --query "CertificateSummaryList[?DomainName=='handari.tium-care.com'].CertificateArn" --output text 2>/dev/null || true)
if [ -n "$CERT" ]; then
  run aws acm delete-certificate --certificate-arn "$CERT" --region us-east-1
else
  echo "  없음"
fi

echo
echo "════════════════════════════════════════════"
echo " 남은 수동 작업 (외부 서비스)"
echo "════════════════════════════════════════════"
cat <<'MANUAL'
  1. GitHub    wally-cho/handari 리포 삭제 또는 archive
               Settings → Secrets 에 등록한 8개도 함께 사라집니다
  2. Docker Hub  chokyumin/handari 리포지토리 삭제
  3. 카카오     developers.kakao.com 에서 한다리 앱 삭제
  4. 로컬       ~/github/handari 디렉터리, devhdr alias

  tium 관련 자원은 하나도 건드리지 않았습니다.
MANUAL
